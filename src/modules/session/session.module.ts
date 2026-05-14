import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { SessionTemplate } from './entities/session-template.entity';
import { SessionInstance } from './entities/session-instance.entity';
import { SessionParticipant } from './entities/session-participant.entity';
import { SessionReminderSchedule } from './entities/session-reminder-schedule.entity';
import { RecurrenceService } from './services/recurrence.service';
import { SessionTemplateService } from './services/session-template.service';
import { SessionTemplateController } from './session-template.controller';
import { RoleModule } from '../role/role.module';

@Module({
  imports: [
    SequelizeModule.forFeature([
      SessionTemplate,
      SessionInstance,
      SessionParticipant,
      SessionReminderSchedule,
    ]),
    RoleModule,
  ],
  controllers: [SessionTemplateController],
  providers: [RecurrenceService, SessionTemplateService],
  exports: [RecurrenceService, SessionTemplateService],
})
export class SessionModule {}
