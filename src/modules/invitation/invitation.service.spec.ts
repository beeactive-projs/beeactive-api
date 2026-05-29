/* eslint-disable @typescript-eslint/unbound-method -- jest assertion idiom expects on the mock spy reference; safe in tests. */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import { Sequelize } from 'sequelize-typescript';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { InvitationService } from './invitation.service';
import { Invitation } from './entities/invitation.entity';
import { GroupMember } from '../group/entities/group-member.entity';
import { GroupService } from '../group/group.service';
import { RoleService } from '../role/role.service';
import { CryptoService } from '../../common/services/crypto.service';
import { EmailService } from '../../common/services/email.service';
import { NotificationService } from '../notification/notification.service';
import { User } from '../user/entities/user.entity';
import {
  makeModelMock,
  makeSilentLogger,
  type ModelMock,
} from '../../../test/helpers/sequelize-mocks';

/**
 * Smoke coverage for the group-invitation flow. Owner sends, invitee
 * accepts/declines. Token validation + email-binding are the
 * load-bearing security checks; we cover those plus the lifecycle
 * guards (expired, already responded).
 */
describe('InvitationService', () => {
  let service: InvitationService;
  let invitationModel: ModelMock;
  let memberModel: ModelMock;
  let groupService: {
    assertOwnerAndGet: jest.Mock;
    addMember: jest.Mock;
  };
  let roleService: { findByName: jest.Mock; assignRoleToUser: jest.Mock };
  let cryptoService: { generateToken: jest.Mock; hashToken: jest.Mock };
  let emailService: {
    sendInvitationEmail: jest.Mock;
    sendInvitationAcceptedEmail: jest.Mock;
  };
  let notificationService: { notify: jest.Mock };
  let configService: { get: jest.Mock };

  const tx = {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  };
  const sequelize = { transaction: jest.fn().mockResolvedValue(tx) };

  beforeEach(async () => {
    tx.commit.mockClear();
    tx.rollback.mockClear();
    sequelize.transaction.mockClear();
    sequelize.transaction.mockResolvedValue(tx);

    invitationModel = makeModelMock();
    memberModel = makeModelMock();
    groupService = {
      assertOwnerAndGet: jest
        .fn()
        .mockResolvedValue({ id: 'g-1', name: 'Yoga Wednesdays' }),
      addMember: jest.fn().mockResolvedValue(undefined),
    };
    roleService = {
      findByName: jest.fn().mockResolvedValue({ id: 'role-user' }),
      assignRoleToUser: jest.fn().mockResolvedValue(undefined),
    };
    cryptoService = {
      generateToken: jest.fn().mockReturnValue('plain-token'),
      hashToken: jest.fn().mockReturnValue('hashed-token'),
    };
    emailService = {
      sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
      sendInvitationAcceptedEmail: jest.fn().mockResolvedValue(undefined),
    };
    notificationService = { notify: jest.fn().mockResolvedValue(undefined) };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'FRONTEND_URL') return 'https://app.test';
        if (key === 'NODE_ENV') return 'test';
        return null;
      }),
    };

    // Default stubs for the static User helpers used by the service.
    jest
      .spyOn(User, 'findByPk')
      .mockResolvedValue({ firstName: 'Iris', lastName: 'Inst' } as User);
    jest.spyOn(User, 'findOne').mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        InvitationService,
        { provide: getModelToken(Invitation), useValue: invitationModel },
        { provide: getModelToken(GroupMember), useValue: memberModel },
        { provide: Sequelize, useValue: sequelize },
        { provide: GroupService, useValue: groupService },
        { provide: RoleService, useValue: roleService },
        { provide: CryptoService, useValue: cryptoService },
        { provide: EmailService, useValue: emailService },
        { provide: NotificationService, useValue: notificationService },
        { provide: ConfigService, useValue: configService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();

    service = moduleRef.get(InvitationService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =====================================================================
  // create
  // =====================================================================
  describe('create', () => {
    it('rejects when caller is not the group owner (delegates to GroupService)', async () => {
      groupService.assertOwnerAndGet.mockRejectedValue(
        new ForbiddenException('Only the group owner can do this'),
      );

      await expect(
        service.create('not-owner', {
          groupId: 'g-1',
          email: 'invitee@x.com',
          roleName: 'USER',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when invitee is already a member', async () => {
      memberModel.findOne.mockResolvedValue({ id: 'm-existing' });

      await expect(
        service.create('owner-1', {
          groupId: 'g-1',
          email: 'invitee@x.com',
          roleName: 'USER',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when an active invitation already exists', async () => {
      memberModel.findOne.mockResolvedValue(null);
      invitationModel.findOne.mockResolvedValue({
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      await expect(
        service.create('owner-1', {
          groupId: 'g-1',
          email: 'invitee@x.com',
          roleName: 'USER',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates an invitation, emails the invitee, and returns the link', async () => {
      memberModel.findOne.mockResolvedValue(null);
      invitationModel.findOne.mockResolvedValue(null);
      const created = { id: 'inv-1', email: 'invitee@x.com' };
      invitationModel.create.mockResolvedValue(created);

      const result = await service.create('owner-1', {
        groupId: 'g-1',
        email: 'invitee@x.com',
        roleName: 'USER',
      });

      expect(result.invitation).toBe(created);
      expect(emailService.sendInvitationEmail).toHaveBeenCalledWith(
        'invitee@x.com',
        'plain-token',
        expect.any(String),
        'Yoga Wednesdays',
        undefined,
      );
      // Hashed token stored, plain token never persisted.
      expect(invitationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'hashed-token' }),
      );
    });

    it('also fires a bell notification when the invitee already has an account', async () => {
      memberModel.findOne.mockResolvedValue(null);
      invitationModel.findOne.mockResolvedValue(null);
      invitationModel.create.mockResolvedValue({ id: 'inv-1' });
      jest
        .spyOn(User, 'findOne')
        .mockResolvedValue({ id: 'invitee-1' } as User);

      await service.create('owner-1', {
        groupId: 'g-1',
        email: 'invitee@x.com',
        roleName: 'USER',
      });

      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'invitee-1' }),
      );
    });
  });

  // =====================================================================
  // accept
  // =====================================================================
  describe('accept', () => {
    function pendingInvite(overrides: Partial<Invitation> = {}) {
      return {
        id: 'inv-1',
        inviterId: 'owner-1',
        email: 'invitee@x.com',
        groupId: 'g-1',
        roleId: 'role-user',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 86_400_000),
        acceptedAt: null,
        declinedAt: null,
        group: { id: 'g-1', name: 'Yoga' },
        update: jest.fn().mockResolvedValue(undefined),
        ...overrides,
      } as unknown as Invitation;
    }

    it('returns 404 for an unknown token', async () => {
      invitationModel.findOne.mockResolvedValue(null);

      await expect(
        service.accept('plain-token', 'user-1', 'invitee@x.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an expired invitation with 400', async () => {
      invitationModel.findOne.mockResolvedValue(
        pendingInvite({ expiresAt: new Date(Date.now() - 86_400_000) }),
      );

      await expect(
        service.accept('plain-token', 'user-1', 'invitee@x.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when accepting user email mismatches the invitation', async () => {
      invitationModel.findOne.mockResolvedValue(pendingInvite());

      await expect(
        service.accept('plain-token', 'user-1', 'someone-else@x.com'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('adds member, assigns role, marks accepted, and notifies inviter', async () => {
      const invitation = pendingInvite();
      invitationModel.findOne.mockResolvedValue(invitation);

      const result = await service.accept(
        'plain-token',
        'user-1',
        'invitee@x.com',
      );

      expect(result).toEqual({
        message: expect.stringContaining('accepted'),
        groupId: 'g-1',
      });
      expect(groupService.addMember).toHaveBeenCalledWith('g-1', 'user-1', tx);
      expect(roleService.assignRoleToUser).toHaveBeenCalled();
      expect(invitation.update).toHaveBeenCalledWith(
        expect.objectContaining({ acceptedAt: expect.any(Date) }),
        expect.objectContaining({ transaction: tx }),
      );
      expect(tx.commit).toHaveBeenCalled();
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'owner-1' }),
      );
    });

    it('rolls back the tx if addMember fails', async () => {
      invitationModel.findOne.mockResolvedValue(pendingInvite());
      groupService.addMember.mockRejectedValueOnce(new Error('db boom'));

      await expect(
        service.accept('plain-token', 'user-1', 'invitee@x.com'),
      ).rejects.toThrow('db boom');
      expect(tx.rollback).toHaveBeenCalled();
      expect(tx.commit).not.toHaveBeenCalled();
      expect(notificationService.notify).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  // decline
  // =====================================================================
  describe('decline', () => {
    function pendingInvite(overrides: Partial<Invitation> = {}) {
      return {
        id: 'inv-1',
        inviterId: 'owner-1',
        email: 'invitee@x.com',
        groupId: 'g-1',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 86_400_000),
        acceptedAt: null,
        declinedAt: null,
        group: { id: 'g-1', name: 'Yoga' },
        update: jest.fn().mockResolvedValue(undefined),
        ...overrides,
      } as unknown as Invitation;
    }

    it('returns 404 for an unknown token', async () => {
      invitationModel.findOne.mockResolvedValue(null);

      await expect(
        service.decline('plain-token', 'invitee@x.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an already-responded invitation with 400', async () => {
      invitationModel.findOne.mockResolvedValue(
        pendingInvite({ acceptedAt: new Date() }),
      );

      await expect(
        service.decline('plain-token', 'invitee@x.com'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when email mismatches the invitation', async () => {
      invitationModel.findOne.mockResolvedValue(pendingInvite());

      await expect(
        service.decline('plain-token', 'someone-else@x.com'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('marks declined and notifies inviter without leaking invitee email', async () => {
      const invitation = pendingInvite();
      invitationModel.findOne.mockResolvedValue(invitation);
      // No User row exists for the email — body should fall back to a
      // generic "A user" via the builder; importantly, the email must
      // NOT be the body content.
      jest.spyOn(User, 'findOne').mockResolvedValue(null);

      await service.decline('plain-token', 'invitee@x.com');

      expect(invitation.update).toHaveBeenCalledWith(
        expect.objectContaining({ declinedAt: expect.any(Date) }),
      );
      const notifyArgs = notificationService.notify.mock.calls[0][0] as {
        body: string;
      };
      expect(notifyArgs.body).not.toContain('invitee@x.com');
    });
  });
});
