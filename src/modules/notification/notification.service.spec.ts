import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import { Sequelize } from 'sequelize-typescript';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { NotificationService, NotificationType } from './notification.service';
import {
  Notification,
  NotificationAudienceType,
  NotificationSeverity,
} from './entities/notification.entity';
import { NotificationReceipt } from './entities/notification-receipt.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { User } from '../user/entities/user.entity';
import { EmailService } from '../../common/services/email.service';
import {
  fakeTx,
  makeModelMock,
  makeSequelizeMock,
  makeSilentLogger,
  type ModelMock,
} from '../../../test/helpers/sequelize-mocks';

type ReceiptStub = {
  id: string;
  notificationId: string;
  userId: string;
  deliveredAt: Date | null;
  deliveredChannels: Record<string, string>;
  save: jest.Mock;
};

type NotificationStub = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: { screen: string; entityId?: string } | null;
  severity: NotificationSeverity;
  audienceType: NotificationAudienceType;
  audienceId: string | null;
  fingerprint: string | null;
};

function makeNotificationRow(
  overrides: Partial<NotificationStub> = {},
): NotificationStub {
  return {
    id: 'notif-1',
    type: NotificationType.INVOICE_PAID,
    title: 'Invoice paid',
    body: 'Your invoice was paid',
    data: { screen: 'invoice', entityId: 'inv-9' },
    severity: NotificationSeverity.INFO,
    audienceType: NotificationAudienceType.USER,
    audienceId: 'user-1',
    fingerprint: null,
    ...overrides,
  };
}

function makeReceiptRow(overrides: Partial<ReceiptStub> = {}): ReceiptStub {
  return {
    id: 'receipt-1',
    notificationId: 'notif-1',
    userId: 'user-1',
    deliveredAt: new Date(),
    deliveredChannels: {},
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('NotificationService', () => {
  let service: NotificationService;
  let notificationModel: ModelMock;
  let receiptModel: ModelMock & { findOrCreate: jest.Mock };
  let preferenceModel: ModelMock;
  let userModel: ModelMock;
  let emailService: { sendNotificationEmail: jest.Mock };
  let configMock: { get: jest.Mock };

  beforeEach(async () => {
    notificationModel = makeModelMock();
    receiptModel = Object.assign(makeModelMock(), {
      findOrCreate: jest.fn(),
    });
    preferenceModel = makeModelMock();
    userModel = makeModelMock();
    emailService = {
      sendNotificationEmail: jest.fn().mockResolvedValue({ ok: true }),
    };
    configMock = {
      get: jest.fn((key: string) =>
        key === 'FRONTEND_URL' ? 'http://app.test' : undefined,
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getModelToken(Notification), useValue: notificationModel },
        { provide: getModelToken(NotificationReceipt), useValue: receiptModel },
        {
          provide: getModelToken(NotificationPreference),
          useValue: preferenceModel,
        },
        { provide: getModelToken(User), useValue: userModel },
        { provide: Sequelize, useValue: makeSequelizeMock() },
        { provide: EmailService, useValue: emailService },
        { provide: ConfigService, useValue: configMock },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();

    service = moduleRef.get(NotificationService);
  });

  describe('notify (single user)', () => {
    it('creates a notification + receipt and delivers in-app + email', async () => {
      const notif = makeNotificationRow();
      notificationModel.findOne.mockResolvedValue(null);
      notificationModel.create.mockResolvedValue(notif);
      preferenceModel.findAll.mockResolvedValue([]);
      userModel.findAll.mockResolvedValue([
        { id: 'user-1', email: 'u1@test.io', firstName: 'Una' },
      ]);
      const receipt = makeReceiptRow();
      receiptModel.findOrCreate.mockResolvedValue([receipt, true]);

      const result = await service.notify({
        userId: 'user-1',
        type: NotificationType.INVOICE_PAID,
        title: 'Invoice paid',
        body: 'Your invoice was paid',
        data: { screen: 'invoice', entityId: 'inv-9' },
      });

      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.INVOICE_PAID,
          audienceType: NotificationAudienceType.USER,
          audienceId: 'user-1',
        }),
        { transaction: fakeTx },
      );
      expect(receiptModel.findOrCreate).toHaveBeenCalled();
      expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'u1@test.io',
          title: 'Invoice paid',
          ctaUrl: 'http://app.test/invoice/inv-9',
        }),
      );
      expect(result.delivered.in_app).toBe('sent');
      expect(result.delivered.email).toBe('sent');
      expect(result.delivered.push).toBe('skipped:preference_off');
      expect(result.delivered.sms).toBe('skipped:preference_off');
      expect(result.deduped).toBe(false);
    });

    it('skips email when the user has no email on file', async () => {
      notificationModel.findOne.mockResolvedValue(null);
      notificationModel.create.mockResolvedValue(makeNotificationRow());
      preferenceModel.findAll.mockResolvedValue([]);
      userModel.findAll.mockResolvedValue([
        { id: 'user-1', email: null, firstName: null },
      ]);
      receiptModel.findOrCreate.mockResolvedValue([makeReceiptRow(), true]);

      const result = await service.notify({
        userId: 'user-1',
        type: NotificationType.INVOICE_PAID,
        title: 't',
        body: 'b',
      });

      expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
      expect(result.delivered.email).toBe('skipped:no_email');
    });

    it('respects user preference override (email off)', async () => {
      notificationModel.findOne.mockResolvedValue(null);
      notificationModel.create.mockResolvedValue(makeNotificationRow());
      preferenceModel.findAll.mockResolvedValue([
        {
          userId: 'user-1',
          type: NotificationType.INVOICE_PAID,
          channels: { email: false },
        },
      ]);
      userModel.findAll.mockResolvedValue([
        { id: 'user-1', email: 'u1@test.io', firstName: 'Una' },
      ]);
      receiptModel.findOrCreate.mockResolvedValue([makeReceiptRow(), true]);

      const result = await service.notify({
        userId: 'user-1',
        type: NotificationType.INVOICE_PAID,
        title: 't',
        body: 'b',
      });

      expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
      expect(result.delivered.email).toBe('skipped:preference_off');
      // in_app default is still on for INVOICE_PAID
      expect(result.delivered.in_app).toBe('sent');
    });

    it('records email failure in delivered_channels without throwing', async () => {
      notificationModel.findOne.mockResolvedValue(null);
      notificationModel.create.mockResolvedValue(makeNotificationRow());
      preferenceModel.findAll.mockResolvedValue([]);
      userModel.findAll.mockResolvedValue([
        { id: 'user-1', email: 'u1@test.io' },
      ]);
      receiptModel.findOrCreate.mockResolvedValue([makeReceiptRow(), true]);
      emailService.sendNotificationEmail.mockResolvedValue({
        ok: false,
        reason: 'resend 503 service unavailable',
      });

      const result = await service.notify({
        userId: 'user-1',
        type: NotificationType.INVOICE_PAID,
        title: 't',
        body: 'b',
      });

      expect(result.delivered.email).toBe(
        'failed:resend 503 service unavailable',
      );
      // The in-app receipt still happens — failure of one channel does
      // not roll back the others.
      expect(result.delivered.in_app).toBe('sent');
    });

    it('dedupes by fingerprint — second call returns existing notification', async () => {
      const existing = makeNotificationRow({
        id: 'notif-existing',
        fingerprint: 'fp-1',
      });
      notificationModel.findOne.mockResolvedValue(existing);
      preferenceModel.findAll.mockResolvedValue([]);
      userModel.findAll.mockResolvedValue([
        { id: 'user-1', email: 'u1@test.io' },
      ]);
      receiptModel.findOrCreate.mockResolvedValue([
        makeReceiptRow({ notificationId: 'notif-existing' }),
        false,
      ]);

      const result = await service.notify({
        userId: 'user-1',
        type: NotificationType.INVOICE_PAID,
        title: 't',
        body: 'b',
        fingerprint: 'fp-1',
      });

      expect(notificationModel.create).not.toHaveBeenCalled();
      expect(result.deduped).toBe(true);
      expect(result.notificationId).toBe('notif-existing');
    });
  });

  describe('notifyMany', () => {
    it('creates one notification + N receipts (deduplicating user list)', async () => {
      notificationModel.findOne.mockResolvedValue(null);
      notificationModel.create.mockResolvedValue(makeNotificationRow());
      preferenceModel.findAll.mockResolvedValue([]);
      userModel.findAll.mockResolvedValue([
        { id: 'user-1', email: 'u1@test.io' },
        { id: 'user-2', email: 'u2@test.io' },
      ]);
      receiptModel.findOrCreate
        .mockResolvedValueOnce([
          makeReceiptRow({ id: 'r-1', userId: 'user-1' }),
          true,
        ])
        .mockResolvedValueOnce([
          makeReceiptRow({ id: 'r-2', userId: 'user-2' }),
          true,
        ]);

      const result = await service.notifyMany(
        // intentionally pass user-1 twice — must be deduped
        ['user-1', 'user-2', 'user-1'],
        {
          type: NotificationType.SESSION_CANCELLED,
          title: 'Cancelled',
          body: 'Session cancelled',
        },
      );

      expect(notificationModel.create).toHaveBeenCalledTimes(1);
      expect(receiptModel.findOrCreate).toHaveBeenCalledTimes(2);
      expect(result.results).toHaveLength(2);
      // multi-recipient → audienceId is null on the notification
      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ audienceId: null }),
        { transaction: fakeTx },
      );
    });

    it('throws when called with an empty user list', async () => {
      await expect(
        service.notifyMany([], {
          type: NotificationType.SESSION_CANCELLED,
          title: 't',
          body: 'b',
        }),
      ).rejects.toThrow(/empty userIds/);
    });
  });
});
