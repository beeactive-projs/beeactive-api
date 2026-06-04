import { getModelToken } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { UniqueConstraintError } from 'sequelize';

import {
  makeModelMock,
  makeSilentLogger,
  type ModelMock,
} from '../../../test/helpers/sequelize-mocks';

// The shared ModelMock doesn't include `count` (it's specific to this service),
// so extend the type locally rather than adding a one-off to the helper.
type WaitlistModelMock = ModelMock & { count: jest.Mock };
import { EmailService } from '../../common/services/email.service';
import { EmailVerifierService } from '../../common/services/email-verifier.service';
import { WaitlistRole } from '../../common/enums/waitlist-role.enum';
import { Waitlist } from './entities/waitlist.entity';
import { WaitlistService } from './waitlist.service';

/**
 * Smoke tests for the LANDING-PAGE WaitlistService (NOT session overflow).
 *
 * Covers the behaviour the marketing site depends on:
 *   - constructor boots with all injected deps
 *   - create: deliverability gate runs BEFORE the row insert
 *   - create: happy path persists the row and fires the confirmation email
 *   - create: UniqueConstraintError is swallowed and the existing row returned
 *             WITHOUT re-sending the email (anti-abuse — the endpoint must
 *             not be turned into an email-bomb relay)
 *   - findAll: returns rows ordered by createdAt DESC
 *   - count: returns the raw total
 */
describe('WaitlistService', () => {
  let service: WaitlistService;
  let waitlistModel: WaitlistModelMock;
  let emailService: { sendWaitlistConfirmation: jest.Mock };
  let emailVerifier: { assertDeliverable: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    waitlistModel = { ...makeModelMock(), count: jest.fn() };

    emailService = {
      sendWaitlistConfirmation: jest.fn().mockResolvedValue(undefined),
    };
    emailVerifier = {
      assertDeliverable: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        WaitlistService,
        { provide: getModelToken(Waitlist), useValue: waitlistModel },
        { provide: EmailService, useValue: emailService },
        { provide: EmailVerifierService, useValue: emailVerifier },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();

    service = module.get(WaitlistService);
  });

  // ───── constructor ────────────────────────────────────────────────

  describe('constructor', () => {
    it('boots with all dependencies injected', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(WaitlistService);
    });
  });

  // ───── create ─────────────────────────────────────────────────────

  describe('create', () => {
    it('runs the deliverability check BEFORE inserting the row', async () => {
      const order: string[] = [];
      emailVerifier.assertDeliverable.mockImplementationOnce(() => {
        order.push('verify');
        return Promise.resolve();
      });
      waitlistModel.create.mockImplementationOnce(() => {
        order.push('insert');
        return Promise.resolve({ id: 'w-1', email: 'john@example.com' });
      });

      await service.create({ email: 'john@example.com' });

      expect(order).toEqual(['verify', 'insert']);
      expect(emailVerifier.assertDeliverable).toHaveBeenCalledWith(
        'john@example.com',
      );
    });

    it('persists the entry and fires confirmation on first signup', async () => {
      const created = {
        id: 'w-2',
        email: 'jane@example.com',
        name: 'Jane',
        role: WaitlistRole.INSTRUCTOR,
        source: 'blog-cta',
      };
      waitlistModel.create.mockResolvedValueOnce(created);

      const out = await service.create({
        email: 'jane@example.com',
        name: 'Jane',
        role: WaitlistRole.INSTRUCTOR,
        source: 'blog-cta',
      });

      expect(waitlistModel.create).toHaveBeenCalledWith({
        email: 'jane@example.com',
        name: 'Jane',
        role: WaitlistRole.INSTRUCTOR,
        source: 'blog-cta',
      });
      expect(emailService.sendWaitlistConfirmation).toHaveBeenCalledWith(
        'jane@example.com',
        'Jane',
      );
      expect(out).toBe(created);
    });

    it('does not throw if the confirmation email send fails (fire-and-forget)', async () => {
      waitlistModel.create.mockResolvedValueOnce({
        id: 'w-3',
        email: 'flaky@example.com',
      });
      emailService.sendWaitlistConfirmation.mockRejectedValueOnce(
        new Error('resend 500'),
      );

      await expect(
        service.create({ email: 'flaky@example.com' }),
      ).resolves.toMatchObject({ id: 'w-3' });

      // Let the floating promise settle so the .catch runs before teardown.
      await new Promise((r) => setImmediate(r));
    });

    it('returns the existing row on duplicate email and does NOT re-send the email', async () => {
      // Real UniqueConstraintError takes an options object; the inner shape
      // doesn't matter for this branch — instanceof is all the service checks.
      const dupErr = new UniqueConstraintError({ errors: [] });
      waitlistModel.create.mockRejectedValueOnce(dupErr);

      const existing = {
        id: 'w-existing',
        email: 'dup@example.com',
        name: 'Already Here',
      };
      waitlistModel.findOne.mockResolvedValueOnce(existing);

      const out = await service.create({
        email: 'dup@example.com',
        name: 'New Name Ignored',
      });

      expect(waitlistModel.findOne).toHaveBeenCalledWith({
        where: { email: 'dup@example.com' },
      });
      expect(out).toBe(existing);
      // Anti-abuse: re-POSTing must not trigger another confirmation send.
      expect(emailService.sendWaitlistConfirmation).not.toHaveBeenCalled();
    });

    it('re-throws non-unique DB errors (does not swallow real failures)', async () => {
      const boom = new Error('connection reset');
      waitlistModel.create.mockRejectedValueOnce(boom);

      await expect(service.create({ email: 'x@example.com' })).rejects.toBe(
        boom,
      );
      expect(emailService.sendWaitlistConfirmation).not.toHaveBeenCalled();
    });
  });

  // ───── findAll ────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all entries ordered by createdAt DESC', async () => {
      const rows = [
        { id: 'w-a', email: 'a@example.com' },
        { id: 'w-b', email: 'b@example.com' },
      ];
      waitlistModel.findAll.mockResolvedValueOnce(rows);

      const out = await service.findAll();

      expect(waitlistModel.findAll).toHaveBeenCalledWith({
        order: [['createdAt', 'DESC']],
      });
      expect(out).toBe(rows);
    });
  });

  // ───── count ──────────────────────────────────────────────────────

  describe('count', () => {
    it('returns the raw count from the model', async () => {
      waitlistModel.count.mockResolvedValueOnce(42);

      const out = await service.count();

      expect(out).toBe(42);
      expect(waitlistModel.count).toHaveBeenCalledWith();
    });
  });
});
