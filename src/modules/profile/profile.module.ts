import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserProfile } from './entities/user-profile.entity';
import { InstructorProfile } from './entities/instructor-profile.entity';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { RoleModule } from '../role/role.module';
import { UserModule } from '../user/user.module';

/**
 * Profile Module
 *
 * Manages user and instructor profiles.
 * Depends on RoleModule for assigning INSTRUCTOR role when activating.
 * Depends on UserModule for unified profile updates.
 *
 * Exports ProfileService so AuthModule can create user profiles
 * during registration.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([UserProfile, InstructorProfile]),
    RoleModule,
    UserModule,
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
