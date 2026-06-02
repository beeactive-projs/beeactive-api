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
import { ExerciseDocs } from '../../common/docs/exercise.docs';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  Principal,
  type PrincipalContext,
} from '../../common/decorators/principal.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';

import { ExerciseService } from './exercise.service';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { ListExercisesQueryDto } from './dto/list-exercises.query.dto';

/**
 * Exercise Catalog — instructor + client surface.
 *
 * `GET` endpoints accept both INSTRUCTOR and USER roles; the service
 * gates clients via `assertClientCanBrowse` (locked decision §19).
 *
 * Mutating endpoints (create, update, delete, fork) are
 * INSTRUCTOR-only — clients never author or own exercises.
 */
@ApiTags('Exercises')
@Controller('exercises')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ExerciseController {
  constructor(private readonly exerciseService: ExerciseService) {}

  // ── Read ──────────────────────────────────────────────────────────

  @Get()
  @Roles('INSTRUCTOR', 'USER')
  @ApiEndpoint(ExerciseDocs.list)
  async list(
    @Principal() principal: PrincipalContext,
    @Query() query: ListExercisesQueryDto,
  ) {
    if (!principal.isInstructor) {
      await this.exerciseService.assertClientCanBrowse(principal);
    }
    return this.exerciseService.list(query, principal);
  }

  @Get(':id')
  @Roles('INSTRUCTOR', 'USER')
  @ApiEndpoint(ExerciseDocs.get)
  async get(
    @Principal() principal: PrincipalContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exerciseService.findById(id, principal);
  }

  // ── Write (instructor only) ───────────────────────────────────────

  @Post()
  @Roles('INSTRUCTOR')
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @ApiEndpoint({ ...ExerciseDocs.create, body: CreateExerciseDto })
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateExerciseDto,
  ) {
    return this.exerciseService.create(dto, req.user.id);
  }

  @Patch(':id')
  @Roles('INSTRUCTOR')
  @Throttle({ default: { limit: 120, ttl: 3_600_000 } })
  @ApiEndpoint({ ...ExerciseDocs.update, body: UpdateExerciseDto })
  async update(
    @Principal() principal: PrincipalContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExerciseDto,
  ) {
    return this.exerciseService.update(id, dto, principal);
  }

  @Delete(':id')
  @Roles('INSTRUCTOR')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @ApiEndpoint(ExerciseDocs.remove)
  async remove(
    @Principal() principal: PrincipalContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.exerciseService.softDelete(id, principal);
  }

  @Post(':id/fork')
  @Roles('INSTRUCTOR')
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @ApiEndpoint(ExerciseDocs.fork)
  async fork(
    @Principal() principal: PrincipalContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exerciseService.fork(id, principal);
  }
}
