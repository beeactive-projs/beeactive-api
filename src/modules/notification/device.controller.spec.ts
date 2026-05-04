import { Test } from '@nestjs/testing';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { DeviceController } from './device.controller';
import { DeviceTokenService } from './services/device-token.service';
import { DevicePlatform } from './entities/device-token.entity';

const mockReq = (userId: string) =>
  ({ user: { id: userId } }) as unknown as AuthenticatedRequest;

// Plain-object mock — see notification.controller.spec.ts for the
// rationale (avoids the `unbound-method` rule triggered by jest.Mocked).
interface DevicesMock {
  register: jest.Mock;
  listActiveForUser: jest.Mock;
  revoke: jest.Mock;
  bumpLastSeen: jest.Mock;
}

describe('DeviceController', () => {
  let controller: DeviceController;
  let devices: DevicesMock;

  beforeEach(async () => {
    devices = {
      register: jest.fn(),
      listActiveForUser: jest.fn(),
      revoke: jest.fn(),
      bumpLastSeen: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [DeviceController],
      providers: [{ provide: DeviceTokenService, useValue: devices }],
    }).compile();

    controller = moduleRef.get(DeviceController);
  });

  it('register passes the WebPush subscription as token when platform=WEB', async () => {
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'k1', auth: 'k2' },
    };
    await controller.register(mockReq('user-1'), {
      platform: DevicePlatform.WEB,
      subscription,
      deviceLabel: 'Chrome on macOS',
    });
    expect(devices.register).toHaveBeenCalledWith({
      userId: 'user-1',
      platform: DevicePlatform.WEB,
      token: subscription,
      deviceLabel: 'Chrome on macOS',
    });
  });

  it('register passes the FCM token string as token when platform=IOS', async () => {
    await controller.register(mockReq('user-1'), {
      platform: DevicePlatform.IOS,
      tokenString: 'fcm-abc-123',
    });
    expect(devices.register).toHaveBeenCalledWith({
      userId: 'user-1',
      platform: DevicePlatform.IOS,
      token: 'fcm-abc-123',
      deviceLabel: undefined,
    });
  });

  it('list returns the user’s active devices', async () => {
    devices.listActiveForUser.mockResolvedValue([]);
    await controller.list(mockReq('user-1'));
    expect(devices.listActiveForUser).toHaveBeenCalledWith('user-1');
  });

  it('revoke and heartbeat delegate with (userId, id)', async () => {
    await controller.revoke(mockReq('user-1'), 'd-1');
    await controller.heartbeat(mockReq('user-1'), 'd-1');
    expect(devices.revoke).toHaveBeenCalledWith('user-1', 'd-1');
    expect(devices.bumpLastSeen).toHaveBeenCalledWith('user-1', 'd-1');
  });
});
