import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op } from 'sequelize';
import { SessionReminderDispatchService } from './session-reminder-dispatch.service';
import { SessionReminderSchedule } from '../entities/session-reminder-schedule.entity';
import { NotificationService } from '../../notification/notification.service';
import {
  SessionInstanceStatus,
  SessionParticipantStatus,
} from '../entities/session.enums';
import { makeSilentLogger } from '../../../../test/helpers/sequelize-mocks';

const makeRow = (
  over: {
    id?: string;
    kind?: 'REMINDER_24H' | 'REMINDER_1H';
    instance?: Record<string, unknown>;
    participant?: Record<string, unknown>;
  } = {},
) => ({
  id: over.id ?? 'rem-1',
  kind: over.kind ?? 'REMINDER_24H',
  instance: {
    id: 'inst-1',
    templateId: 'tmpl-1',
    titleOverride: null,
    startAt: new Date('2026-07-01T08:00:00Z'),
    status: SessionInstanceStatus.Scheduled,
    template: { title: 'Yoga', timezone: 'Europe/Bucharest' },
    ...over.instance,
  },
  participant: {
    userId: 'usr-1',
    status: SessionParticipantStatus.Confirmed,
    ...over.participant,
  },
});

describe('SessionReminderDispatchService', () => {
  let service: SessionReminderDispatchService;
  let reminderModel: { findAll: jest.Mock; update: jest.Mock };
  let notifications: { notify: jest.Mock };

  beforeEach(async () => {
    reminderModel = {
      findAll: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue([1]),
    };
    notifications = { notify: jest.fn().mockResolvedValue({}) };

    const ref = await Test.createTestingModule({
      providers: [
        SessionReminderDispatchService,
        {
          provide: getModelToken(SessionReminderSchedule),
          useValue: reminderModel,
        },
        { provide: NotificationService, useValue: notifications },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();

    service = ref.get(SessionReminderDispatchService);
  });

  it('only queries unsent rows that are due (sentAt null + fireAt <= now)', async () => {
    const now = new Date('2026-06-30T08:00:00Z');
    await service.dispatchDue(now);
    const arg = reminderModel.findAll.mock.calls[0][0] as {
      where: { sentAt: null; fireAt: Record<symbol, unknown> };
    };
    expect(arg.where.sentAt).toBeNull();
    expect(arg.where.fireAt).toEqual({ [Op.lte]: now });
  });

  it('marks the row sent and fires a reminder notification', async () => {
    reminderModel.findAll.mockResolvedValue([makeRow()]);
    const now = new Date('2026-06-30T08:00:00Z');

    const result = await service.dispatchDue(now);

    expect(reminderModel.update).toHaveBeenCalledWith(
      { sentAt: now },
      { where: { id: 'rem-1' } },
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'usr-1' }),
    );
    expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 });
  });

  it('marks sent but does NOT notify when the instance is cancelled', async () => {
    reminderModel.findAll.mockResolvedValue([
      makeRow({ instance: { status: SessionInstanceStatus.Cancelled } }),
    ]);

    const result = await service.dispatchDue(new Date());

    expect(reminderModel.update).toHaveBeenCalledTimes(1); // still marked
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, skipped: 1, failed: 0 });
  });

  it('marks sent but does NOT notify when the participant has cancelled', async () => {
    reminderModel.findAll.mockResolvedValue([
      makeRow({ participant: { status: SessionParticipantStatus.Cancelled } }),
    ]);

    const result = await service.dispatchDue(new Date());

    expect(notifications.notify).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it('isolates a failing row — counts it failed without throwing', async () => {
    reminderModel.findAll.mockResolvedValue([
      makeRow(),
      makeRow({ id: 'rem-2' }),
    ]);
    notifications.notify
      .mockRejectedValueOnce(new Error('resend down'))
      .mockResolvedValueOnce({});

    const result = await service.dispatchDue(new Date());

    expect(result).toEqual({ sent: 1, skipped: 0, failed: 1 });
  });
});
