import { getModelToken } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { EmailService } from '../../common/services/email.service';
import {
  makeModelMock,
  makeSilentLogger,
  type ModelMock,
} from '../../../test/helpers/sequelize-mocks';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { Feedback } from './entities/feedback.entity';
import { FeedbackService } from './feedback.service';

/**
 * Smoke tests for the public feedback pipeline. The load-bearing rule
 * (per CLAUDE.md → modules → feedback): the confirmation email goes to
 * the submitter-supplied `email` in the DTO body, NEVER to an address
 * looked up via a body-supplied `userId`. `userId` is JWT-derived and
 * passed in by the controller as a second arg — the service must never
 * read it from the DTO.
 *
 * Coverage:
 *   - constructor boots
 *   - happy-path create persists the row + fires confirmation to the
 *     DTO email (not to any user-table lookup)
 *   - `userId` arg is wired straight to the row; body has no userId
 *     field at all (DTO smoke test)
 *   - anonymous (null userId) still persists, no email when none given
 *   - email failure is swallowed (fire-and-forget — UX must not break
 *     on Resend hiccup) and logged via Winston
 *   - findAll returns rows newest-first (the only ordering FE relies on)
 *   - DTO-level validation: empty message → reject, bad email → reject
 */
describe('FeedbackService', () => {
  let service: FeedbackService;
  let feedbackModel: ModelMock;
  let emailService: { sendFeedbackConfirmation: jest.Mock };
  let logger: ReturnType<typeof makeSilentLogger>;

  beforeEach(async () => {
    jest.clearAllMocks();
    feedbackModel = makeModelMock();
    emailService = { sendFeedbackConfirmation: jest.fn() };
    logger = makeSilentLogger();

    const module = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: getModelToken(Feedback), useValue: feedbackModel },
        { provide: EmailService, useValue: emailService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: logger },
      ],
    }).compile();

    service = module.get(FeedbackService);
  });

  it('boots', () => {
    expect(service).toBeDefined();
  });

  // ───── create ───────────────────────────────────────────────────

  describe('create', () => {
    const baseDto: CreateFeedbackDto = {
      type: 'BUG',
      title: 'Login button not working',
      message: 'When I click the login button on mobile, nothing happens.',
      email: 'submitter@example.com',
    };

    it('persists the row with JWT-derived userId, NOT a body userId', async () => {
      const created = { id: 'fb-1' };
      feedbackModel.create.mockResolvedValueOnce(created);
      emailService.sendFeedbackConfirmation.mockResolvedValueOnce(undefined);

      // Caller passes the JWT-derived userId as the second arg.
      const out = await service.create(baseDto, 'jwt-user-id');

      expect(feedbackModel.create).toHaveBeenCalledTimes(1);
      const persisted = feedbackModel.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(persisted).toMatchObject({
        type: 'BUG',
        title: 'Login button not working',
        message: 'When I click the login button on mobile, nothing happens.',
        email: 'submitter@example.com',
        userId: 'jwt-user-id',
      });
      expect(out).toBe(created);
    });

    it('sends the confirmation to the DTO email (NOT to any user lookup)', async () => {
      feedbackModel.create.mockResolvedValueOnce({ id: 'fb-2' });
      emailService.sendFeedbackConfirmation.mockResolvedValueOnce(undefined);

      await service.create(baseDto, 'jwt-user-id');

      // The email destination is the submitter-supplied address — even
      // if a (different) authenticated user is on the request.
      expect(emailService.sendFeedbackConfirmation).toHaveBeenCalledWith(
        'submitter@example.com',
        'BUG',
        'Login button not working',
      );
    });

    it('persists message verbatim — service does no silent mutation', async () => {
      // The service layer doesn't trim/sanitize; those are DTO concerns
      // (or there are none). Lock in: what comes in goes in. If anyone
      // later adds a transform, this test forces them to update it
      // consciously rather than silently rewriting user input.
      const raw =
        '   leading + trailing   \n\n  multi-line that the service must NOT touch  ';
      feedbackModel.create.mockResolvedValueOnce({ id: 'fb-raw' });
      emailService.sendFeedbackConfirmation.mockResolvedValueOnce(undefined);

      await service.create({ ...baseDto, message: raw }, 'jwt-user-id');

      const persisted = feedbackModel.create.mock.calls[0][0] as {
        message: string;
      };
      expect(persisted.message).toBe(raw);
    });

    it('accepts anonymous feedback (null userId, no email → no send)', async () => {
      feedbackModel.create.mockResolvedValueOnce({ id: 'fb-anon' });

      const { email: _ignored, ...withoutEmail } = baseDto;
      void _ignored;

      await service.create(withoutEmail as CreateFeedbackDto, null);

      const persisted = feedbackModel.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(persisted.userId).toBeNull();
      expect(persisted.email).toBeNull();
      expect(emailService.sendFeedbackConfirmation).not.toHaveBeenCalled();
    });

    it('swallows email-send failures (fire-and-forget) and logs them', async () => {
      feedbackModel.create.mockResolvedValueOnce({ id: 'fb-3' });
      emailService.sendFeedbackConfirmation.mockRejectedValueOnce(
        new Error('Resend 500'),
      );

      // Must NOT throw — the row insert succeeded; mail is best-effort.
      await expect(service.create(baseDto, null)).resolves.toMatchObject({
        id: 'fb-3',
      });

      // Give the unhandled .catch() a tick to run.
      await new Promise((r) => setImmediate(r));

      expect(logger.error).toHaveBeenCalledTimes(1);
      const [msg, ctx] = logger.error.mock.calls[0];
      expect(String(msg)).toContain('submitter@example.com');
      expect(String(msg)).toContain('Resend 500');
      expect(ctx).toBe('FeedbackService');
    });
  });

  // ───── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns rows ordered newest-first', async () => {
      const rows = [{ id: 'fb-newer' }, { id: 'fb-older' }];
      feedbackModel.findAll.mockResolvedValueOnce(rows);

      const out = await service.findAll();

      expect(feedbackModel.findAll).toHaveBeenCalledWith({
        order: [['createdAt', 'DESC']],
      });
      expect(out).toBe(rows);
    });
  });

  // ───── DTO validation (controller boundary) ─────────────────────

  describe('CreateFeedbackDto validation', () => {
    const good = {
      type: 'BUG',
      title: 'Login button not working',
      message: 'When I click the login button on mobile, nothing happens.',
      email: 'user@example.com',
    };

    it('passes for a well-formed payload', async () => {
      const dto = plainToInstance(CreateFeedbackDto, good);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects an empty / too-short message', async () => {
      const dto = plainToInstance(CreateFeedbackDto, { ...good, message: '' });
      const errors = await validate(dto);
      const msgError = errors.find((e) => e.property === 'message');
      expect(msgError).toBeDefined();
    });

    it('rejects a malformed email', async () => {
      const dto = plainToInstance(CreateFeedbackDto, {
        ...good,
        email: 'not-an-email',
      });
      const errors = await validate(dto);
      const emailError = errors.find((e) => e.property === 'email');
      expect(emailError).toBeDefined();
      expect(emailError?.constraints).toHaveProperty('isEmail');
    });

    it('rejects an attacker-supplied `userId` when whitelist mode is on', async () => {
      // ValidationPipe runs with `whitelist: true, forbidNonWhitelisted: true`
      // globally (see main.ts), so unknown DTO fields are rejected at the
      // boundary even if class-transformer copies them onto the instance.
      // If someone ever adds `userId` to CreateFeedbackDto, this test breaks.
      const dto = plainToInstance(CreateFeedbackDto, {
        ...good,
        userId: 'attacker-supplied',
      });
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      const offending = errors.find((e) => e.property === 'userId');
      expect(offending).toBeDefined();
      expect(offending?.constraints).toHaveProperty('whitelistValidation');
    });
  });
});
