import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Op } from 'sequelize';

import { InstructorClient } from '../client/entities/instructor-client.entity';
import { Group } from '../group/entities/group.entity';
import { GroupMember } from '../group/entities/group-member.entity';
import { InstructorProfile } from '../profile/entities/instructor-profile.entity';
import { SessionInstance } from '../session/entities/session-instance.entity';
import { SessionParticipant } from '../session/entities/session-participant.entity';
import {
  SessionInstanceStatus,
  SessionParticipantStatus,
} from '../session/entities/session.enums';
import { User } from '../user/entities/user.entity';
import { AnalyticsService } from './analytics.service';

/**
 * Smoke tests for AnalyticsService — covers the FE-visible behaviours:
 *   - Constructor wiring (DI boots).
 *   - getInstructorSummary: forbids non-instructors; empty-data shape
 *     returns zeros (never nulls); a seeded happy path sums correctly;
 *     attendance rate skipped when there are no completed sessions.
 *   - getUserActivity: empty-data shape (zeros, attendanceRate=0); seeded
 *     happy path returns the documented attendance ratio.
 *   - getPlatformStats: empty-data shape; counts are wired through.
 *
 * InstructorProfile is used statically inside the service (not injected),
 * so its static `findOne` / `count` are stubbed with jest.spyOn.
 */
describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const sessionModel = {
    count: jest.fn(),
    findAll: jest.fn(),
  };
  const participantModel = {
    count: jest.fn(),
  };
  const groupModel = {
    findAll: jest.fn(),
    count: jest.fn(),
  };
  const memberModel = {
    count: jest.fn(),
  };
  const clientModel = {
    count: jest.fn(),
  };
  const userModel = {
    count: jest.fn(),
  };

  let profileFindOneSpy: jest.SpyInstance;
  let profileCountSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();

    // InstructorProfile is consulted via static methods (not injected),
    // so we spy on the model class directly.
    profileFindOneSpy = jest
      .spyOn(InstructorProfile, 'findOne')
      .mockResolvedValue(null);
    profileCountSpy = jest
      .spyOn(InstructorProfile, 'count')
      .mockResolvedValue(0);

    const module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getModelToken(SessionInstance), useValue: sessionModel },
        {
          provide: getModelToken(SessionParticipant),
          useValue: participantModel,
        },
        { provide: getModelToken(Group), useValue: groupModel },
        { provide: getModelToken(GroupMember), useValue: memberModel },
        { provide: getModelToken(InstructorClient), useValue: clientModel },
        { provide: getModelToken(User), useValue: userModel },
      ],
    }).compile();
    service = module.get(AnalyticsService);
  });

  afterEach(() => {
    profileFindOneSpy.mockRestore();
    profileCountSpy.mockRestore();
  });

  // ───── constructor ────────────────────────────────────────────────

  it('boots with all six injected models', () => {
    expect(service).toBeDefined();
  });

  // ───── getInstructorSummary ───────────────────────────────────────

  describe('getInstructorSummary', () => {
    it('rejects non-instructors with 403 (and never touches the data models)', async () => {
      profileFindOneSpy.mockResolvedValueOnce(null);

      await expect(
        service.getInstructorSummary('not-an-instructor'),
      ).rejects.toThrow(ForbiddenException);

      expect(sessionModel.count).not.toHaveBeenCalled();
      expect(clientModel.count).not.toHaveBeenCalled();
      expect(groupModel.findAll).not.toHaveBeenCalled();
    });

    it('returns the documented shape with zeros on empty data', async () => {
      profileFindOneSpy.mockResolvedValueOnce({ userId: 'inst-1' });
      // totalSessions, completedSessions, cancelledSessions, totalClients,
      // activeClients each resolve to 0.
      sessionModel.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      clientModel.count
        .mockResolvedValueOnce(0) // total
        .mockResolvedValueOnce(0) // active
        .mockResolvedValueOnce(0); // new (last)
      groupModel.findAll.mockResolvedValueOnce([]);

      const out = await service.getInstructorSummary('inst-1');

      expect(out).toEqual({
        period: 'last_30_days',
        sessions: {
          total: 0,
          completed: 0,
          cancelled: 0,
          averageAttendanceRate: 0,
        },
        clients: { total: 0, active: 0, new: 0 },
        groups: { total: 0, totalMembers: 0 },
      });
      // Branch: zero completed → the follow-up findAll/participant queries
      // are skipped.
      expect(sessionModel.findAll).not.toHaveBeenCalled();
      expect(participantModel.count).not.toHaveBeenCalled();
    });

    it('30-day window: each session/client count is filtered by createdAt >= now-30d', async () => {
      profileFindOneSpy.mockResolvedValueOnce({ userId: 'inst-1' });
      sessionModel.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      clientModel.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      groupModel.findAll.mockResolvedValueOnce([]);

      await service.getInstructorSummary('inst-1');

      // First sessionModel.count call carries an Op.gte on createdAt.
      const totalSessionsArgs = sessionModel.count.mock.calls[0][0] as {
        where: Record<string, unknown> & {
          createdAt: Record<symbol, Date>;
        };
      };
      const cutoff = totalSessionsArgs.where.createdAt[Op.gte];
      expect(cutoff).toBeInstanceOf(Date);
      const ageMs = Date.now() - cutoff.getTime();
      // Should be ~30 days (allow generous slack for slow CI).
      expect(ageMs).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
      expect(ageMs).toBeLessThan(31 * 24 * 60 * 60 * 1000);
    });

    it('happy path: sums group members and computes attendance rate', async () => {
      profileFindOneSpy.mockResolvedValueOnce({ userId: 'inst-1' });
      // 5 total / 3 completed / 1 cancelled
      sessionModel.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1);
      // 10 total clients / 7 active
      clientModel.count.mockResolvedValueOnce(10).mockResolvedValueOnce(7);
      // 2 groups, member counts 4 and 6 → totalMembers = 10
      groupModel.findAll.mockResolvedValueOnce([
        { getDataValue: (_k: string) => 4 },
        { getDataValue: (_k: string) => 6 },
      ]);
      // For attendance branch: completed session ids, then participant counts.
      sessionModel.findAll.mockResolvedValueOnce([
        { id: 's1' },
        { id: 's2' },
        { id: 's3' },
      ]);
      participantModel.count
        .mockResolvedValueOnce(20) // confirmed total
        .mockResolvedValueOnce(15); // attended → 0.75
      // newClients (last clientModel.count call)
      clientModel.count.mockResolvedValueOnce(2);

      const out = await service.getInstructorSummary('inst-1');

      expect(out.sessions).toEqual({
        total: 5,
        completed: 3,
        cancelled: 1,
        averageAttendanceRate: 0.75,
      });
      expect(out.clients).toEqual({ total: 10, active: 7, new: 2 });
      expect(out.groups).toEqual({ total: 2, totalMembers: 10 });

      // Attended-vs-confirmed query was scoped to the right session ids.
      const attendedCall = participantModel.count.mock.calls[1][0] as {
        where: { instanceId: Record<symbol, string[]>; attended: boolean };
      };
      expect(attendedCall.where.instanceId[Op.in]).toEqual(['s1', 's2', 's3']);
      expect(attendedCall.where.attended).toBe(true);

      // Sanity: the active-client filter still pins status=ACTIVE.
      const activeClientsCall = clientModel.count.mock.calls[1][0] as {
        where: { instructorId: string; status: string };
      };
      expect(activeClientsCall.where).toEqual({
        instructorId: 'inst-1',
        status: 'ACTIVE',
      });

      // Completed-session filter passes the canonical enum value.
      const completedCall = sessionModel.count.mock.calls[1][0] as {
        where: { status: string };
      };
      expect(completedCall.where.status).toBe(SessionInstanceStatus.Completed);
    });

    it('attendance rate stays 0 when confirmed participants is 0 (no divide-by-zero)', async () => {
      profileFindOneSpy.mockResolvedValueOnce({ userId: 'inst-1' });
      sessionModel.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1) // completed > 0 → enters branch
        .mockResolvedValueOnce(0);
      clientModel.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      groupModel.findAll.mockResolvedValueOnce([]);
      sessionModel.findAll.mockResolvedValueOnce([{ id: 's1' }]);
      participantModel.count
        .mockResolvedValueOnce(0) // confirmed
        .mockResolvedValueOnce(0); // attended
      clientModel.count.mockResolvedValueOnce(0);

      const out = await service.getInstructorSummary('inst-1');
      expect(out.sessions.averageAttendanceRate).toBe(0);
    });
  });

  // ───── getUserActivity ────────────────────────────────────────────

  describe('getUserActivity', () => {
    it('returns the documented shape with zeros on empty data', async () => {
      participantModel.count
        .mockResolvedValueOnce(0) // attended
        .mockResolvedValueOnce(0) // upcoming
        .mockResolvedValueOnce(0); // noShow
      memberModel.count.mockResolvedValueOnce(0);

      const out = await service.getUserActivity('user-1');

      expect(out).toEqual({
        period: 'last_30_days',
        sessions: { attended: 0, upcoming: 0, noShow: 0, attendanceRate: 0 },
        groups: { memberOf: 0 },
      });
    });

    it('computes attendanceRate = attended / (attended + noShow), rounded to 2dp', async () => {
      participantModel.count
        .mockResolvedValueOnce(8) // attended
        .mockResolvedValueOnce(5) // upcoming (Confirmed | PendingApproval)
        .mockResolvedValueOnce(2); // noShow → 8 / (8+2) = 0.8
      memberModel.count.mockResolvedValueOnce(3);

      const out = await service.getUserActivity('user-1');

      expect(out.sessions).toEqual({
        attended: 8,
        upcoming: 5,
        noShow: 2,
        attendanceRate: 0.8,
      });
      expect(out.groups.memberOf).toBe(3);

      // The "upcoming" filter must use Op.in on Confirmed + PendingApproval.
      const upcomingCall = participantModel.count.mock.calls[1][0] as {
        where: { status: Record<symbol, string[]> };
      };
      expect(upcomingCall.where.status[Op.in]).toEqual([
        SessionParticipantStatus.Confirmed,
        SessionParticipantStatus.PendingApproval,
      ]);

      // memberOf filters leftAt IS NULL (active membership only).
      const memberCall = memberModel.count.mock.calls[0][0] as {
        where: { userId: string; leftAt: null };
      };
      expect(memberCall.where).toEqual({ userId: 'user-1', leftAt: null });
    });
  });

  // ───── getPlatformStats ───────────────────────────────────────────

  describe('getPlatformStats', () => {
    it('returns the documented shape with zeros on empty data', async () => {
      userModel.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      profileCountSpy.mockResolvedValueOnce(0);
      groupModel.count.mockResolvedValueOnce(0);
      sessionModel.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const out = await service.getPlatformStats();

      expect(out).toEqual({
        users: { total: 0, active: 0 },
        instructors: { total: 0 },
        groups: { total: 0 },
        sessions: { total: 0, completed: 0 },
      });
    });

    it('wires counts through and filters active users + completed sessions', async () => {
      userModel.count.mockResolvedValueOnce(100).mockResolvedValueOnce(80);
      profileCountSpy.mockResolvedValueOnce(12);
      groupModel.count.mockResolvedValueOnce(7);
      sessionModel.count.mockResolvedValueOnce(40).mockResolvedValueOnce(25);

      const out = await service.getPlatformStats();

      expect(out).toEqual({
        users: { total: 100, active: 80 },
        instructors: { total: 12 },
        groups: { total: 7 },
        sessions: { total: 40, completed: 25 },
      });

      // active users → where: { isActive: true }
      const activeCall = userModel.count.mock.calls[1][0] as {
        where: { isActive: boolean };
      };
      expect(activeCall.where).toEqual({ isActive: true });

      // completed sessions → where: { status: COMPLETED }
      const completedCall = sessionModel.count.mock.calls[1][0] as {
        where: { status: string };
      };
      expect(completedCall.where).toEqual({
        status: SessionInstanceStatus.Completed,
      });
    });
  });
});
