import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import {
  InstructorClient,
  InstructorClientStatus,
} from '../../client/entities/instructor-client.entity';
import { GroupMember } from '../../group/entities/group-member.entity';
import { SessionParticipant } from '../entities/session-participant.entity';
import {
  SessionAccess,
  SessionParticipantStatus,
} from '../entities/session.enums';
import { SessionInstance } from '../entities/session-instance.entity';
import { SessionTemplate } from '../entities/session-template.entity';

/**
 * Access evaluation for a session instance against a caller.
 *
 * Single source of truth for "can this user view / book this session?".
 * Every read endpoint, every booking endpoint funnels through here so
 * that visibility logic doesn't drift across the module.
 *
 * The four kinds of access (`session_template.access`):
 *   - `OPEN`        — any authenticated user
 *   - `FREE`        — same as OPEN, just a free-vs-paid signal for UI
 *   - `CLIENTS_ONLY`— caller must have an ACTIVE `instructor_client` row
 *                     for `template.instructorId`
 *   - `GROUP_ONLY`  — caller must be a current member of `template.groupId`
 *                     (group_member row with `leftAt IS NULL`)
 *
 * Owners (the instructor themselves) always have full access.
 * Existing participants (any non-terminal status) also have full access
 * to the instance they booked into — they need to see their own booking
 * even after the access rule changes on them.
 *
 * Methods return shape `{ canView, isOwner, isParticipant, isEligible }`:
 *   - `canView` — render the full session detail
 *   - `isOwner` — instructor, can render private notes + participants
 *   - `isParticipant` — already booked, can see their own snapshot
 *   - `isEligible` — could book if seats available (used by FE CTAs)
 */
export interface AccessDecision {
  canView: boolean;
  isOwner: boolean;
  isParticipant: boolean;
  isEligible: boolean;
}

@Injectable()
export class SessionAccessService {
  constructor(
    @InjectModel(InstructorClient)
    private readonly clientModel: typeof InstructorClient,
    @InjectModel(GroupMember)
    private readonly groupMemberModel: typeof GroupMember,
    @InjectModel(SessionParticipant)
    private readonly participantModel: typeof SessionParticipant,
  ) {}

  /**
   * Evaluate access for `caller` against the given `instance` and its
   * eagerly-loaded `template`. The caller is responsible for passing the
   * template; this method does no extra fetches for the access kind itself.
   * It may run up to 2 small indexed queries: one for client relationship,
   * one for group membership, one for participation — each only when needed.
   */
  async evaluate(
    instance: Pick<SessionInstance, 'id' | 'instructorId'>,
    template: Pick<SessionTemplate, 'access' | 'instructorId' | 'groupId'>,
    callerId: string | null,
    tx?: Transaction,
  ): Promise<AccessDecision> {
    const isOwner = !!callerId && callerId === instance.instructorId;
    if (isOwner) {
      return {
        canView: true,
        isOwner: true,
        isParticipant: false,
        isEligible: false,
      };
    }

    const isParticipant = callerId
      ? await this.hasActiveParticipation(instance.id, callerId, tx)
      : false;

    const isEligible = callerId
      ? await this.isEligibleByAccessKind(template, callerId, tx)
      : template.access === SessionAccess.Open ||
        template.access === SessionAccess.Free;

    const canView = isParticipant || isEligible;
    return { canView, isOwner: false, isParticipant, isEligible };
  }

  // ─── helpers ────────────────────────────────────────────────────────

  /**
   * Whether this user was ever on the roster, cancelled bookings included.
   *
   * Distinct from `hasActiveParticipation`, which answers "may they act on
   * this" and so excludes cancelled and declined rows. This answers "were they
   * part of this", which is what deciding whether to show them a session that
   * has already finished or been called off comes down to — their own
   * notification about it should still open.
   */
  async wasEverParticipant(
    instanceId: string,
    userId: string,
    tx?: Transaction,
  ): Promise<boolean> {
    const row = await this.participantModel.findOne({
      where: { instanceId, userId },
      attributes: ['id'],
      transaction: tx,
    });
    return !!row;
  }

  private async hasActiveParticipation(
    instanceId: string,
    userId: string,
    tx?: Transaction,
  ): Promise<boolean> {
    const row = await this.participantModel.findOne({
      where: {
        instanceId,
        userId,
        status: {
          [Op.notIn]: [
            SessionParticipantStatus.Cancelled,
            SessionParticipantStatus.Declined,
          ],
        },
      },
      attributes: ['id'],
      transaction: tx,
    });
    return !!row;
  }

  private async isEligibleByAccessKind(
    template: Pick<SessionTemplate, 'access' | 'instructorId' | 'groupId'>,
    userId: string,
    tx?: Transaction,
  ): Promise<boolean> {
    switch (template.access) {
      case SessionAccess.Open:
      case SessionAccess.Free:
        return true;

      case SessionAccess.ClientsOnly: {
        // FIX (live): the column is `client_id` (attribute `clientId`)
        // — not `userId`. Pulled from instructor_client schema.
        const row = await this.clientModel.findOne({
          where: {
            instructorId: template.instructorId,
            clientId: userId,
            status: InstructorClientStatus.ACTIVE,
          },
          attributes: ['id'],
          transaction: tx,
        });
        return !!row;
      }

      case SessionAccess.GroupOnly: {
        if (!template.groupId) return false;
        const row = await this.groupMemberModel.findOne({
          where: {
            groupId: template.groupId,
            userId,
            leftAt: null,
          },
          attributes: ['id'],
          transaction: tx,
        });
        return !!row;
      }

      default:
        return false;
    }
  }
}
