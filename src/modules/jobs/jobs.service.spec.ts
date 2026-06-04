import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { JobsService } from './jobs.service';
import { QueueName } from './job-registry';
import { makeSilentLogger } from '../../../test/helpers/sequelize-mocks';

interface QueueMock {
  add: jest.Mock;
}

describe('JobsService', () => {
  let service: JobsService;
  let queueMock: QueueMock;
  let moduleRefGet: jest.Mock;
  let originalRedisHost: string | undefined;

  beforeEach(async () => {
    // enqueue short-circuits when REDIS_HOST is unset — the queue-path
    // tests need it present. The no-Redis path has its own test below.
    originalRedisHost = process.env.REDIS_HOST;
    process.env.REDIS_HOST = 'localhost';
    queueMock = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    moduleRefGet = jest.fn();

    const ref = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: ModuleRef,
          useValue: { get: moduleRefGet },
        },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();

    service = ref.get(JobsService);
  });

  afterEach(() => {
    if (originalRedisHost === undefined) delete process.env.REDIS_HOST;
    else process.env.REDIS_HOST = originalRedisHost;
  });

  it('drops the job (returns null, no lookup) when REDIS_HOST is unset', async () => {
    delete process.env.REDIS_HOST;
    moduleRefGet.mockReturnValue(queueMock);

    const result = await service.enqueue('notifications.email_send', {
      receiptId: 'r-1',
      to: 'u@example.com',
      title: 't',
      body: 'b',
    });

    expect(result).toBeNull();
    expect(moduleRefGet).not.toHaveBeenCalled();
    expect(queueMock.add).not.toHaveBeenCalled();
  });

  it('looks up the queue via ModuleRef and calls Queue.add with payload + jobId', async () => {
    moduleRefGet.mockReturnValue(queueMock);

    const result = await service.enqueue(
      'notifications.email_send',
      {
        receiptId: 'r-1',
        to: 'u@example.com',
        title: 't',
        body: 'b',
      },
      { jobId: 'email_send.r-1' },
    );

    expect(moduleRefGet).toHaveBeenCalledWith(
      getQueueToken(QueueName.Notifications),
      { strict: false },
    );
    expect(queueMock.add).toHaveBeenCalledWith(
      'email_send',
      expect.objectContaining({ receiptId: 'r-1', to: 'u@example.com' }),
      expect.objectContaining({ jobId: 'email_send.r-1' }),
    );
    expect(result).toEqual({ id: 'job-1' });
  });

  it('returns null and does NOT throw when the queue is missing (Redis not configured)', async () => {
    moduleRefGet.mockImplementation(() => {
      throw new Error('Nest could not find token');
    });

    const result = await service.enqueue('notifications.email_send', {
      receiptId: 'r-1',
      to: 'u@example.com',
      title: 't',
      body: 'b',
    });

    expect(result).toBeNull();
    expect(queueMock.add).not.toHaveBeenCalled();
  });

  it('caches the queue lookup so repeat enqueues skip ModuleRef.get', async () => {
    moduleRefGet.mockReturnValue(queueMock);

    await service.enqueue('notifications.email_send', {
      receiptId: 'r-1',
      to: 'a@example.com',
      title: 't',
      body: 'b',
    });
    await service.enqueue('notifications.email_send', {
      receiptId: 'r-2',
      to: 'b@example.com',
      title: 't',
      body: 'b',
    });

    expect(moduleRefGet).toHaveBeenCalledTimes(1);
    expect(queueMock.add).toHaveBeenCalledTimes(2);
  });

  it('translates `runAt` into a relative `delay` for BullMQ', async () => {
    moduleRefGet.mockReturnValue(queueMock);
    const now = Date.now();
    const future = new Date(now + 60_000);

    await service.enqueue(
      'notifications.email_send',
      { receiptId: 'r-1', to: 'u@example.com', title: 't', body: 'b' },
      { runAt: future },
    );

    // Type the mock call array so the [2] (opts) lookup isn't `any`.
    const calls = queueMock.add.mock.calls as Array<
      [string, unknown, { delay: number }]
    >;
    const opts = calls[0][2];
    // ~60s, allow a few ms drift between Date.now() readings.
    expect(opts.delay).toBeGreaterThanOrEqual(59_000);
    expect(opts.delay).toBeLessThanOrEqual(60_500);
  });
});
