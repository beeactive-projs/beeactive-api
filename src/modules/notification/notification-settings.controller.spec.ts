import { Test } from '@nestjs/testing';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { NotificationCategory } from './notification-categories';

const mockReq = (userId: string) =>
  ({ user: { id: userId } }) as unknown as AuthenticatedRequest;

// Plain-object mock — see notification.controller.spec.ts for the
// rationale (avoids the `unbound-method` rule triggered by jest.Mocked).
interface PrefsMock {
  getForUser: jest.Mock;
  updateCategoriesForUser: jest.Mock;
  resetToDefault: jest.Mock;
}

describe('NotificationSettingsController', () => {
  let controller: NotificationSettingsController;
  let prefs: PrefsMock;

  beforeEach(async () => {
    prefs = {
      getForUser: jest.fn(),
      updateCategoriesForUser: jest.fn(),
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

  it('update forwards category items to updateCategoriesForUser', async () => {
    prefs.updateCategoriesForUser.mockResolvedValue({ written: 7 });
    const items = [
      {
        category: NotificationCategory.Payments,
        channels: { email: false },
      },
      {
        category: NotificationCategory.Sessions,
        channels: { email: true },
      },
    ];
    const result = await controller.update(mockReq('user-1'), { items });
    expect(prefs.updateCategoriesForUser).toHaveBeenCalledWith('user-1', items);
    expect(result.written).toBe(7);
  });

  it('resetCategory delegates with the category from the path param', async () => {
    prefs.resetToDefault.mockResolvedValue({ removed: 4 });
    await controller.resetCategory(
      mockReq('user-1'),
      NotificationCategory.Payments,
    );
    expect(prefs.resetToDefault).toHaveBeenCalledWith(
      'user-1',
      NotificationCategory.Payments,
    );
  });

  it('resetAll calls resetToDefault without a category', async () => {
    prefs.resetToDefault.mockResolvedValue({ removed: 12 });
    await controller.resetAll(mockReq('user-1'));
    expect(prefs.resetToDefault).toHaveBeenCalledWith('user-1');
  });
});
