import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Sequelize } from 'sequelize-typescript';
import { SessionBookingService } from './session-booking.service';
import { SessionAccessService } from './session-access.service';
import { SessionWaitlistService } from './session-waitlist.service';
import { SessionInstance } from '../entities/session-instance.entity';
import { SessionParticipant } from '../entities/session-participant.entity';
import { SessionTemplate } from '../entities/session-template.entity';
import { User } from '../../user/entities/user.entity';
import { NotificationService } from '../../notification/notification.service';
import { SessionParticipantStatus } from '../entities/session.enums';
import { makeSilentLogger } from '../../../../test/helpers/sequelize-mocks';

const fakeSequelize = () =>
  ({
    transaction: async <T>(
      cb: (tx: { LOCK: { UPDATE: 'UPDATE' } }) => Promise<T>,
    ) => cb({ LOCK: { UPDATE: 'UPDATE' } }),
  }) as unknown as Sequelize;

describe('SessionBookingService.expireStalePendingApprovals', () => {
  let service: SessionBookingService;
  let participantModel: { findAll: jest.Mock; findOne: jest.Mock };
  let instanceModel: { increment: jest.Mock };

  beforeEach(async () => {
    participantModel = { findAll: jest.fn(), findOne: jest.fn() };
    instanceModel = { increment: jest.fn().mockResolvedValue(undefined) };

    const ref = await Test.createTestingModule({
      providers: [
        SessionBookingService,
        { provide: getModelToken(SessionInstance), useValue: instanceModel },
        {
          provide: getModelToken(SessionParticipant),
          useValue: participantModel,
        },
        { provide: getModelToken(SessionTemplate), useValue: {} },
        { provide: getModelToken(User), useValue: {} },
        { provide: SessionAccessService, useValue: {} },
        { provide: SessionWaitlistService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: Sequelize, useValue: fakeSequelize() },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();

    service = ref.get(SessionBookingService);
  });

  it('declines a past-start pending booking and decrements the pending counter', async () => {
    participantModel.findAll.mockResolvedValue([
      { id: 'p-1', instanceId: 'inst-1' },
    ]);
    const update = jest.fn().mockResolvedValue(undefined);
    participantModel.findOne.mockResolvedValue({
      id: 'p-1',
      instanceId: 'inst-1',
      status: SessionParticipantStatus.PendingApproval,
      update,
    });
    const now = new Date('2026-06-30T10:00:00Z');

    const result = await service.expireStalePendingApprovals(now);

    expect(result).toEqual({ expired: 1 });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: SessionParticipantStatus.Declined,
        declinedAt: now,
      }),
      expect.objectContaining({ transaction: expect.anything() }),
    );
    expect(instanceModel.increment).toHaveBeenCalledWith(
      { pendingApprovalCount: -1 },
      expect.objectContaining({ where: { id: 'inst-1' } }),
    );
  });

  it('skips a candidate whose status changed since it was listed (no double-decrement)', async () => {
    participantModel.findAll.mockResolvedValue([
      { id: 'p-1', instanceId: 'inst-1' },
    ]);
    participantModel.findOne.mockResolvedValue({
      id: 'p-1',
      status: SessionParticipantStatus.Confirmed, // approved in the meantime
      update: jest.fn(),
    });

    const result = await service.expireStalePendingApprovals(new Date());

    expect(result).toEqual({ expired: 0 });
    expect(instanceModel.increment).not.toHaveBeenCalled();
  });

  it('returns zero when there is nothing stale', async () => {
    participantModel.findAll.mockResolvedValue([]);
    const result = await service.expireStalePendingApprovals(new Date());
    expect(result).toEqual({ expired: 0 });
  });
});
