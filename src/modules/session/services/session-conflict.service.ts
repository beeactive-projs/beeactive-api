import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import { SessionInstance } from '../entities/session-instance.entity';
import { SessionInstanceStatus } from '../entities/session.enums';

/**
 * Non-blocking conflict detection for instructor-owned sessions.
 *
 * Two instances "conflict" when:
 *   - same instructor
 *   - overlapping time interval (instance A's [startAt, endAt] overlaps B's)
 *   - both still SCHEDULED (cancelled / completed instances don't block)
 *
 * The service writes `conflictingInstanceIds` (JSONB) on every affected
 * row symmetrically — A lists B in its array, B lists A in its array.
 * On save, conflicts never block; the booking/edit succeeds and the
 * `warnings` payload surfaces them to the FE.
 *
 * Recompute strategy: on create/edit/reschedule of an instance, we
 * recompute conflicts for THAT instance, then UPDATE the array on
 * each peer (add or remove this id). This keeps the symmetric view
 * authoritative without scanning the whole calendar.
 */
@Injectable()
export class SessionConflictService {
  constructor(
    @InjectModel(SessionInstance)
    private readonly instanceModel: typeof SessionInstance,
  ) {}

  /**
   * Recompute `conflictingInstanceIds` for `instance` (and its peers).
   * Returns the new array of conflicting instance ids for the caller.
   * Always called inside the caller's tx.
   */
  async recomputeFor(
    instance: SessionInstance,
    tx: Transaction,
  ): Promise<string[]> {
    // Find live overlapping siblings of the same instructor.
    // Interval overlap: A.start < B.end AND B.start < A.end.
    const peers = await this.instanceModel.findAll({
      where: {
        id: { [Op.ne]: instance.id },
        instructorId: instance.instructorId,
        status: SessionInstanceStatus.Scheduled,
        startAt: { [Op.lt]: instance.endAt },
        endAt: { [Op.gt]: instance.startAt },
      },
      attributes: ['id', 'conflictingInstanceIds'],
      transaction: tx,
    });
    const newIds = peers.map((p) => p.id);

    // Persist the symmetric view: each peer adds this instance to its
    // own array (idempotent — dedupe with Set).
    for (const peer of peers) {
      const prev = peer.conflictingInstanceIds ?? [];
      if (!prev.includes(instance.id)) {
        const next = [...new Set([...prev, instance.id])];
        await peer.update(
          { conflictingInstanceIds: next },
          { transaction: tx },
        );
      }
    }

    // Also clean up STALE peers — instances that USED to conflict with
    // this one but no longer do (e.g. after a reschedule moves it away).
    if (Array.isArray(instance.conflictingInstanceIds)) {
      const stale = instance.conflictingInstanceIds.filter(
        (id) => !newIds.includes(id),
      );
      if (stale.length > 0) {
        const stalePeers = await this.instanceModel.findAll({
          where: { id: { [Op.in]: stale } },
          attributes: ['id', 'conflictingInstanceIds'],
          transaction: tx,
        });
        for (const peer of stalePeers) {
          const prev = peer.conflictingInstanceIds ?? [];
          const next = prev.filter((id) => id !== instance.id);
          if (next.length !== prev.length) {
            await peer.update(
              { conflictingInstanceIds: next.length > 0 ? next : null },
              { transaction: tx },
            );
          }
        }
      }
    }

    // Persist the caller's own array.
    await instance.update(
      {
        conflictingInstanceIds: newIds.length > 0 ? newIds : null,
      },
      { transaction: tx },
    );

    return newIds;
  }
}
