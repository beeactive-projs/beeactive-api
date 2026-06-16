import { Test } from '@nestjs/testing';
import { HealthCheckService, SequelizeHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const health = { check: jest.fn().mockResolvedValue({ status: 'ok' }) };
  const db = {
    pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
  };
  const healthService = { getAppConfig: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const ref = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: health },
        { provide: SequelizeHealthIndicator, useValue: db },
        { provide: HealthService, useValue: healthService },
      ],
    }).compile();
    controller = ref.get(HealthController);
  });

  it('liveness (/health) does NOT touch the DB — Railway polls this every ~15s', () => {
    const res = controller.check();
    expect(res).toEqual({ status: 'ok', uptime: expect.any(Number) });
    // The whole point of the fix: liveness must not ping Postgres, or
    // Neon never scales to zero and burns the compute allowance.
    expect(db.pingCheck).not.toHaveBeenCalled();
    expect(health.check).not.toHaveBeenCalled();
  });

  it('readiness (/health/db) pings the database', async () => {
    await controller.checkDb();
    expect(health.check).toHaveBeenCalledTimes(1);
    // The indicator passed to health.check should exercise the DB ping.
    const indicators = health.check.mock.calls[0][0] as Array<() => unknown>;
    await indicators[0]();
    expect(db.pingCheck).toHaveBeenCalledWith('database');
  });
});
