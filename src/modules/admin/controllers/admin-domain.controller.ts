import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
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
import { AdminDomainService } from '../services/admin-domain.service';
import { AdminListDto } from '../dto/admin-list.dto';

/** Curated domain browsers. Read ADMIN/SUPPORT+; group delete ADMIN+. */
@ApiTags('Admin — Domains')
@Controller('admin/domain')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
export class AdminDomainController {
  constructor(private readonly domain: AdminDomainService) {}

  @Get('groups')
  @ApiEndpoint(AdminDocs.listGroups)
  groups(@Query() q: AdminListDto) {
    return this.domain.listGroups(q);
  }

  @Delete('groups/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiEndpoint(AdminDocs.deleteGroup)
  deleteGroup(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.domain.deleteGroup(req.user.id, id, req.ip ?? null);
  }

  @Get('sessions')
  @ApiEndpoint(AdminDocs.listSessions)
  sessions(@Query() q: AdminListDto) {
    return this.domain.listSessions(q);
  }

  @Get('venues')
  @ApiEndpoint(AdminDocs.listVenues)
  venues(@Query() q: AdminListDto) {
    return this.domain.listVenues(q);
  }

  @Get('exercises')
  @ApiEndpoint(AdminDocs.listExercises)
  exercises(@Query() q: AdminListDto) {
    return this.domain.listExercises(q);
  }
}
