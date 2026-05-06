import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Shared EmailModule.
 *
 * `EmailService` was previously declared as a `provider` in 10
 * separate feature modules. Each `@Module({ providers: [EmailService] })`
 * created a fresh DI instance — fine functionally, but it duplicated
 * boilerplate and meant a future config change (e.g. swap Resend for
 * SES) had to be applied 10 times.
 *
 * This module is `@Global()` so the export is visible everywhere
 * without re-importing. Existing per-module provider declarations
 * have been removed; consumers just inject `EmailService` directly.
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
