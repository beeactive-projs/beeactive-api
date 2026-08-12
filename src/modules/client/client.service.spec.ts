/* eslint-disable @typescript-eslint/unbound-method -- jest assertion idiom expects on the mock spy reference; safe in tests. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { ClientService } from './client.service';
import {
  ClientRequest,
  ClientRequestStatus,
  ClientRequestType,
} from './entities/client-request.entity';
import {
  InstructorClient,
  InstructorClientStatus,
} from './entities/instructor-client.entity';
import { InstructorProfile } from '../profile/entities/instructor-profile.entity';
import { RoleService } from '../role/role.service';
import { EmailService } from '../../common/services/email.service';
import { NotificationService } from '../notification/notification.service';
import { User } from '../user/entities/user.entity';
import {
  makeModelMock,
  makeSilentLogger,
  type ModelMock,
} from '../../../test/helpers/sequelize-mocks';

/**
 * Smoke coverage for the client/instructor relationship state machine
 * — request, accept, decline, leave. These flows decide who can see
 * whose health/training data, so a regression here has real privacy
 * impact. The full coverage (notes, listing, archived bookkeeping)
 * is left as an incremental task.
 *
 * Note: ClientService also calls `User.findByPk` as a static method
 * (not via an injected model) for some lookups. We `jest.spyOn(User,
 * 'findByPk')` per test where that path matters.
 */
describe('ClientService', () => {
  let service: ClientService;
  let instructorClientModel: ModelMock;
  let clientRequestModel: ModelMock;
  let instructorProfileModel: ModelMock;
  let roleService: { userHasRole: jest.Mock };
  let emailService: {
    sendClientRequestToInstructorEmail: jest.Mock;
    sendClientRequestAcceptedEmail: jest.Mock;
    sendClientRequestDeclinedEmail: jest.Mock;
    sendClientCollaborationEndedEmail: jest.Mock;
  };
  let notificationService: { notify: jest.Mock };

  const sequelizeMock = {
    transaction: jest.fn((cb: (tx: unknown) => unknown) =>
      Promise.resolve(cb({})),
    ),
  };

  beforeEach(async () => {
    sequelizeMock.transaction.mockClear();

    instructorClientModel = makeModelMock();
    clientRequestModel = makeModelMock();
    instructorProfileModel = makeModelMock();
    roleService = { userHasRole: jest.fn().mockResolvedValue(true) };
    emailService = {
      sendClientRequestToInstructorEmail: jest
        .fn()
        .mockResolvedValue(undefined),
      sendClientRequestAcceptedEmail: jest.fn().mockResolvedValue(undefined),
      sendClientRequestDeclinedEmail: jest.fn().mockResolvedValue(undefined),
      sendClientCollaborationEndedEmail: jest.fn().mockResolvedValue(undefined),
    };
    notificationService = { notify: jest.fn().mockResolvedValue(undefined) };

    // Default: User.findByPk returns a generic profile so the email +
    // notification side-effects can run without crashing.
    jest.spyOn(User, 'findByPk').mockResolvedValue({
      id: 'u-generic',
      email: 'u@x.com',
      firstName: 'Test',
      lastName: 'User',
    } as User);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ClientService,
        {
          provide: getModelToken(InstructorClient),
          useValue: instructorClientModel,
        },
        {
          provide: getModelToken(ClientRequest),
          useValue: clientRequestModel,
        },
        {
          provide: getModelToken(InstructorProfile),
          useValue: instructorProfileModel,
        },
        { provide: Sequelize, useValue: sequelizeMock },
        { provide: RoleService, useValue: roleService },
        { provide: EmailService, useValue: emailService },
        { provide: NotificationService, useValue: notificationService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();

    service = moduleRef.get(ClientService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =====================================================================
  // Coach notes stay with the coach
  // =====================================================================
  describe('private coaching notes', () => {
    it('never selects notes when a client lists their instructors', async () => {
      instructorClientModel.findAll.mockResolvedValue([]);

      await service.getMyInstructors('cli-1');

      const opts = instructorClientModel.findAll.mock.calls[0][0];
      expect(opts.attributes).toBeDefined();
      expect(opts.attributes).not.toContain('notes');
    });

    it('omits notes from the body returned when a client leaves', async () => {
      instructorClientModel.findOne.mockResolvedValue({
        id: 'ic-1',
        instructorId: 'inst-1',
        clientId: 'cli-1',
        status: InstructorClientStatus.ACTIVE,
        startedAt: new Date(),
        notes: 'knee gives her trouble on squats',
        instructor: {
          id: 'inst-1',
          firstName: 'A',
          lastName: 'B',
          email: 'a@x.com',
        },
        client: {
          id: 'cli-1',
          firstName: 'C',
          lastName: 'D',
          email: 'c@x.com',
        },
        update: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.leaveInstructor('cli-1', 'inst-1');

      expect(result).not.toHaveProperty('notes');
      expect(JSON.stringify(result)).not.toContain('knee gives her trouble');
    });
  });

  // =====================================================================
  // getClientForInstructor
  // =====================================================================
  describe('getClientForInstructor', () => {
    it('scopes the lookup to the asking instructor', async () => {
      instructorClientModel.findOne.mockResolvedValue({
        id: 'ic-1',
        instructorId: 'inst-1',
        clientId: 'cli-1',
        status: InstructorClientStatus.ACTIVE,
        client: { id: 'cli-1', firstName: 'A', lastName: 'B' },
        createdAt: new Date(),
      });

      await service.getClientForInstructor('inst-1', 'cli-1');

      expect(instructorClientModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { instructorId: 'inst-1', clientId: 'cli-1' },
        }),
      );
    });

    it("404s on someone else's client rather than revealing the link exists", async () => {
      instructorClientModel.findOne.mockResolvedValue(null);

      await expect(
        service.getClientForInstructor('inst-1', 'not-mine'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // =====================================================================
  // requestToBeClient
  // =====================================================================
  describe('requestToBeClient', () => {
    it('rejects self-request with 400', async () => {
      jest.spyOn(User, 'findByPk').mockResolvedValueOnce({
        id: 'u-1',
        firstName: 'Alex',
        lastName: 'Test',
      } as User);

      await expect(
        service.requestToBeClient('u-1', 'u-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when target is not an instructor', async () => {
      roleService.userHasRole.mockResolvedValueOnce(false);

      await expect(
        service.requestToBeClient('user-1', 'not-instructor'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when instructor is not accepting clients', async () => {
      instructorProfileModel.findOne.mockResolvedValue({
        getDataValue: jest.fn().mockReturnValue(false),
      });

      await expect(
        service.requestToBeClient('user-1', 'instr-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when an active relationship already exists', async () => {
      instructorProfileModel.findOne.mockResolvedValue({
        getDataValue: jest.fn().mockReturnValue(true),
      });
      instructorClientModel.findOne.mockResolvedValue({
        status: InstructorClientStatus.ACTIVE,
      });

      await expect(
        service.requestToBeClient('user-1', 'instr-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a CLIENT_TO_INSTRUCTOR request and notifies the instructor', async () => {
      instructorProfileModel.findOne.mockResolvedValue({
        getDataValue: jest.fn().mockReturnValue(true),
      });
      instructorClientModel.findOne.mockResolvedValue(null);
      clientRequestModel.findOne.mockResolvedValue(null);
      const created = { id: 'r-1', fromUserId: 'user-1', toUserId: 'instr-1' };
      clientRequestModel.create.mockResolvedValue(created);

      const result = await service.requestToBeClient('user-1', 'instr-1');

      expect(result).toBe(created);
      expect(clientRequestModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fromUserId: 'user-1',
          toUserId: 'instr-1',
          type: ClientRequestType.CLIENT_TO_INSTRUCTOR,
          status: ClientRequestStatus.PENDING,
        }),
      );
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'instr-1' }),
      );
    });
  });

  // =====================================================================
  // acceptRequest
  // =====================================================================
  describe('acceptRequest', () => {
    function pendingRequest(overrides: Partial<ClientRequest> = {}) {
      return {
        id: 'r-1',
        fromUserId: 'requester-1',
        toUserId: 'recipient-1',
        type: ClientRequestType.CLIENT_TO_INSTRUCTOR,
        status: ClientRequestStatus.PENDING,
        expiresAt: new Date(Date.now() + 86_400_000),
        update: jest.fn().mockResolvedValue(undefined),
        ...overrides,
      } as unknown as ClientRequest;
    }

    it('only the recipient can accept (403 otherwise)', async () => {
      clientRequestModel.findByPk.mockResolvedValue(pendingRequest());

      await expect(
        service.acceptRequest('r-1', 'someone-else'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects an expired request with 400', async () => {
      const expired = pendingRequest({
        expiresAt: new Date(Date.now() - 86_400_000),
      });
      clientRequestModel.findByPk.mockResolvedValue(expired);

      await expect(
        service.acceptRequest('r-1', 'recipient-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an already-accepted request with 400', async () => {
      clientRequestModel.findByPk.mockResolvedValue(
        pendingRequest({ status: ClientRequestStatus.ACCEPTED }),
      );

      await expect(
        service.acceptRequest('r-1', 'recipient-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('flips the request and creates an ACTIVE relationship', async () => {
      const request = pendingRequest();
      clientRequestModel.findByPk.mockResolvedValue(request);
      // No prior relationship row inside the tx.
      instructorClientModel.findOne.mockResolvedValue(null);
      instructorClientModel.create.mockResolvedValue(undefined);

      const result = await service.acceptRequest('r-1', 'recipient-1');

      expect(result.message).toMatch(/accepted/i);
      expect(request.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: ClientRequestStatus.ACCEPTED }),
        expect.any(Object),
      );
      expect(instructorClientModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: InstructorClientStatus.ACTIVE,
        }),
        expect.any(Object),
      );
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'requester-1' }),
      );
    });
  });

  // =====================================================================
  // declineRequest
  // =====================================================================
  describe('declineRequest', () => {
    it('only the recipient can decline (403 otherwise)', async () => {
      clientRequestModel.findByPk.mockResolvedValue({
        id: 'r-1',
        fromUserId: 'a',
        toUserId: 'recipient-1',
        type: ClientRequestType.CLIENT_TO_INSTRUCTOR,
        status: ClientRequestStatus.PENDING,
        update: jest.fn(),
      });

      await expect(
        service.declineRequest('r-1', 'someone-else'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('marks DECLINED, deletes any PENDING relationship row, and notifies sender', async () => {
      const update = jest.fn().mockResolvedValue(undefined);
      clientRequestModel.findByPk.mockResolvedValue({
        id: 'r-1',
        fromUserId: 'sender-1',
        toUserId: 'recipient-1',
        type: ClientRequestType.INSTRUCTOR_TO_CLIENT,
        status: ClientRequestStatus.PENDING,
        update,
      });
      instructorClientModel.destroy.mockResolvedValue(1);

      const result = await service.declineRequest('r-1', 'recipient-1');

      expect(result.message).toMatch(/declined/i);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ status: ClientRequestStatus.DECLINED }),
      );
      expect(instructorClientModel.destroy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: InstructorClientStatus.PENDING,
          }),
        }),
      );
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'sender-1' }),
      );
    });
  });

  // =====================================================================
  // leaveInstructor
  // =====================================================================
  describe('leaveInstructor', () => {
    function activeRel(overrides: Partial<InstructorClient> = {}) {
      return {
        id: 'rel-1',
        instructorId: 'instr-1',
        clientId: 'client-1',
        status: InstructorClientStatus.ACTIVE,
        client: {
          firstName: 'Casey',
          lastName: 'Client',
          email: 'casey@x.com',
        },
        instructor: {
          firstName: 'Iris',
          lastName: 'Inst',
          email: 'iris@x.com',
        },
        update: jest.fn().mockResolvedValue(undefined),
        ...overrides,
      } as unknown as InstructorClient;
    }

    it('archives the relationship and notifies the instructor', async () => {
      const rel = activeRel();
      instructorClientModel.findOne.mockResolvedValue(rel);

      const result = await service.leaveInstructor('client-1', 'instr-1');

      // A confirmation, not the entity — the row carries the coach's
      // private notes and the caller here is the client.
      expect(result).toMatchObject({
        id: rel.id,
        instructorId: rel.instructorId,
      });
      expect(rel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: InstructorClientStatus.ARCHIVED,
        }),
      );
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'instr-1' }),
      );
    });

    it('returns 404 when no relationship exists', async () => {
      instructorClientModel.findOne.mockResolvedValue(null);

      await expect(
        service.leaveInstructor('client-1', 'instr-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects re-leaving an already-archived relationship with 400', async () => {
      instructorClientModel.findOne.mockResolvedValue(
        activeRel({ status: InstructorClientStatus.ARCHIVED }),
      );

      await expect(
        service.leaveInstructor('client-1', 'instr-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
