import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { MessagingModerationService } from './messaging-moderation.service';
import { AdminMessageAccessLog } from './entities/admin-message-access-log.entity';
import { Conversation, ConversationType } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Message, MessageKind } from './entities/message.entity';
import {
  MessageReport,
  MessageReportCategory,
  MessageReportStatus,
} from './entities/message-report.entity';
import { MessagingSuspension } from './entities/messaging-suspension.entity';
import { MessagingVelocityAlarm } from './entities/messaging-velocity-alarm.entity';
import { User } from '../user/entities/user.entity';
import { makeSilentLogger } from '../../../test/helpers/sequelize-mocks';

interface Mock {
  findOne: jest.Mock;
  findAll: jest.Mock;
  findByPk: jest.Mock;
  findAndCountAll: jest.Mock;
  create: jest.Mock;
}

function makeMock(): Mock {
  return {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
  };
}

describe('MessagingModerationService — Stage 4', () => {
  let service: MessagingModerationService;
  let reportModel: Mock;
  let suspensionModel: Mock;
  let accessLogModel: Mock;
  let conversationModel: Mock;
  let messageModel: Mock;
  let velocityAlarmModel: Mock;
  let participantModel: Mock;
  let userFindByPkSpy: jest.SpyInstance;

  const sequelize = {
    transaction: jest.fn(
      async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => cb({}),
    ),
  };

  beforeEach(async () => {
    sequelize.transaction.mockClear();

    reportModel = makeMock();
    suspensionModel = makeMock();
    accessLogModel = makeMock();
    conversationModel = makeMock();
    messageModel = makeMock();
    velocityAlarmModel = makeMock();
    participantModel = makeMock();
    // Default: the reporter IS an active participant of whatever
    // conversation the test references. Specific tests override
    // with `findOne.mockResolvedValueOnce(null)` to assert the
    // not-a-participant 404 path.
    participantModel.findOne.mockResolvedValue({ id: 'p-mock' });

    userFindByPkSpy = jest.spyOn(User, 'findByPk');

    const module = await Test.createTestingModule({
      providers: [
        MessagingModerationService,
        { provide: getModelToken(MessageReport), useValue: reportModel },
        {
          provide: getModelToken(MessagingSuspension),
          useValue: suspensionModel,
        },
        {
          provide: getModelToken(AdminMessageAccessLog),
          useValue: accessLogModel,
        },
        { provide: getModelToken(Conversation), useValue: conversationModel },
        { provide: getModelToken(Message), useValue: messageModel },
        {
          provide: getModelToken(MessagingVelocityAlarm),
          useValue: velocityAlarmModel,
        },
        {
          provide: getModelToken(ConversationParticipant),
          useValue: participantModel,
        },
        {
          provide: (await import('sequelize-typescript')).Sequelize,
          useValue: sequelize,
        },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();

    service = module.get(MessagingModerationService);
  });

  afterEach(() => {
    userFindByPkSpy.mockRestore();
  });

  // ─────────────────────────── submitReport ───────────────────────────

  describe('submitReport', () => {
    const reporter = 'reporter-id';
    const sender = 'sender-id';

    it('400 when neither messageId nor conversationId provided', async () => {
      await expect(
        service.submitReport(reporter, {
          category: MessageReportCategory.SPAM,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 when messageId points to a missing message', async () => {
      messageModel.findByPk.mockResolvedValue(null);
      await expect(
        service.submitReport(reporter, {
          messageId: 'm-x',
          category: MessageReportCategory.SPAM,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('400 when reporting a system message (no sender)', async () => {
      messageModel.findByPk.mockResolvedValue({
        id: 'm-1',
        senderId: null,
        conversationId: 'c-1',
      });
      await expect(
        service.submitReport(reporter, {
          messageId: 'm-1',
          category: MessageReportCategory.OTHER,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400 when user tries to report their own message', async () => {
      messageModel.findByPk.mockResolvedValue({
        id: 'm-1',
        senderId: reporter,
        conversationId: 'c-1',
      });
      await expect(
        service.submitReport(reporter, {
          messageId: 'm-1',
          category: MessageReportCategory.OTHER,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('409 when the same reporter has an OPEN report against the same target+convo', async () => {
      messageModel.findByPk.mockResolvedValue({
        id: 'm-1',
        senderId: sender,
        conversationId: 'c-1',
      });
      reportModel.findOne.mockResolvedValue({ id: 'existing-open' });

      await expect(
        service.submitReport(reporter, {
          messageId: 'm-1',
          category: MessageReportCategory.SPAM,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(reportModel.create).not.toHaveBeenCalled();
    });

    it('happy path: creates an OPEN report', async () => {
      messageModel.findByPk.mockResolvedValue({
        id: 'm-1',
        senderId: sender,
        conversationId: 'c-1',
      });
      reportModel.findOne.mockResolvedValue(null);
      reportModel.create.mockResolvedValue({
        id: 'r-1',
        status: MessageReportStatus.OPEN,
      });

      const result = await service.submitReport(reporter, {
        messageId: 'm-1',
        category: MessageReportCategory.SCAM,
        notes: 'asked me to pay via PayPal',
      });

      expect(reportModel.create).toHaveBeenCalledWith({
        reporterId: reporter,
        reportedUserId: sender,
        messageId: 'm-1',
        conversationId: 'c-1',
        category: MessageReportCategory.SCAM,
        notes: 'asked me to pay via PayPal',
        status: MessageReportStatus.OPEN,
      });
      expect(result.id).toBe('r-1');
    });

    it('messageId path: 404 when the reporter is NOT a participant of the conversation', async () => {
      // Regression for the BE-C2 audit finding: without a participant
      // gate, anyone with a valid messageId UUID could file reports
      // against the sender, an abuse + DoS vector.
      messageModel.findByPk.mockResolvedValue({
        id: 'm-1',
        senderId: sender,
        conversationId: 'c-1',
      });
      participantModel.findOne.mockResolvedValueOnce(null); // not a participant

      await expect(
        service.submitReport(reporter, {
          messageId: 'm-1',
          category: MessageReportCategory.SPAM,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(reportModel.create).not.toHaveBeenCalled();
    });

    it('conversationId path: 404 when reporter is not in the conversation', async () => {
      // Same gate via the alternate path. The reporter is NOT in the
      // returned participants array → 404 (not 403) so we don't leak
      // existence.
      conversationModel.findByPk.mockResolvedValue({
        id: 'c-1',
        type: ConversationType.DIRECT,
        participants: [
          { userId: 'other-a', leftAt: null },
          { userId: 'other-b', leftAt: null },
        ],
      });

      await expect(
        service.submitReport(reporter, {
          conversationId: 'c-1',
          category: MessageReportCategory.HARASSMENT,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(reportModel.create).not.toHaveBeenCalled();
    });

    it('conversation-id path: picks the other DIRECT participant as the target', async () => {
      conversationModel.findByPk.mockResolvedValue({
        id: 'c-1',
        type: ConversationType.DIRECT,
        participants: [
          { userId: reporter, leftAt: null },
          { userId: sender, leftAt: null },
        ],
      });
      reportModel.findOne.mockResolvedValue(null);
      reportModel.create.mockResolvedValue({ id: 'r-2' });

      await service.submitReport(reporter, {
        conversationId: 'c-1',
        category: MessageReportCategory.HARASSMENT,
      });

      expect(reportModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reporterId: reporter,
          reportedUserId: sender,
          messageId: null,
          conversationId: 'c-1',
        }),
      );
    });

    it('refuses conversation-id reports for GROUP — needs a specific message', async () => {
      conversationModel.findByPk.mockResolvedValue({
        id: 'c-1',
        type: ConversationType.GROUP,
        participants: [{ userId: reporter, leftAt: null }],
      });
      await expect(
        service.submitReport(reporter, {
          conversationId: 'c-1',
          category: MessageReportCategory.SPAM,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─────────────────────────── resolveReport transitions ─────────────

  describe('resolveReport transitions', () => {
    function reportRow(status: MessageReportStatus) {
      return {
        id: 'r-1',
        status,
        resolutionNotes: null,
        resolvedById: null,
        resolvedAt: null,
        update: jest.fn().mockImplementation(function (
          this: { status: MessageReportStatus },
          patch: Partial<MessageReport>,
        ) {
          Object.assign(this, patch);
          return Promise.resolve(this);
        }),
      };
    }

    it('OPEN → REVIEWING is allowed (intermediate, not yet terminal)', async () => {
      const row = reportRow(MessageReportStatus.OPEN);
      reportModel.findByPk.mockResolvedValue(row);
      await service.resolveReport(
        'admin',
        'r-1',
        MessageReportStatus.REVIEWING,
      );
      // Not yet terminal — resolvedById/At should NOT be set on this
      // transition.
      expect(row.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: MessageReportStatus.REVIEWING,
          resolvedById: null,
          resolvedAt: null,
        }),
      );
    });

    it('OPEN → RESOLVED sets resolvedById + resolvedAt + notes', async () => {
      const row = reportRow(MessageReportStatus.OPEN);
      reportModel.findByPk.mockResolvedValue(row);
      await service.resolveReport(
        'admin-1',
        'r-1',
        MessageReportStatus.RESOLVED,
        'looked, suspended user',
      );
      expect(row.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: MessageReportStatus.RESOLVED,
          resolvedById: 'admin-1',
          resolutionNotes: 'looked, suspended user',
          resolvedAt: expect.any(Date),
        }),
      );
    });

    it('cannot transition to OPEN (no reopening)', async () => {
      reportModel.findByPk.mockResolvedValue(
        reportRow(MessageReportStatus.REVIEWING),
      );
      await expect(
        service.resolveReport('admin', 'r-1', MessageReportStatus.OPEN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cannot transition out of RESOLVED (terminal)', async () => {
      reportModel.findByPk.mockResolvedValue(
        reportRow(MessageReportStatus.RESOLVED),
      );
      await expect(
        service.resolveReport('admin', 'r-1', MessageReportStatus.DISMISSED),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cannot transition out of DISMISSED (terminal)', async () => {
      reportModel.findByPk.mockResolvedValue(
        reportRow(MessageReportStatus.DISMISSED),
      );
      await expect(
        service.resolveReport('admin', 'r-1', MessageReportStatus.RESOLVED),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400 when transitioning to the same state (no-op)', async () => {
      reportModel.findByPk.mockResolvedValue(
        reportRow(MessageReportStatus.REVIEWING),
      );
      await expect(
        service.resolveReport('admin', 'r-1', MessageReportStatus.REVIEWING),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 when report does not exist', async () => {
      reportModel.findByPk.mockResolvedValue(null);
      await expect(
        service.resolveReport('admin', 'r-1', MessageReportStatus.RESOLVED),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─────────────────────────── readConversationForModeration ─────────

  describe('readConversationForModeration (audit log)', () => {
    it('404 when conversation does not exist', async () => {
      conversationModel.findByPk.mockResolvedValue(null);
      await expect(
        service.readConversationForModeration('admin', 'c-x', {
          reason: 'reviewing report',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(accessLogModel.create).not.toHaveBeenCalled();
    });

    it('400 when relatedReportId does not exist', async () => {
      conversationModel.findByPk.mockResolvedValue({ id: 'c-1' });
      reportModel.findByPk.mockResolvedValue(null);
      await expect(
        service.readConversationForModeration('admin', 'c-1', {
          reason: 'reviewing report',
          relatedReportId: 'r-x',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(accessLogModel.create).not.toHaveBeenCalled();
    });

    it('writes exactly one access log row with the reason + relatedReportId', async () => {
      conversationModel.findByPk.mockResolvedValue({ id: 'c-1' });
      reportModel.findByPk.mockResolvedValue({ id: 'r-1' });
      accessLogModel.create.mockResolvedValue({ id: 'log-1' });
      messageModel.findAll.mockResolvedValue([
        {
          id: 'm-1',
          conversationId: 'c-1',
          senderId: 'u',
          kind: MessageKind.TEXT,
          body: 'hi',
          deletedAt: null,
          createdAt: new Date(),
        },
      ]);

      const result = await service.readConversationForModeration(
        'admin-1',
        'c-1',
        { reason: 'investigating SPAM report', relatedReportId: 'r-1' },
      );

      expect(accessLogModel.create).toHaveBeenCalledTimes(1);
      expect(accessLogModel.create).toHaveBeenCalledWith(
        {
          adminUserId: 'admin-1',
          conversationId: 'c-1',
          relatedReportId: 'r-1',
          reason: 'investigating SPAM report',
        },
        expect.objectContaining({ transaction: expect.anything() }),
      );
      expect(result.accessLogId).toBe('log-1');
      expect(result.items).toHaveLength(1);
    });

    it('audit log + message read happen in the SAME transaction', async () => {
      conversationModel.findByPk.mockResolvedValue({ id: 'c-1' });
      accessLogModel.create.mockResolvedValue({ id: 'log-1' });
      messageModel.findAll.mockResolvedValue([]);

      await service.readConversationForModeration('admin-1', 'c-1', {
        reason: 'audit drill',
      });

      // Both ORM calls received the same `transaction` token.
      const txArgFromLog = accessLogModel.create.mock.calls[0][1]
        ?.transaction as unknown;
      const txArgFromRead = messageModel.findAll.mock.calls[0][0]
        ?.transaction as unknown;
      expect(txArgFromLog).toBe(txArgFromRead);
    });

    it('renders deleted messages with the tombstone, not the raw body', async () => {
      conversationModel.findByPk.mockResolvedValue({ id: 'c-1' });
      accessLogModel.create.mockResolvedValue({ id: 'log-1' });
      messageModel.findAll.mockResolvedValue([
        {
          id: 'm-1',
          conversationId: 'c-1',
          senderId: 'u',
          kind: MessageKind.TEXT,
          body: 'orig',
          deletedAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      const result = await service.readConversationForModeration(
        'admin',
        'c-1',
        { reason: 'review' },
      );

      expect(result.items[0].body).toBe('[deleted]');
    });
  });

  // ─────────────────────────── suspend / lift ─────────────────────────

  describe('suspend / lift', () => {
    it('400 when admin tries to suspend themselves', async () => {
      await expect(
        service.suspend('admin-1', {
          userId: 'admin-1',
          reason: 'why not',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 when target user does not exist', async () => {
      userFindByPkSpy.mockResolvedValue(null);
      await expect(
        service.suspend('admin-1', {
          userId: 'unknown',
          reason: 'reported',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('400 when expiresAtIso is in the past', async () => {
      userFindByPkSpy.mockResolvedValue({ id: 'u' });
      await expect(
        service.suspend('admin', {
          userId: 'u',
          reason: 'r',
          expiresAtIso: '2000-01-01T00:00:00Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400 when expiresAtIso is malformed', async () => {
      userFindByPkSpy.mockResolvedValue({ id: 'u' });
      await expect(
        service.suspend('admin', {
          userId: 'u',
          reason: 'r',
          expiresAtIso: 'nope',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('409 when an active suspension already exists', async () => {
      userFindByPkSpy.mockResolvedValue({ id: 'u' });
      suspensionModel.findOne.mockResolvedValue({ id: 'existing' });
      await expect(
        service.suspend('admin', { userId: 'u', reason: 'r' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('happy path: creates indefinite suspension when expiresAtIso omitted', async () => {
      userFindByPkSpy.mockResolvedValue({ id: 'u' });
      suspensionModel.findOne.mockResolvedValue(null);
      suspensionModel.create.mockResolvedValue({
        id: 's-1',
        userId: 'u',
        expiresAt: null,
      });

      const result = await service.suspend('admin-1', {
        userId: 'u',
        reason: 'spam',
      });

      expect(suspensionModel.create).toHaveBeenCalledWith({
        userId: 'u',
        appliedById: 'admin-1',
        reason: 'spam',
        expiresAt: null,
      });
      expect(result.id).toBe('s-1');
    });

    it('lift: 404 when suspension does not exist', async () => {
      suspensionModel.findByPk.mockResolvedValue(null);
      await expect(service.lift('admin', 's-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lift: 400 when already lifted', async () => {
      suspensionModel.findByPk.mockResolvedValue({
        id: 's-1',
        liftedAt: new Date(),
        update: jest.fn(),
      });
      await expect(service.lift('admin', 's-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('lift: sets liftedAt and liftedById', async () => {
      const update = jest.fn().mockResolvedValue(undefined);
      suspensionModel.findByPk.mockResolvedValue({
        id: 's-1',
        liftedAt: null,
        update,
      });
      await service.lift('admin-1', 's-1');
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          liftedAt: expect.any(Date),
          liftedById: 'admin-1',
        }),
      );
    });
  });

  // ─────────────────────────── velocity alarms ─────────────────────────

  describe('velocity alarms', () => {
    it('listVelocityAlarms defaults to unreviewed', async () => {
      velocityAlarmModel.findAndCountAll.mockResolvedValue({
        rows: [],
        count: 0,
      });
      await service.listVelocityAlarms(1, 20, false);
      expect(velocityAlarmModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { reviewedAt: null },
        }),
      );
    });

    it('listVelocityAlarms with includeReviewed=true drops the filter', async () => {
      velocityAlarmModel.findAndCountAll.mockResolvedValue({
        rows: [],
        count: 0,
      });
      await service.listVelocityAlarms(1, 20, true);
      expect(velocityAlarmModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('reviewVelocityAlarm: 404 when alarm does not exist', async () => {
      velocityAlarmModel.findByPk.mockResolvedValue(null);
      await expect(
        service.reviewVelocityAlarm('admin', 'a-x'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reviewVelocityAlarm: 400 when already reviewed', async () => {
      velocityAlarmModel.findByPk.mockResolvedValue({
        id: 'a-1',
        reviewedAt: new Date(),
      });
      await expect(
        service.reviewVelocityAlarm('admin', 'a-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reviewVelocityAlarm: sets reviewedAt + reviewedById', async () => {
      const update = jest.fn().mockResolvedValue(undefined);
      velocityAlarmModel.findByPk.mockResolvedValue({
        id: 'a-1',
        reviewedAt: null,
        update,
      });
      await service.reviewVelocityAlarm('admin-1', 'a-1');
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewedAt: expect.any(Date),
          reviewedById: 'admin-1',
        }),
      );
    });
  });
});
