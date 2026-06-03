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
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';

import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { CreateRoutineDto } from './dto/create-routine.dto';
import { ListRoutinesQueryDto } from './dto/list-routines.query.dto';
import { UpdateRoutineDto } from './dto/update-routine.dto';
import { RoutineService } from './routine.service';

/**
 * Routines — saved workout shapes a self-serve user starts in one tap.
 * All routes are USER (or higher); 404 on cross-user access.
 */
@ApiTags('Routines')
@Controller('routines')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('USER')
export class RoutineController {
  constructor(private readonly routineService: RoutineService) {}

  @Post()
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateRoutineDto,
  ) {
    return this.routineService.create(req.user.id, dto);
  }

  @Get()
  async list(
    @Request() req: AuthenticatedRequest,
    @Query() query: ListRoutinesQueryDto,
  ) {
    return this.routineService.list(req.user.id, query);
  }

  @Get(':id')
  async get(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.routineService.findById(req.user.id, id);
  }

  @Patch(':id')
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoutineDto,
  ) {
    return this.routineService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.routineService.softDelete(req.user.id, id);
  }

  /**
   * One-tap start — creates a fresh WorkoutLog from the routine + seeds
   * the tree. Returns the new WorkoutLog so the FE can navigate to
   * `/my/workout-log/:id`.
   */
  @Post(':id/start')
  async start(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.routineService.startAsWorkoutLog(req.user.id, id);
  }
}
