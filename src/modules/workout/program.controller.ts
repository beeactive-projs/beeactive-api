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

import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { ProgramDocs } from '../../common/docs/program.docs';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';

import { CreatePrescribedExerciseDto } from './dto/create-prescribed-exercise.dto';
import { CreatePrescribedSetDto } from './dto/create-prescribed-set.dto';
import { CreateProgramDto } from './dto/create-program.dto';
import { CreateProgramWorkoutDto } from './dto/create-program-workout.dto';
import { ListProgramsQueryDto } from './dto/list-programs.query.dto';
import { UpdatePrescribedExerciseDto } from './dto/update-prescribed-exercise.dto';
import { UpdatePrescribedSetDto } from './dto/update-prescribed-set.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { UpdateProgramWorkoutDto } from './dto/update-program-workout.dto';
import { ProgramService } from './program.service';

/**
 * Program authoring — INSTRUCTOR-only nested CRUD across the
 * program-workout-exercise-set tree.
 *
 * Read access is owner-only too: there's no public surface for
 * programs in V1 (per locked decision §3 — per-instructor private
 * library, no marketplace).
 */
@ApiTags('Programs')
@Controller('programs')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('INSTRUCTOR')
export class ProgramController {
  constructor(private readonly programService: ProgramService) {}

  // ── Program ──────────────────────────────────────────────────────

  @Get()
  @ApiEndpoint(ProgramDocs.list)
  async list(
    @Request() req: AuthenticatedRequest,
    @Query() query: ListProgramsQueryDto,
  ) {
    return this.programService.list(query, req.user.id);
  }

  @Get(':id')
  @ApiEndpoint(ProgramDocs.get)
  async get(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.programService.findById(id, req.user.id);
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @ApiEndpoint({ ...ProgramDocs.create, body: CreateProgramDto })
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateProgramDto,
  ) {
    return this.programService.create(dto, req.user.id);
  }

  @Patch(':id')
  @Throttle({ default: { limit: 120, ttl: 3_600_000 } })
  @ApiEndpoint({ ...ProgramDocs.update, body: UpdateProgramDto })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgramDto,
  ) {
    return this.programService.update(id, dto, req.user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @ApiEndpoint(ProgramDocs.remove)
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.programService.softDelete(id, req.user.id);
  }

  // ── Workout ──────────────────────────────────────────────────────

  @Post(':id/workouts')
  @Throttle({ default: { limit: 200, ttl: 3_600_000 } })
  @ApiEndpoint({ ...ProgramDocs.addWorkout, body: CreateProgramWorkoutDto })
  async addWorkout(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProgramWorkoutDto,
  ) {
    return this.programService.addWorkout(id, dto, req.user.id);
  }

  @Patch(':id/workouts/:workoutId')
  @ApiEndpoint({
    ...ProgramDocs.updateWorkout,
    body: UpdateProgramWorkoutDto,
  })
  async updateWorkout(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workoutId', ParseUUIDPipe) workoutId: string,
    @Body() dto: UpdateProgramWorkoutDto,
  ) {
    return this.programService.updateWorkout(id, workoutId, dto, req.user.id);
  }

  @Delete(':id/workouts/:workoutId')
  @HttpCode(204)
  @ApiEndpoint(ProgramDocs.removeWorkout)
  async removeWorkout(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workoutId', ParseUUIDPipe) workoutId: string,
  ): Promise<void> {
    await this.programService.removeWorkout(id, workoutId, req.user.id);
  }

  // ── Prescribed exercise (under a workout) ────────────────────────

  @Post(':id/workouts/:workoutId/exercises')
  @ApiEndpoint({
    ...ProgramDocs.addExercise,
    body: CreatePrescribedExerciseDto,
  })
  async addExercise(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workoutId', ParseUUIDPipe) workoutId: string,
    @Body() dto: CreatePrescribedExerciseDto,
  ) {
    return this.programService.addExercise(id, workoutId, dto, req.user.id);
  }

  @Patch(':id/workouts/:workoutId/exercises/:exerciseId')
  @ApiEndpoint({
    ...ProgramDocs.updateExercise,
    body: UpdatePrescribedExerciseDto,
  })
  async updateExercise(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workoutId', ParseUUIDPipe) workoutId: string,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @Body() dto: UpdatePrescribedExerciseDto,
  ) {
    return this.programService.updateExercise(
      id,
      workoutId,
      exerciseId,
      dto,
      req.user.id,
    );
  }

  @Delete(':id/workouts/:workoutId/exercises/:exerciseId')
  @HttpCode(204)
  @ApiEndpoint(ProgramDocs.removeExercise)
  async removeExercise(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workoutId', ParseUUIDPipe) workoutId: string,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
  ): Promise<void> {
    await this.programService.removeExercise(
      id,
      workoutId,
      exerciseId,
      req.user.id,
    );
  }

  // ── Prescribed set (under an exercise slot) ──────────────────────

  @Post(':id/workouts/:workoutId/exercises/:exerciseId/sets')
  @ApiEndpoint({ ...ProgramDocs.addSet, body: CreatePrescribedSetDto })
  async addSet(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workoutId', ParseUUIDPipe) workoutId: string,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @Body() dto: CreatePrescribedSetDto,
  ) {
    return this.programService.addSet(
      id,
      workoutId,
      exerciseId,
      dto,
      req.user.id,
    );
  }

  @Patch(':id/workouts/:workoutId/exercises/:exerciseId/sets/:setId')
  @ApiEndpoint({ ...ProgramDocs.updateSet, body: UpdatePrescribedSetDto })
  async updateSet(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workoutId', ParseUUIDPipe) workoutId: string,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @Param('setId', ParseUUIDPipe) setId: string,
    @Body() dto: UpdatePrescribedSetDto,
  ) {
    return this.programService.updateSet(
      id,
      workoutId,
      exerciseId,
      setId,
      dto,
      req.user.id,
    );
  }

  @Delete(':id/workouts/:workoutId/exercises/:exerciseId/sets/:setId')
  @HttpCode(204)
  @ApiEndpoint(ProgramDocs.removeSet)
  async removeSet(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workoutId', ParseUUIDPipe) workoutId: string,
    @Param('exerciseId', ParseUUIDPipe) exerciseId: string,
    @Param('setId', ParseUUIDPipe) setId: string,
  ): Promise<void> {
    await this.programService.removeSet(
      id,
      workoutId,
      exerciseId,
      setId,
      req.user.id,
    );
  }
}
