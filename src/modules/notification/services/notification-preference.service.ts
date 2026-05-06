import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  ChannelPreferences,
  NotificationPreference,
} from '../entities/notification-preference.entity';
import { NotificationType } from '../notification-types';
import {
  CATEGORY_DISPLAY_ORDER,
  CATEGORY_META,
  CATEGORY_TO_TYPES,
  NotificationCategory,
} from '../notification-categories';
import {
  NOTIFICATION_DEFAULTS,
  resolveChannels,
} from '../notification-defaults';

/**
 * Channels we expose on the settings page. We deliberately omit
 * in-app — it's always on by design (the bell is the user's inbox)
 * — push (not implemented yet) and sms (not implemented yet). When
 * push ships we'll add it back as its own column.
 */
export type ConfigurableChannel = 'email';

export interface ConfigurableChannelPreferences {
  email: boolean;
}

/**
 * One category row in the settings page. The FE renders six of
 * these; each gets a single Email toggle.
 *
 * `isCustomized` is true when ANY of the underlying NotificationTypes
 * has a user override — that drives the "Reset to default" button.
 */
export interface CategoryPreferenceView {
  category: NotificationCategory;
  label: string;
  description: string;
  channels: ConfigurableChannelPreferences;
  isCustomized: boolean;
}

/**
 * NotificationPreferenceService
 *
 * Per-user channel toggles. The user-facing surface is grouped by
 * NotificationCategory (~6 rows). Storage is per NotificationType
 * (~30 rows) — when the user toggles a category, we fan the change
 * out to all member types under the hood.
 *
 * This split keeps the FE simple while preserving the option to add
 * per-type overrides later (a power-user feature) without a schema
 * change.
 */
@Injectable()
export class NotificationPreferenceService {
  constructor(
    @InjectModel(NotificationPreference)
    private readonly preferenceModel: typeof NotificationPreference,
    private readonly sequelize: Sequelize,
  ) {}

  // ────────────────────────────────────────────────────────────
  // Category-level surface (the only API the FE consumes)
  // ────────────────────────────────────────────────────────────

  /**
   * Return one row per NotificationCategory with its effective
   * configurable channels (merged: user override over system default).
   *
   * A category's `email` is "on" when **any** of its underlying types
   * has email enabled in the resolved channels. That matches the
   * mental model "do I get emails about this category?" — answer is
   * yes if at least one event under it would email me. In practice,
   * defaults are uniform across a category so the per-type values
   * agree, but this rule keeps the UI honest if they ever diverge
   * (e.g. via direct per-type writes from a power-user surface).
   */
  async getForUser(userId: string): Promise<CategoryPreferenceView[]> {
    const overrides = await this.preferenceModel.findAll({ where: { userId } });
    const overrideByType = new Map(overrides.map((o) => [o.type, o.channels]));

    return CATEGORY_DISPLAY_ORDER.map((category) => {
      const types = CATEGORY_TO_TYPES[category];
      const meta = CATEGORY_META[category];

      const resolved = types.map((type) =>
        resolveChannels(type, overrideByType.get(type) ?? null),
      );
      const anyEmail = resolved.some((r) => r.email);
      const isCustomized = types.some((type) => overrideByType.has(type));

      return {
        category,
        label: meta.label,
        description: meta.description,
        channels: { email: anyEmail },
        isCustomized,
      };
    });
  }

  /**
   * Apply a category-level update. The user toggled "Sessions email
   * = off"; we expand that into one upsert per type under the
   * category, all in a single transaction.
   *
   * Other channels (in_app, push, sms) keep their current values —
   * we only touch the channel(s) the user actually changed.
   */
  async updateCategoriesForUser(
    userId: string,
    updates: {
      category: NotificationCategory;
      channels: ConfigurableChannelPreferences;
    }[],
  ): Promise<{ written: number }> {
    if (updates.length === 0) return { written: 0 };

    // Pre-load existing overrides for everything we're about to touch
    // so we can preserve channels the user didn't change.
    const allTypes = updates.flatMap((u) => CATEGORY_TO_TYPES[u.category]);
    const existing = await this.preferenceModel.findAll({
      where: { userId, type: { [Op.in]: allTypes } },
    });
    const existingByType = new Map(existing.map((e) => [e.type, e.channels]));

    let written = 0;
    await this.sequelize.transaction(async (tx) => {
      for (const update of updates) {
        for (const type of CATEGORY_TO_TYPES[update.category]) {
          // Merge the new email value over the existing per-type
          // channels, falling back to the system default for the
          // channels we don't manage here (in_app/push/sms).
          const base =
            existingByType.get(type) ?? NOTIFICATION_DEFAULTS[type] ?? {};
          const next: ChannelPreferences = {
            ...base,
            email: update.channels.email,
          };
          await this.preferenceModel.upsert(
            { userId, type, channels: next },
            { transaction: tx },
          );
          written++;
        }
      }
    });
    return { written };
  }

  /**
   * Reset to defaults. Without `category` argument: wipe every
   * override the user has. With `category`: wipe only the rows that
   * belong to that category.
   */
  async resetToDefault(
    userId: string,
    category?: NotificationCategory,
  ): Promise<{ removed: number }> {
    const where: Record<string, unknown> = { userId };
    if (category) {
      where.type = { [Op.in]: CATEGORY_TO_TYPES[category] };
    }
    const removed = await this.preferenceModel.destroy({ where });
    return { removed };
  }
}
