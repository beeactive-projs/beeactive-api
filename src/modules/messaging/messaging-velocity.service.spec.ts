import { getModelToken } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { Message } from './entities/message.entity';
import { MessagingVelocityAlarm } from './entities/messaging-velocity-alarm.entity';
import { MessagingVelocityService } from './messaging-velocity.service';
import { makeSilentLogger } from '../../../test/helpers/sequelize-mocks';

interface AlarmMock {
  findOne: jest.Mock;
  create: jest.Mock;
}

interface MessageMock {
  count: jest.Mock;
}

describe('MessagingVelocityService — Stage 5', () => {
  let service: MessagingVelocityService;
  let alarmModel: AlarmMock;
  let messageModel: MessageMock;

  beforeEach(async () => {
    alarmModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'alarm-1' }),
    };
    messageModel = {
      count: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        MessagingVelocityService,
        {
          provide: getModelToken(MessagingVelocityAlarm),
          useValue: alarmModel,
        },
        {
          provide: getModelToken(Message),
          useValue: messageModel,
        },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();

    service = module.get(MessagingVelocityService);
  });

  it('below threshold: no alarm written', async () => {
    messageModel.count.mockResolvedValue(50);
    await service.recordSendAndMaybeAlarm('user-1');
    expect(alarmModel.create).not.toHaveBeenCalled();
  });

  it('at threshold: alarm IS written (the rule is >=, not >)', async () => {
    messageModel.count.mockResolvedValue(
      MessagingVelocityService.DEFAULT_THRESHOLD,
    );
    await service.recordSendAndMaybeAlarm('user-1');
    expect(alarmModel.create).toHaveBeenCalledTimes(1);
    expect(alarmModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        messageCount: MessagingVelocityService.DEFAULT_THRESHOLD,
        threshold: MessagingVelocityService.DEFAULT_THRESHOLD,
        windowStart: expect.any(Date),
        windowEnd: expect.any(Date),
      }),
    );
  });

  it('over threshold: alarm written exactly once when no unreviewed alarm exists', async () => {
    messageModel.count.mockResolvedValue(200);
    await service.recordSendAndMaybeAlarm('user-1');
    expect(alarmModel.create).toHaveBeenCalledTimes(1);
  });

  it('idempotent: existing unreviewed alarm within window suppresses a second row', async () => {
    messageModel.count.mockResolvedValue(150);
    alarmModel.findOne.mockResolvedValue({ id: 'already' });

    await service.recordSendAndMaybeAlarm('user-1');

    expect(alarmModel.create).not.toHaveBeenCalled();
  });

  it('DB errors are swallowed — they MUST NOT propagate (would break sends)', async () => {
    messageModel.count.mockResolvedValue(200);
    alarmModel.findOne.mockRejectedValue(new Error('db down'));

    await expect(
      service.recordSendAndMaybeAlarm('user-1'),
    ).resolves.toBeUndefined();
  });

  it('respects custom threshold / window', async () => {
    messageModel.count.mockResolvedValue(11);
    await service.recordSendAndMaybeAlarm('user-1', {
      threshold: 10,
      windowMs: 5_000,
    });
    expect(messageModel.count).toHaveBeenCalledTimes(1);
    expect(alarmModel.create).toHaveBeenCalledTimes(1);
  });

  it('threshold is queried against the message table, not the in-memory rate-limit bucket', async () => {
    // Regression for the bug where the velocity service was reading
    // `MessagingRateLimitService.recentUserSendCount(...)` — a
    // 30/minute-bounded counter — and thus could never reach the
    // 100/60-minute alarm threshold. We now hit the table directly.
    messageModel.count.mockResolvedValue(120);
    await service.recordSendAndMaybeAlarm('user-1');
    expect(messageModel.count).toHaveBeenCalledTimes(1);
    expect(alarmModel.create).toHaveBeenCalledTimes(1);
  });
});
