import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResponse,
  getOffset,
} from '../../../common/dto/pagination.dto';
import { ListDbRowsDto } from '../dto/list-db-rows.dto';
import { GLOBAL_REDACT_PATTERNS } from '../admin.constants';
import { DB_BROWSER_REGISTRY, type DbBrowserEntry } from '../db-registry';

const REDACTED = '[REDACTED]';

/**
 * Read-only generic table browser (SUPER_ADMIN only). The `:table` param
 * is resolved against the static whitelist registry — it never reaches
 * raw SQL, so there is no table-name injection surface. Secret columns
 * are stripped twice (per-table list + global regex). Only count/read
 * methods are ever called.
 */
@Injectable()
export class AdminDbService {
  async listTables() {
    const entries = Object.entries(DB_BROWSER_REGISTRY);
    const tables = await Promise.all(
      entries.map(async ([key, entry]) => ({
        key,
        label: entry.label,
        rows: await entry.model.count({ paranoid: false }),
      })),
    );
    // Stable alphabetical order for the picker.
    tables.sort((a, b) => a.label.localeCompare(b.label));
    return { tables };
  }

  async getRows(table: string, dto: ListDbRowsDto) {
    const entry = DB_BROWSER_REGISTRY[table];
    if (!entry) {
      // Unknown key — the injection guard. Don't reveal the whitelist.
      throw new NotFoundException(`Unknown table: ${table}`);
    }

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const hasCreatedAt = 'createdAt' in entry.model.getAttributes();

    const { rows, count } = await entry.model.findAndCountAll({
      paranoid: false,
      limit,
      offset: getOffset(page, limit),
      order: hasCreatedAt ? [['createdAt', 'DESC']] : undefined,
      raw: true,
    });

    const redacted = (rows as unknown as Record<string, unknown>[]).map((row) =>
      this.redactRow(row, entry),
    );

    return buildPaginatedResponse(redacted, count, page, limit);
  }

  private redactRow(
    row: Record<string, unknown>,
    entry: DbBrowserEntry,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...row };
    for (const key of Object.keys(out)) {
      const perTable = entry.redact.includes(key);
      const globalHit = GLOBAL_REDACT_PATTERNS.some((re) => re.test(key));
      if (perTable || globalHit) out[key] = REDACTED;
    }
    return out;
  }
}
