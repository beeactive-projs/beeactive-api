import { SessionsScheduler } from './sessions.scheduler';
import { JobsService } from '../jobs.service';
import { makeSilentLogger } from '../../../../test/helpers/sequelize-mocks';

describe('SessionsScheduler', () => {
  let scheduler: SessionsScheduler;
  let enqueue: jest.Mock;

  beforeEach(() => {
    enqueue = jest.fn().mockResolvedValue({ id: 'job-1' });
    const jobs = { enqueue } as unknown as JobsService;
    scheduler = new SessionsScheduler(jobs, makeSilentLogger());
  });

  it('dispatchReminders enqueues sessions.reminder_dispatch with a deterministic jobId', async () => {
    await scheduler.dispatchReminders();
    expect(enqueue).toHaveBeenCalledWith(
      'sessions.reminder_dispatch',
      expect.objectContaining({ runKey: expect.any(String) }),
      expect.objectContaining({
        jobId: expect.stringMatching(/^sessions\.reminder_dispatch-/) as string,
      }),
    );
  });

  it('runStatusTransitions enqueues sessions.status_transition', async () => {
    await scheduler.runStatusTransitions();
    expect(enqueue).toHaveBeenCalledWith(
      'sessions.status_transition',
      expect.any(Object),
      expect.objectContaining({
        jobId: expect.stringMatching(/^sessions\.status_transition-/) as string,
      }),
    );
  });

  it('generateRecurring enqueues sessions.generate_recurring', async () => {
    await scheduler.generateRecurring();
    expect(enqueue).toHaveBeenCalledWith(
      'sessions.generate_recurring',
      expect.any(Object),
      expect.objectContaining({
        jobId: expect.stringMatching(
          /^sessions\.generate_recurring-/,
        ) as string,
      }),
    );
  });

  it('cleanupStaleParticipants enqueues sessions.cleanup_stale_participants', async () => {
    await scheduler.cleanupStaleParticipants();
    expect(enqueue).toHaveBeenCalledWith(
      'sessions.cleanup_stale_participants',
      expect.any(Object),
      expect.objectContaining({
        jobId: expect.stringMatching(
          /^sessions\.cleanup_stale_participants-/,
        ) as string,
      }),
    );
  });

  it('uses the same jobId within one time bucket (dedups duplicate fires)', async () => {
    await scheduler.dispatchReminders();
    await scheduler.dispatchReminders();
    const firstJobId = (enqueue.mock.calls[0][2] as { jobId: string }).jobId;
    const secondJobId = (enqueue.mock.calls[1][2] as { jobId: string }).jobId;
    expect(firstJobId).toBe(secondJobId);
  });
});
