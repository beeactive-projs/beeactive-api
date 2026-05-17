import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { SessionDocs } from '../../common/docs/session.docs';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { SessionTemplateService } from './services/session-template.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { ListTemplatesQueryDto } from './dto/list-templates-query.dto';
import { PreviewRecurrenceDto } from './dto/preview-recurrence.dto';
import { RegenerateInstancesDto } from './dto/regenerate-instances.dto';

@ApiTags('Sessions')
@Controller('sessions')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SessionTemplateController {
  constructor(private readonly templateService: SessionTemplateService) {}

  // Static path MUST come before parameterized — registered first wins in NestJS.
  // Read-only dry-run: returns computed dates without persisting → 200, not 201.
  @Post('templates/preview-recurrence')
  @HttpCode(200)
  @Roles('INSTRUCTOR', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiEndpoint(SessionDocs.previewRecurrence)
  previewRecurrence(@Body() dto: PreviewRecurrenceDto) {
    return this.templateService.previewRecurrence(dto);
  }

  @Post('templates')
  @Roles('INSTRUCTOR', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @ApiEndpoint(SessionDocs.createTemplate)
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateTemplateDto) {
    return this.templateService.create(req.user.id, dto);
  }

  @Get('templates')
  @Roles('INSTRUCTOR', 'SUPER_ADMIN')
  @ApiEndpoint(SessionDocs.listTemplates)
  list(
    @Request() req: AuthenticatedRequest,
    @Query() query: ListTemplatesQueryDto,
  ) {
    return this.templateService.list(req.user.id, query);
  }

  @Get('templates/:id')
  @Roles('INSTRUCTOR', 'SUPER_ADMIN')
  @ApiEndpoint(SessionDocs.getTemplate)
  getById(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templateService.getById(req.user.id, id);
  }

  @Patch('templates/:id')
  @Roles('INSTRUCTOR', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @ApiEndpoint(SessionDocs.updateTemplate)
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templateService.update(req.user.id, id, dto);
  }

  @Delete('templates/:id')
  @Roles('INSTRUCTOR', 'SUPER_ADMIN')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiEndpoint(SessionDocs.deleteTemplate)
  delete(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templateService.delete(req.user.id, id);
  }

  @Post('templates/:id/regenerate')
  @Roles('INSTRUCTOR', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiEndpoint(SessionDocs.regenerateInstances)
  regenerate(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegenerateInstancesDto,
  ) {
    return this.templateService.regenerate(req.user.id, id, dto);
  }
}
