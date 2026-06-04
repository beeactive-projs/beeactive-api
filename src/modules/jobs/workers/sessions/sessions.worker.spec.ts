import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { UnrecoverableError } from 'bullmq';
import { SessionsWorker } from './sessions.worker';
import { SessionBookingService } from '../../../session/services/session-booking.service';
import { SessionLifecycleService } from '../../../session/services/session-lifecycle.service';
import { SessionReminderDispatchService } from '../../../session/services/session-reminder-dispatch.service';
import { SessionTemplateService } from '../../../session/services/session-template.service';
import { makeSilentLogger } from '../../../../../test/helpers/sequelize-mocks';

const fakeJob = (name: string) =>
  ({
    data: {},
    queueName: 'sessions',
    name,
    id: 'job-test',
    attemptsMade: 0,
  }) as unknown as Parameters<SessionsWorker['process']>[0];

describe('SessionsWorker', () => {
  let worker: SessionsWorker;
  let reminderDispatch: { dispatchDue: jest.Mock };
  let lifecycle: { runStatusTransitions: jest.Mock };
  let templates: { generateDueRecurringForAll: jest.Mock };
  let booking: { expireStalePendingApprovals: jest.Mock };

  beforeEach(async () => {
    reminderDispatch = {
      dispatchDue: jest
        .fn()
        .mockResolvedValue({ sent: 1, skipped: 0, failed: 0 }),
    };
    lifecycle = {
      runStatusTransitions: jest
        .fn()
        .mockResolvedValue({ started: 2, completed: 1 }),
    };
    templates = {
      generateDueRecurringForAll: jest.fn().mockResolvedValue({
        templatesScanned: 3,
        templatesToppedUp: 1,
        created: 4,
      }),
    };
    booking = {
      expireStalePendingApprovals: jest.fn().mockResolvedValue({ expired: 2 }),
    };

    const ref = await Test.createTestingModule({
      providers: [
        SessionsWorker,
        { provide: SessionReminderDispatchService, useValue: reminderDispatch },
        { provide: SessionLifecycleService, useValue: lifecycle },
        { provide: SessionTemplateService, useValue: templates },
        { provide: SessionBookingService, useValue: booking },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();

    worker = ref.get(SessionsWorker);
  });

  it('routes reminder_dispatch → SessionReminderDispatchService.dispatchDue', async () => {
    await worker.process(fakeJob('reminder_dispatch'));
    expect(reminderDispatch.dispatchDue).toHaveBeenCalledTimes(1);
  });

  it('routes status_transition → SessionLifecycleService.runStatusTransitions', async () => {
    await worker.process(fakeJob('status_transition'));
    expect(lifecycle.runStatusTransitions).toHaveBeenCalledTimes(1);
  });

  it('routes generate_recurring → SessionTemplateService.generateDueRecurringForAll', async () => {
    await worker.process(fakeJob('generate_recurring'));
    expect(templates.generateDueRecurringForAll).toHaveBeenCalledTimes(1);
  });

  it('routes cleanup_stale_participants → SessionBookingService.expireStalePendingApprovals', async () => {
    await worker.process(fakeJob('cleanup_stale_participants'));
    expect(booking.expireStalePendingApprovals).toHaveBeenCalledTimes(1);
  });

  it('unknown job name → UnrecoverableError, no service touched', async () => {
    await expect(worker.process(fakeJob('bogus'))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(reminderDispatch.dispatchDue).not.toHaveBeenCalled();
  });
});
