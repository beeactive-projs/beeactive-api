import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op } from 'sequelize';
import { Session } from './entities/session.entity';
import { SessionParticipant } from './entities/session-participant.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { UpdateParticipantStatusDto } from './dto/update-participant-status.dto';
import { User } from '../user/entities/user.entity';
import { OrganizationMember } from '../organization/entities/organization-member.entity';

/**
 * Session Service
 *
 * Manages training sessions and participant registrations.
 *
 * Visibility rules:
 * - PRIVATE: Only organizer sees it, participants added manually
 * - MEMBERS: All organization members can see and join
 * - PUBLIC: Anyone can see (future marketplace feature)
 */
@Injectable()
export class SessionService {
  constructor(
    @InjectModel(Session)
    private sessionModel: typeof Session,
    @InjectModel(SessionParticipant)
    private participantModel: typeof SessionParticipant,
    @InjectModel(OrganizationMember)
    private memberModel: typeof OrganizationMember,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  // =====================================================
  // SESSION CRUD
  // =====================================================

  /**
   * Create a new session
   */
  async create(userId: string, dto: CreateSessionDto): Promise<Session> {
    // If org-linked, verify user is a member of the organization
    if (dto.organizationId) {
      const isMember = await this.memberModel.findOne({
        where: {
          organizationId: dto.organizationId,
          userId: userId,
          leftAt: null,
        },
      });

      if (!isMember) {
        throw new ForbiddenException(
          'You must be a member of this organization to create sessions',
        );
      }
    }

    // Explicitly map DTO fields (safer than spreading)
    const session = await this.sessionModel.create({
      organizationId: dto.organizationId,
      organizerId: userId,
      title: dto.title,
      description: dto.description,
      sessionType: dto.sessionType,
      visibility: dto.visibility || 'MEMBERS',
      scheduledAt: dto.scheduledAt,
      durationMinutes: dto.durationMinutes,
      location: dto.location,
      maxParticipants: dto.maxParticipants,
      price: dto.price,
      currency: dto.currency || 'RON',
      status: dto.status || 'SCHEDULED',
    });

    this.logger.log(
      `Session created: "${session.title}" by user ${userId}`,
      'SessionService',
    );

    return session;
  }

  /**
   * Get sessions visible to the user (paginated, deduplicated)
   *
   * Returns:
   * - Sessions the user organized
   * - Sessions where visibility=MEMBERS and user is in the same org
   * - Sessions where visibility=PUBLIC
   * - Sessions the user is registered for
   *
   * FIX: Uses Sequelize's group/distinct to prevent duplicates when a session
   * matches multiple OR conditions.
   */
  async getMySessions(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    // Get user's organization IDs
    const memberships = await this.memberModel.findAll({
      where: { userId: userId, leftAt: null },
      attributes: ['organizationId'],
    });
    const orgIds = memberships.map((m) => m.organizationId);

    // Get sessions the user is registered for
    const registrations = await this.participantModel.findAll({
      where: { userId: userId, status: { [Op.ne]: 'CANCELLED' } },
      attributes: ['sessionId'],
    });
    const registeredSessionIds = registrations.map((r) => r.sessionId);

    const offset = (page - 1) * limit;

    const whereClause = {
      [Op.or]: [
        // Sessions I organized
        { organizerId: userId },
        // Sessions in my organizations with MEMBERS/PUBLIC visibility
        ...(orgIds.length > 0
          ? [
              {
                organizationId: { [Op.in]: orgIds },
                visibility: { [Op.in]: ['MEMBERS', 'PUBLIC'] },
              },
            ]
          : []),
        // Sessions I'm registered for
        ...(registeredSessionIds.length > 0
          ? [{ id: { [Op.in]: registeredSessionIds } }]
          : []),
        // Public sessions
        { visibility: 'PUBLIC' },
      ],
    };

    const { rows: sessions, count: totalItems } =
      await this.sessionModel.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: 'organizer',
            attributes: ['id', 'firstName', 'lastName', 'avatarId'],
          },
        ],
        order: [['scheduledAt', 'ASC']],
        limit,
        offset,
        distinct: true, // Prevent duplicate counting from JOINs
        // Sequelize deduplicates by primary key
        // subQuery: false would cause issues here, so we use default
      });

    // Deduplicate sessions by ID (safety net for OR clause overlaps)
    const seen = new Set<string>();
    const uniqueSessions = sessions.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: uniqueSessions,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Get a single session by ID
   */
  async getById(sessionId: string, userId: string): Promise<Session> {
    const session = await this.sessionModel.findByPk(sessionId, {
      include: [
        {
          model: User,
          as: 'organizer',
          attributes: ['id', 'firstName', 'lastName', 'avatarId'],
        },
        {
          model: SessionParticipant,
          include: [
            {
              model: User,
              attributes: ['id', 'firstName', 'lastName', 'avatarId'],
            },
          ],
        },
      ],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Check visibility access
    await this.assertCanViewSession(session, userId);

    return session;
  }

  /**
   * Update a session (organizer only)
   */
  async update(
    sessionId: string,
    userId: string,
    dto: UpdateSessionDto,
  ): Promise<Session> {
    const session = await this.sessionModel.findByPk(sessionId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.organizerId !== userId) {
      throw new ForbiddenException(
        'Only the organizer can update this session',
      );
    }

    await session.update(dto);
    return session;
  }

  /**
   * Delete a session (soft delete, organizer only)
   */
  async delete(sessionId: string, userId: string): Promise<void> {
    const session = await this.sessionModel.findByPk(sessionId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.organizerId !== userId) {
      throw new ForbiddenException(
        'Only the organizer can delete this session',
      );
    }

    await session.destroy(); // Soft delete (paranoid: true)

    this.logger.log(
      `Session deleted: "${session.title}" by user ${userId}`,
      'SessionService',
    );
  }

  // =====================================================
  // PARTICIPANT MANAGEMENT
  // =====================================================

  /**
   * Join a session (register as participant)
   */
  async joinSession(
    sessionId: string,
    userId: string,
  ): Promise<SessionParticipant> {
    const session = await this.sessionModel.findByPk(sessionId, {
      include: [SessionParticipant],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Check visibility access
    await this.assertCanViewSession(session, userId);

    // Cannot join own session
    if (session.organizerId === userId) {
      throw new BadRequestException('You cannot join your own session');
    }

    // Check if already registered
    const existing = await this.participantModel.findOne({
      where: { sessionId: sessionId, userId: userId },
    });

    if (existing && existing.status !== 'CANCELLED') {
      throw new BadRequestException(
        'You are already registered for this session',
      );
    }

    // Check capacity
    if (session.maxParticipants) {
      const activeCount = session.participants.filter(
        (p) => !['CANCELLED', 'NO_SHOW'].includes(p.status),
      ).length;

      if (activeCount >= session.maxParticipants) {
        throw new BadRequestException('Session is full');
      }
    }

    // If previously cancelled, reactivate
    if (existing && existing.status === 'CANCELLED') {
      await existing.update({ status: 'REGISTERED', checkedInAt: null });
      return existing;
    }

    return this.participantModel.create({
      sessionId: sessionId,
      userId: userId,
      status: 'REGISTERED',
    });
  }

  /**
   * Leave a session (cancel registration)
   */
  async leaveSession(sessionId: string, userId: string): Promise<void> {
    const participant = await this.participantModel.findOne({
      where: {
        sessionId: sessionId,
        userId: userId,
        status: { [Op.ne]: 'CANCELLED' },
      },
    });

    if (!participant) {
      throw new NotFoundException('You are not registered for this session');
    }

    await participant.update({ status: 'CANCELLED' });
  }

  /**
   * Update participant status (organizer only — e.g., check-in, mark attendance)
   */
  async updateParticipantStatus(
    sessionId: string,
    participantUserId: string,
    organizerUserId: string,
    dto: UpdateParticipantStatusDto,
  ): Promise<SessionParticipant> {
    const session = await this.sessionModel.findByPk(sessionId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.organizerId !== organizerUserId) {
      throw new ForbiddenException(
        'Only the organizer can update participant status',
      );
    }

    const participant = await this.participantModel.findOne({
      where: { sessionId: sessionId, userId: participantUserId },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    const updateData: any = { status: dto.status };

    // Auto-set checkedInAt when marking as ATTENDED
    if (dto.status === 'ATTENDED' && !participant.checkedInAt) {
      updateData.checkedInAt = new Date();
    }

    await participant.update(updateData);
    return participant;
  }

  // =====================================================
  // HELPERS
  // =====================================================

  /**
   * Check if user can view a session based on visibility rules
   */
  private async assertCanViewSession(
    session: Session,
    userId: string,
  ): Promise<void> {
    // Organizer can always see their own sessions
    if (session.organizerId === userId) return;

    // Public sessions are visible to everyone
    if (session.visibility === 'PUBLIC') return;

    // MEMBERS: user must be in the same organization
    if (session.visibility === 'MEMBERS' && session.organizationId) {
      const isMember = await this.memberModel.findOne({
        where: {
          organizationId: session.organizationId,
          userId: userId,
          leftAt: null,
        },
      });

      if (isMember) return;
    }

    // PRIVATE: user must be a registered participant
    const isParticipant = await this.participantModel.findOne({
      where: {
        sessionId: session.id,
        userId: userId,
        status: { [Op.ne]: 'CANCELLED' },
      },
    });

    if (isParticipant) return;

    throw new ForbiddenException('You do not have access to this session');
  }
}
