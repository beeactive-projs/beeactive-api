import { UnrecoverableError } from 'bullmq';
import { MultiJobWorker, JobHandler } from './multi-job.worker';
import { PermanentError, TemporaryError } from './errors';
import { makeSilentLogger } from '../../../../test/helpers/sequelize-mocks';

const fakeJob = (name: string, data: unknown = {}) =>
  ({
    data,
    queueName: 'test',
    name,
    id: 'job-test',
    attemptsMade: 0,
  }) as unknown as Parameters<MultiJobWorker['process']>[0];

describe('MultiJobWorker', () => {
  const fooHandler = jest.fn().mockResolvedValue(undefined);

  class TestWorker extends MultiJobWorker {
    protected readonly handlers: Record<string, JobHandler> = {
      foo: (_p, _ctx) => fooHandler(),
      boom_permanent: () => Promise.reject(new PermanentError('nope')),
      boom_temporary: () => Promise.reject(new TemporaryError('later')),
    };
  }

  let worker: TestWorker;

  beforeEach(() => {
    fooHandler.mockClear();
    worker = new TestWorker(makeSilentLogger());
  });

  it('routes a job to the handler registered under its name', async () => {
    await worker.process(fakeJob('foo'));
    expect(fooHandler).toHaveBeenCalledTimes(1);
  });

  it('unknown job name → PermanentError wrapped as UnrecoverableError (no retry)', async () => {
    await expect(
      worker.process(fakeJob('does_not_exist')),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(fooHandler).not.toHaveBeenCalled();
  });

  it('PermanentError from a handler → UnrecoverableError', async () => {
    await expect(
      worker.process(fakeJob('boom_permanent')),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('TemporaryError from a handler bubbles up unchanged (BullMQ retries)', async () => {
    await expect(
      worker.process(fakeJob('boom_temporary')),
    ).rejects.toBeInstanceOf(TemporaryError);
  });
});
