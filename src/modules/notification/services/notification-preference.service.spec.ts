import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';

import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationType } from '../notification-types';
import {
  makeModelMock,
  makeSequelizeMock,
  type ModelMock,
} from '../../../../test/helpers/sequelize-mocks';

describe('NotificationPreferenceService', () => {
  let service: NotificationPreferenceService;
  let prefModel: ModelMock & { upsert: jest.Mock };

  beforeEach(async () => {
    prefModel = Object.assign(makeModelMock(), {
      upsert: jest.fn(),
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationPreferenceService,
        {
          provide: getModelToken(NotificationPreference),
          useValue: prefModel,
        },
        { provide: Sequelize, useValue: makeSequelizeMock() },
      ],
    }).compile();

    service = moduleRef.get(NotificationPreferenceService);
  });

  describe('getForUser', () => {
    it('returns one entry per known type with merged channels', async () => {
      // User has overridden email off for INVOICE_PAID only.
      prefModel.findAll.mockResolvedValue([
        {
          userId: 'user-1',
          type: NotificationType.INVOICE_PAID,
          channels: { email: false },
        },
      ]);

      const view = await service.getForUser('user-1');

      const invoicePaid = view.find(
        (v) => v.type === NotificationType.INVOICE_PAID,
      );
      expect(invoicePaid?.isCustomized).toBe(true);
      expect(invoicePaid?.channels.email).toBe(false);
      // Defaults map says INVOICE_PAID has in_app: true → still on
      expect(invoicePaid?.channels.in_app).toBe(true);

      const sessionCancelled = view.find(
        (v) => v.type === NotificationType.SESSION_CANCELLED,
      );
      expect(sessionCancelled?.isCustomized).toBe(false);
      // Default for SESSION_CANCELLED is on for in_app/email/push
      expect(sessionCancelled?.channels.email).toBe(true);
    });
  });

  describe('update', () => {
    it('upserts a single preference', async () => {
      prefModel.upsert.mockResolvedValue([{ id: 'p-1' }]);

      await service.update('user-1', NotificationType.INVOICE_PAID, {
        email: false,
        in_app: true,
      });

      expect(prefModel.upsert).toHaveBeenCalledWith({
        userId: 'user-1',
        type: NotificationType.INVOICE_PAID,
        channels: { email: false, in_app: true },
      });
    });
  });

  describe('bulkUpdate', () => {
    it('upserts each entry inside one transaction', async () => {
      prefModel.upsert.mockResolvedValue([{ id: 'p-x' }]);

      const result = await service.bulkUpdate('user-1', [
        {
          type: NotificationType.INVOICE_PAID,
          channels: { email: false },
        },
        {
          type: NotificationType.SESSION_CANCELLED,
          channels: { push: false },
        },
      ]);

      expect(prefModel.upsert).toHaveBeenCalledTimes(2);
      expect(result.written).toBe(2);
    });

    it('is a no-op when called with empty updates', async () => {
      const result = await service.bulkUpdate('user-1', []);
      expect(prefModel.upsert).not.toHaveBeenCalled();
      expect(result.written).toBe(0);
    });
  });

  describe('resetToDefault', () => {
    it('removes all overrides when no type is specified', async () => {
      prefModel.destroy.mockResolvedValue(5);
      const result = await service.resetToDefault('user-1');
      expect(prefModel.destroy).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(result.removed).toBe(5);
    });

    it('removes only the specified type when provided', async () => {
      prefModel.destroy.mockResolvedValue(1);
      const result = await service.resetToDefault(
        'user-1',
        NotificationType.INVOICE_PAID,
      );
      expect(prefModel.destroy).toHaveBeenCalledWith({
        where: { userId: 'user-1', type: NotificationType.INVOICE_PAID },
      });
      expect(result.removed).toBe(1);
    });
  });
});
