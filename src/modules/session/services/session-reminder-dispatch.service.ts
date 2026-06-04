import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Op } from 'sequelize';
import { NotificationService } from '../../notification/notification.service';
import { SessionInstance } from '../entities/session-instance.entity';
import { SessionParticipant } from '../entities/session-participant.entity';
import { SessionTemplate } from '../entities/session-template.entity';
import { SessionReminderSchedule } from '../entities/session-reminder-schedule.entity';
import {
  SessionInstanceStatus,
  SessionParticipantStatus,
} from '../entities/session.enums';
import { sessionReminderForUser, type SessionRef } from '../notifications';

export interface ReminderDispatchResult {
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Dispatches due session reminders. `session_reminder_schedule` rows
 * are written at booking time (`SessionWaitlistService.scheduleReminders`)
 * but only fire here, driven by the `sessions.reminder_dispatch` sweep.
 *
 * Sweep model (locked decision): each run SELECTs every row that is due
 * (`fireAt <= now AND sentAt IS NULL`) and fans out, so a single run
 * catches up everything outstanding after downtime — not just one row.
 *
 * Idempotency: the row's `sentAt` is the dedup marker. We mark-sent
 * *before* notifying (at-most-once): re-sending a "starts in 1h" push
 * to someone is worse than rarely dropping one if `notify()` fails
 * after the mark. The cancel path already deletes unsent rows, so a
 * participant who left never reaches us.
 */
@Injectable()
export class SessionReminderDispatchService {
  constructor(
    @InjectModel(SessionReminderSchedule)
    private readonly reminderModel: typeof SessionReminderSchedule,
    private readonly notifications: NotificationService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  async dispatchDue(now: Date, limit = 500): Promise<ReminderDispatchResult> {
    const due = await this.reminderModel.findAll({
      where: { sentAt: null, fireAt: { [Op.lte]: now } },
      include: [
        {
          model: SessionInstance,
          as: 'instance',
          required: true,
          include: [{ model: SessionTemplate, as: 'template', required: true }],
        },
        { model: SessionParticipant, as: 'participant', required: true },
      ],
      order: [['fireAt', 'ASC']],
      limit,
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of due) {
      try {
        const instance = row.instance;
        const participant = row.participant;

        // Mark sent first — at-most-once. A re-run skips this row.
        await this.reminderModel.update(
          { sentAt: now },
          { where: { id: row.id } },
        );

        // Don't remind for a cancelled session or a participant who is
        // no longer attending — but the row is already marked so it
        // won't be reprocessed.
        const stillAttending =
          instance.status !== SessionInstanceStatus.Cancelled &&
          participant.status !== SessionParticipantStatus.Cancelled &&
          participant.status !== SessionParticipantStatus.Declined;
        if (!stillAttending) {
          skipped += 1;
          continue;
        }

        const ref: SessionRef = {
          id: instance.id,
          templateId: instance.templateId,
          title: instance.titleOverride ?? instance.template.title,
          startAt: instance.startAt,
          timezone: instance.template.timezone,
        };

        // notify-after-(mark): NotificationService opens its own tx.
        await this.notifications.notify(
          sessionReminderForUser(participant.userId, ref, row.kind),
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        this.logger.error?.(
          `Reminder dispatch failed for row ${row.id}: ${String(err)}`,
          undefined,
          'SessionReminderDispatchService',
        );
      }
    }

    if (sent + skipped + failed > 0) {
      this.logger.log?.(
        `Reminders dispatched: sent=${sent} skipped=${skipped} failed=${failed}`,
        'SessionReminderDispatchService',
      );
    }
    return { sent, skipped, failed };
  }
}
