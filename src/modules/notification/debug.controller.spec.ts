import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { NotificationDebugController } from './debug.controller';
import { NotificationService } from './notification.service';
import { NotificationType } from './notification-types';
import { NotificationSeverity } from './entities/notification.entity';

// Plain-object mock — see notification.controller.spec.ts for rationale.
interface NotificationsMock {
  notify: jest.Mock;
}

const passingGuard = { canActivate: () => true };

describe('NotificationDebugController', () => {
  let controller: NotificationDebugController;
  let notifications: NotificationsMock;

  beforeEach(async () => {
    notifications = { notify: jest.fn() };
    // Stub the guards — the auth + role gates are unit-tested in their
    // own specs; here we want to focus on the controller's own logic.
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationDebugController],
      providers: [{ provide: NotificationService, useValue: notifications }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue(passingGuard)
      .overrideGuard(RolesGuard)
      .useValue(passingGuard)
      .compile();
    controller = moduleRef.get(NotificationDebugController);
  });

  it('forwards every DTO field to NotificationService.notify', async () => {
    notifications.notify.mockResolvedValue({
      notificationId: 'n-1',
      receiptId: 'r-1',
      deduped: false,
      delivered: { in_app: 'sent', email: 'sent' },
    });

    await controller.notify({
      userId: '11111111-1111-1111-1111-111111111111',
      type: NotificationType.INVOICE_PAID,
      title: 'Smoke',
      body: 'Hello',
      data: { screen: 'invoice', entityId: 'inv-9' },
      severity: NotificationSeverity.SUCCESS,
      fingerprint: 'fp-test',
      ctaLabel: 'Open',
    });

    expect(notifications.notify).toHaveBeenCalledWith({
      userId: '11111111-1111-1111-1111-111111111111',
      type: NotificationType.INVOICE_PAID,
      title: 'Smoke',
      body: 'Hello',
      data: { screen: 'invoice', entityId: 'inv-9' },
      severity: NotificationSeverity.SUCCESS,
      fingerprint: 'fp-test',
      ctaLabel: 'Open',
    });
  });

  it('passes data: undefined when the DTO has no data block', async () => {
    notifications.notify.mockResolvedValue({});
    await controller.notify({
      userId: '22222222-2222-2222-2222-222222222222',
      type: NotificationType.GROUP_MEMBER_JOINED,
      title: 't',
      body: 'b',
    });
    const calls = notifications.notify.mock.calls as Array<
      [{ data?: unknown }]
    >;
    expect(calls[0][0].data).toBeUndefined();
  });
});
