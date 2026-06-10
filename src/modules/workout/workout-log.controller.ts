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
import { Throttle } from '@nestjs/throttler';

import { PaginationDto } from '../../common/dto/pagination.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { AddLogExerciseDto } from './dto/add-log-exercise.dto';
import { AddLogSetDto } from './dto/add-log-set.dto';
import { CompleteWorkoutDto } from './dto/complete-workout.dto';
import { LogSetDto } from './dto/log-set.dto';
import { RecordOneRepMaxDto } from './dto/record-one-rep-max.dto';
import { StartWorkoutDto } from './dto/start-workout.dto';
import { WorkoutLogService } from './workout-log.service';

/**
 * Client-side workout logging — START, LOG SET, COMPLETE, plus 1RM
 * tracking. All routes are USER-role; instructors view client logs
 * through a separate read endpoint in a later slice.
 */
@ApiTags('Workout logs')
@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('USER')
export class WorkoutLogController {
  constructor(private readonly workoutLogService: WorkoutLogService) {}

  // ── Lifecycle ────────────────────────────────────────────────────

  @Post('workout-logs')
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  async start(
    @Request() req: AuthenticatedRequest,
    @Body() dto: StartWorkoutDto,
  ) {
    return this.workoutLogService.start(req.user.id, dto);
  }

  @Patch('workout-logs/:id/sets/:setId')
  @Throttle({ default: { limit: 600, ttl: 3_600_000 } })
  async logSet(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('setId', ParseUUIDPipe) setId: string,
    @Body() dto: LogSetDto,
  ) {
    return this.workoutLogService.logSet(id, setId, dto, req.user.id);
  }

  // ── Mid-session mutations (freestyle + S14 affordances) ──────────

  @Post('workout-logs/:id/exercises')
  async addExercise(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddLogExerciseDto,
  ) {
    return this.workoutLogService.addExerciseToLog(
      id,
      dto.exerciseId,
      req.user.id,
    );
  }

  @Delete('workout-logs/:id/exercises/:exerciseId')
  @HttpCode(204)
  async removeExercise(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
  ): Promise<void> {
    await this.workoutLogService.removeExerciseFromLog(
      id,
      exerciseId,
      req.user.id,
    );
  }

  @Post('workout-logs/:id/exercises/:exerciseId/sets')
  async addSet(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @Body() dto: AddLogSetDto,
  ) {
    return this.workoutLogService.addSetToLog(id, exerciseId, dto, req.user.id);
  }

  // ── "Last time you did this" — for the LastTimeHint component ────

  @Get('workout-logs/last-for-exercise/:exerciseId')
  async lastSessionForExercise(
    @Request() req: AuthenticatedRequest,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
  ) {
    return this.workoutLogService.lastSessionForExercise(
      req.user.id,
      exerciseId,
    );
  }

  /** Look up the log produced by a given assigned workout — used by
   *  the plan-detail "View" CTA to find the replay target. 404 if the
   *  workout was never started or isn't owned by the caller. */
  @Get('workout-logs/by-assigned-workout/:assignedWorkoutId')
  async findByAssignedWorkout(
    @Request() req: AuthenticatedRequest,
    @Param('assignedWorkoutId', ParseUUIDPipe) assignedWorkoutId: string,
  ) {
    return this.workoutLogService.findByAssignedWorkout(
      assignedWorkoutId,
      req.user.id,
    );
  }

  @Post('workout-logs/:id/complete')
  async complete(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteWorkoutDto,
  ) {
    return this.workoutLogService.complete(id, dto, req.user.id);
  }

  // ── Read ─────────────────────────────────────────────────────────

  @Get('workout-logs')
  async list(
    @Request() req: AuthenticatedRequest,
    @Query() query: PaginationDto,
  ) {
    return this.workoutLogService.listForUser(req.user.id, query);
  }

  @Get('workout-logs/:id')
  async get(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workoutLogService.findById(id, req.user.id);
  }

  // ── 1RM ──────────────────────────────────────────────────────────

  @Post('one-rep-maxes')
  async recordOneRepMax(
    @Request() req: AuthenticatedRequest,
    @Body() dto: RecordOneRepMaxDto,
  ) {
    return this.workoutLogService.recordOneRepMax(req.user.id, dto);
  }

  @Get('one-rep-maxes')
  async listOneRepMaxes(
    @Request() req: AuthenticatedRequest,
    @Query() query: PaginationDto,
  ) {
    return this.workoutLogService.listOneRepMaxes(req.user.id, query);
  }
}
