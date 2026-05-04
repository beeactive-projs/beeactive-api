import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  ChannelPreferences,
  NotificationPreference,
} from '../entities/notification-preference.entity';
import { NotificationType } from '../notification-types';
import {
  NOTIFICATION_DEFAULTS,
  resolveChannels,
} from '../notification-defaults';

/**
 * The shape returned to the FE settings page — every known
 * NotificationType with its effective channels (merged: user
 * override over system default), plus a flag indicating whether
 * the user has explicitly customized this row.
 */
export interface PreferenceView {
  type: NotificationType;
  channels: Required<ChannelPreferences>;
  isCustomized: boolean;
}

/**
 * NotificationPreferenceService
 *
 * Manages per-user channel toggles. Storage is sparse — rows only
 * exist when the user has overridden the default. Reads merge user
 * overrides over the in-code defaults map.
 */
@Injectable()
export class NotificationPreferenceService {
  constructor(
    @InjectModel(NotificationPreference)
    private readonly preferenceModel: typeof NotificationPreference,
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * Return the full settings view for the user — one entry per
   * known NotificationType, with effective channels and a flag for
   * "user has customized this".
   */
  async getForUser(userId: string): Promise<PreferenceView[]> {
    const overrides = await this.preferenceModel.findAll({
      where: { userId },
    });
    const overrideByType = new Map(overrides.map((o) => [o.type, o.channels]));

    const types = Object.keys(NOTIFICATION_DEFAULTS) as NotificationType[];
    return types.map((type) => {
      const override = overrideByType.get(type) ?? null;
      return {
        type,
        channels: resolveChannels(type, override),
        isCustomized: override !== null,
      };
    });
  }

  /**
   * Upsert a single preference. Returns the row that was written.
   */
  async update(
    userId: string,
    type: NotificationType,
    channels: ChannelPreferences,
  ): Promise<NotificationPreference> {
    const [row] = await this.preferenceModel.upsert({
      userId,
      type,
      channels,
    });
    return row;
  }

  /**
   * Bulk upsert — used by the settings page save. All rows go in a
   * single transaction so the user never sees a half-saved state.
   */
  async bulkUpdate(
    userId: string,
    updates: { type: NotificationType; channels: ChannelPreferences }[],
  ): Promise<{ written: number }> {
    if (updates.length === 0) return { written: 0 };
    await this.sequelize.transaction(async (tx) => {
      await Promise.all(
        updates.map((u) =>
          this.preferenceModel.upsert(
            { userId, type: u.type, channels: u.channels },
            { transaction: tx },
          ),
        ),
      );
    });
    return { written: updates.length };
  }

  /**
   * Reset to defaults — deletes the override row(s). When `type` is
   * omitted, resets every override for the user.
   */
  async resetToDefault(
    userId: string,
    type?: NotificationType,
  ): Promise<{ removed: number }> {
    const where: Record<string, unknown> = { userId };
    if (type) where.type = type;
    const removed = await this.preferenceModel.destroy({ where });
    return { removed };
  }
}
