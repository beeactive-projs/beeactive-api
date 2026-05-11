import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';

import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationType } from '../notification-types';
import {
  CATEGORY_TO_TYPES,
  NotificationCategory,
} from '../notification-categories';
import {
  makeModelMock,
  makeSequelizeMock,
  type ModelMock,
} from '../../../../test/helpers/sequelize-mocks';

describe('NotificationPreferenceService', () => {
  let service: NotificationPreferenceService;
  let prefModel: ModelMock;

  beforeEach(async () => {
    prefModel = makeModelMock();

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
    it('returns one row per category in display order', async () => {
      prefModel.findAll.mockResolvedValue([]);
      const view = await service.getForUser('user-1');
      // 6 categories defined.
      expect(view.length).toBe(6);
      // Sessions is rendered first per CATEGORY_DISPLAY_ORDER.
      expect(view[0].category).toBe(NotificationCategory.Sessions);
      // Account is rarely-touched and rendered last.
      expect(view[view.length - 1].category).toBe(NotificationCategory.Account);
    });

    it('reflects the user override for the underlying types in the category', async () => {
      // User has email off for INVOICE_PAID — that's a Payments-category type.
      prefModel.findAll.mockResolvedValue([
        {
          userId: 'user-1',
          type: NotificationType.INVOICE_PAID,
          channels: { email: false, in_app: true },
        },
      ]);

      const view = await service.getForUser('user-1');
      const payments = view.find(
        (v) => v.category === NotificationCategory.Payments,
      );
      expect(payments?.isCustomized).toBe(true);
      // Other Payments types still default to email: true → category-level
      // email is true (any-of rule).
      expect(payments?.channels.email).toBe(true);

      // Sessions has no overrides → not customized; defaults apply.
      const sessions = view.find(
        (v) => v.category === NotificationCategory.Sessions,
      );
      expect(sessions?.isCustomized).toBe(false);
    });
  });

  describe('updateCategoriesForUser', () => {
    it('creates one row per type when the user has no existing overrides', async () => {
      prefModel.findAll.mockResolvedValue([]);
      // `create()` returns the created row; we only need an object that
      // looks model-ish for the cache write in the service.
      prefModel.create.mockImplementation((attrs: object) =>
        Promise.resolve({ ...attrs, update: jest.fn() }),
      );

      const result = await service.updateCategoriesForUser('user-1', [
        {
          category: NotificationCategory.Coaching,
          channels: { email: false },
        },
      ]);

      const expectedCreates =
        CATEGORY_TO_TYPES[NotificationCategory.Coaching].length;
      expect(prefModel.create).toHaveBeenCalledTimes(expectedCreates);
      expect(result.written).toBe(expectedCreates);

      // Spot-check the first create payload — userId, type, and merged channels.
      const firstCall = prefModel.create.mock.calls[0][0] as {
        userId: string;
        type: NotificationType;
        channels: { email: boolean };
      };
      expect(firstCall.userId).toBe('user-1');
      expect(firstCall.channels.email).toBe(false);
    });

    it('preserves existing in_app/push/sms when only email is toggled', async () => {
      // Existing override is a fake model instance with an `update` method
      // so the service can call `row.update(...)` on it. This matches the
      // sequelize-typescript Model API and is the whole point of the bug
      // fix (the old code used `model.upsert(...)` which conflicted on PK
      // and exploded on the (user_id, type) unique constraint).
      const reminderUpdate = jest.fn().mockResolvedValue(undefined);
      prefModel.findAll.mockResolvedValue([
        {
          userId: 'user-1',
          type: NotificationType.SESSION_REMINDER_24H,
          channels: { in_app: true, email: true, push: true, sms: false },
          update: reminderUpdate,
        },
      ]);
      prefModel.create.mockImplementation((attrs: object) =>
        Promise.resolve({ ...attrs, update: jest.fn() }),
      );

      await service.updateCategoriesForUser('user-1', [
        {
          category: NotificationCategory.Sessions,
          channels: { email: false },
        },
      ]);

      expect(reminderUpdate).toHaveBeenCalledTimes(1);
      const updatedChannels = reminderUpdate.mock.calls[0][0] as {
        channels: Record<string, boolean>;
      };
      expect(updatedChannels.channels.email).toBe(false);
      expect(updatedChannels.channels.in_app).toBe(true);
      expect(updatedChannels.channels.push).toBe(true);
      expect(updatedChannels.channels.sms).toBe(false);
    });

    it('is a no-op when called with empty updates', async () => {
      const result = await service.updateCategoriesForUser('user-1', []);
      expect(prefModel.create).not.toHaveBeenCalled();
      expect(result.written).toBe(0);
    });
  });

  describe('resetToDefault', () => {
    it('removes all overrides when no category is specified', async () => {
      prefModel.destroy.mockResolvedValue(8);
      const result = await service.resetToDefault('user-1');
      expect(prefModel.destroy).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(result.removed).toBe(8);
    });

    it('removes only rows for the specified category', async () => {
      prefModel.destroy.mockResolvedValue(3);
      const result = await service.resetToDefault(
        'user-1',
        NotificationCategory.Payments,
      );
      // The where clause uses Op.in over all Payments types.
      expect(prefModel.destroy).toHaveBeenCalled();
      expect(result.removed).toBe(3);
    });
  });
});
