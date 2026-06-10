import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { EmailService } from '../../common/services';
import { User } from '../user/entities/user.entity';
import { SocialInvitationService } from './social-invitation.service';
import { makeSilentLogger } from '../../../test/helpers/sequelize-mocks';

/**
 * Smoke tests for SocialInvitationService — guards + delegation to
 * EmailService. The actual rendering is covered by the template files.
 */
describe('SocialInvitationService (smoke)', () => {
  let service: SocialInvitationService;

  const userModel = { findByPk: jest.fn() };
  const emailService = {
    sendFriendInviteEmail: jest.fn().mockResolvedValue(undefined),
    sendInstructorSuggestionEmail: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SocialInvitationService,
        { provide: getModelToken(User), useValue: userModel },
        { provide: EmailService, useValue: emailService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: makeSilentLogger() },
      ],
    }).compile();
    service = module.get(SocialInvitationService);
  });

  describe('sendFriendInvite', () => {
    const me = {
      id: 'u-1',
      firstName: 'Maya',
      lastName: 'P',
      email: 'maya@x.io',
    };

    it('rejects when the inviter cannot be loaded', async () => {
      userModel.findByPk.mockResolvedValueOnce(null);
      await expect(
        service.sendFriendInvite('u-1', { email: 'friend@x.io' }),
      ).rejects.toThrow(BadRequestException);
      expect(emailService.sendFriendInviteEmail).not.toHaveBeenCalled();
    });

    it('blocks self-invites (case + whitespace insensitive)', async () => {
      userModel.findByPk.mockResolvedValueOnce(me);
      await expect(
        service.sendFriendInvite('u-1', { email: '  MAYA@X.IO  ' }),
      ).rejects.toThrow(/yourself/i);
    });

    it('lowercases the target and forwards inviter id for ?ref attribution', async () => {
      userModel.findByPk.mockResolvedValueOnce(me);
      await service.sendFriendInvite('u-1', {
        email: '  Friend@Example.COM  ',
        personalMessage: "  let's train  ",
      });
      expect(emailService.sendFriendInviteEmail).toHaveBeenCalledWith(
        'friend@example.com',
        'Maya P',
        'u-1',
        "let's train",
      );
    });

    it('falls back to "A friend" when both names are blank', async () => {
      userModel.findByPk.mockResolvedValueOnce({
        ...me,
        firstName: '',
        lastName: '',
      });
      await service.sendFriendInvite('u-1', { email: 'friend@x.io' });
      expect(emailService.sendFriendInviteEmail).toHaveBeenCalledWith(
        'friend@x.io',
        'A friend',
        'u-1',
        undefined,
      );
    });
  });

  describe('suggestInstructor', () => {
    const me = {
      id: 'u-2',
      firstName: 'Maya',
      lastName: 'P',
      email: 'maya@x.io',
    };

    it('rejects when the recommender cannot be loaded', async () => {
      userModel.findByPk.mockResolvedValueOnce(null);
      await expect(
        service.suggestInstructor('u-2', {
          coachName: 'Dan',
          email: 'dan@coach.io',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks self-suggestions', async () => {
      userModel.findByPk.mockResolvedValueOnce(me);
      await expect(
        service.suggestInstructor('u-2', {
          coachName: 'Maya',
          email: 'maya@x.io',
        }),
      ).rejects.toThrow(/yourself/i);
    });

    it('trims coach name + note and forwards to the email service', async () => {
      userModel.findByPk.mockResolvedValueOnce(me);
      await service.suggestInstructor('u-2', {
        coachName: '  Dan Whitlock  ',
        email: 'dan@coach.io',
        note: '  great with beginners  ',
      });
      expect(emailService.sendInstructorSuggestionEmail).toHaveBeenCalledWith(
        'dan@coach.io',
        'Dan Whitlock',
        'Maya P',
        'great with beginners',
      );
    });
  });
});
