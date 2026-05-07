import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Session } from './entities/session.entity';
import { SessionParticipant } from './entities/session-participant.entity';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { RoleModule } from '../role/role.module';
import { GroupMember } from '../group/entities/group-member.entity';
import { InstructorClient } from '../client/entities/instructor-client.entity';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Session,
      SessionParticipant,
      GroupMember,
      InstructorClient,
    ]),
    RoleModule,
    SearchModule,
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
