import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ParticipantProfile } from './entities/participant-profile.entity';
import { OrganizerProfile } from './entities/organizer-profile.entity';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { RoleModule } from '../role/role.module';
import { UserModule } from '../user/user.module';

/**
 * Profile Module
 *
 * Manages participant and organizer profiles.
 * Depends on RoleModule for assigning ORGANIZER role when activating.
 * Depends on UserModule for unified profile updates.
 *
 * Exports ProfileService so AuthModule can create participant profiles
 * during registration.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([ParticipantProfile, OrganizerProfile]),
    RoleModule,
    UserModule,
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
