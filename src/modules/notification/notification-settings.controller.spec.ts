import { Test } from '@nestjs/testing';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { NotificationType } from './notification-types';

const mockReq = (userId: string) =>
  ({ user: { id: userId } }) as unknown as AuthenticatedRequest;

// Plain-object mock — see notification.controller.spec.ts for the
// rationale (avoids the `unbound-method` rule triggered by jest.Mocked).
interface PrefsMock {
  getForUser: jest.Mock;
  update: jest.Mock;
  bulkUpdate: jest.Mock;
  resetToDefault: jest.Mock;
}

describe('NotificationSettingsController', () => {
  let controller: NotificationSettingsController;
  let prefs: PrefsMock;

  beforeEach(async () => {
    prefs = {
      getForUser: jest.fn(),
      update: jest.fn(),
      bulkUpdate: jest.fn(),
      resetToDefault: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationSettingsController],
      providers: [{ provide: NotificationPreferenceService, useValue: prefs }],
    }).compile();

    controller = moduleRef.get(NotificationSettingsController);
  });

  it('get returns the preferences view for the current user', async () => {
    prefs.getForUser.mockResolvedValue([]);
    await controller.get(mockReq('user-1'));
    expect(prefs.getForUser).toHaveBeenCalledWith('user-1');
  });

  it('update unwraps items from the DTO and bulkUpdates', async () => {
    prefs.bulkUpdate.mockResolvedValue({ written: 2 });
    const items = [
      {
        type: NotificationType.INVOICE_PAID,
        channels: { email: false },
      },
      {
        type: NotificationType.SESSION_CANCELLED,
        channels: { push: false },
      },
    ];
    const result = await controller.update(mockReq('user-1'), { items });
    expect(prefs.bulkUpdate).toHaveBeenCalledWith('user-1', items);
    expect(result.written).toBe(2);
  });

  it('resetType delegates with the type from the path param', async () => {
    prefs.resetToDefault.mockResolvedValue({ removed: 1 });
    await controller.resetType(
      mockReq('user-1'),
      NotificationType.INVOICE_PAID,
    );
    expect(prefs.resetToDefault).toHaveBeenCalledWith(
      'user-1',
      NotificationType.INVOICE_PAID,
    );
  });

  it('resetAll calls resetToDefault without a type', async () => {
    prefs.resetToDefault.mockResolvedValue({ removed: 3 });
    await controller.resetAll(mockReq('user-1'));
    expect(prefs.resetToDefault).toHaveBeenCalledWith('user-1');
  });
});
