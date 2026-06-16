import {
  BadRequestException,
  Inject,
  Injectable,
  type LoggerService,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { EmailService } from '../../common/services';
import { User } from '../user/entities/user.entity';
import { SendFriendInviteDto } from './dto/send-friend-invite.dto';
import { SuggestInstructorDto } from './dto/suggest-instructor.dto';

/**
 * Lightweight "social" invitation flows used by the home page —
 * separate from the existing group-invitation entity / lifecycle.
 *
 * Both flows are stateless: we send the email and return. No DB row,
 * no follow-up tracking yet. Attribution lives in the URL itself
 * (the friend invite carries `?ref=<userId>`), so when the BE picks
 * up referral tracking it can be wired here without a schema change.
 *
 * Guards:
 *   - You can't invite yourself.
 *   - The recipient must be a syntactically valid email (DTO validates).
 *   - Per-user throttling sits on the controller (10 sends / hour).
 */
@Injectable()
export class SocialInvitationService {
  constructor(
    @InjectModel(User) private readonly userModel: typeof User,
    private readonly emailService: EmailService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  async sendFriendInvite(
    inviterId: string,
    dto: SendFriendInviteDto,
  ): Promise<void> {
    const inviter = await this.userModel.findByPk(inviterId, {
      attributes: ['id', 'firstName', 'lastName', 'email'],
    });
    if (!inviter) {
      // Shouldn't happen — JWT guard ran upstream — but fail loud if it does.
      throw new BadRequestException('Inviter not found.');
    }

    const target = dto.email.trim().toLowerCase();
    if (target === inviter.email.toLowerCase()) {
      throw new BadRequestException("You can't invite yourself.");
    }

    const inviterName =
      `${inviter.firstName ?? ''} ${inviter.lastName ?? ''}`.trim() ||
      'A friend';

    await this.emailService.sendFriendInviteEmail(
      target,
      inviterName,
      inviter.id,
      dto.personalMessage?.trim() || undefined,
    );

    this.logger.log(
      `friend-invite sent inviter=${inviter.id} to=${target}`,
      'SocialInvitationService',
    );
  }

  async suggestInstructor(
    recommenderId: string,
    dto: SuggestInstructorDto,
  ): Promise<void> {
    const recommender = await this.userModel.findByPk(recommenderId, {
      attributes: ['id', 'firstName', 'lastName', 'email'],
    });
    if (!recommender) {
      throw new BadRequestException('Recommender not found.');
    }

    const target = dto.email.trim().toLowerCase();
    if (target === recommender.email.toLowerCase()) {
      throw new BadRequestException("You can't suggest yourself.");
    }

    const recommenderName =
      `${recommender.firstName ?? ''} ${recommender.lastName ?? ''}`.trim() ||
      'A MotionHive user';

    await this.emailService.sendInstructorSuggestionEmail(
      target,
      dto.coachName.trim(),
      recommenderName,
      dto.note?.trim() || undefined,
    );

    this.logger.log(
      `instructor-suggestion sent recommender=${recommender.id} coachEmail=${target}`,
      'SocialInvitationService',
    );
  }
}
