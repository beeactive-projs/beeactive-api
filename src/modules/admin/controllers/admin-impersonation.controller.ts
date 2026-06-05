import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../../../common/decorators/api-response.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminDocs } from '../../../common/docs/admin.docs';
import { RolesGuard } from '../../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../../common/types/authenticated-request';
import { AdminImpersonationService } from '../services/admin-impersonation.service';
import { ImpersonateDto } from '../dto/impersonate.dto';

/** Impersonation surface — SUPER_ADMIN only, every call audited. */
@ApiTags('Admin — Impersonation')
@Controller('admin/impersonate')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN')
export class AdminImpersonationController {
  constructor(private readonly impersonation: AdminImpersonationService) {}

  @Post(':userId')
  @ApiEndpoint(AdminDocs.impersonate)
  impersonate(
    @Request() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ImpersonateDto,
  ) {
    return this.impersonation.impersonate(
      req.user.id,
      userId,
      dto.reason,
      req.ip ?? null,
    );
  }
}
