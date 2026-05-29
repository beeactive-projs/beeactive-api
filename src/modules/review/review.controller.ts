import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReviewService } from './review.service';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { ReviewDocs } from '../../common/docs/review.docs';
import { InjectModel } from '@nestjs/sequelize';
import { InstructorProfile } from '../profile/entities/instructor-profile.entity';
import { NotFoundException } from '@nestjs/common';

/**
 * Mounts under `/profile/instructors/:id/reviews`. Public — no guards.
 *
 * `:id` is the *user id* of the instructor (matches the existing
 * `/profile/instructors/:id` route), not the `instructor_profile.id`.
 * The controller resolves the profile id before delegating, so the
 * URL stays consistent with the public profile endpoint.
 */
@ApiTags('Reviews')
@Controller('profile/instructors/:id/reviews')
export class ReviewController {
  constructor(
    private readonly reviewService: ReviewService,
    @InjectModel(InstructorProfile)
    private readonly instructorProfileModel: typeof InstructorProfile,
  ) {}

  @Get()
  @ApiEndpoint(ReviewDocs.listForInstructor)
  async list(
    @Param('id', ParseUUIDPipe) instructorUserId: string,
    @Query() dto: ListReviewsDto,
  ) {
    const profile = await this.instructorProfileModel.findOne({
      where: { userId: instructorUserId },
      attributes: ['id'],
    });
    if (!profile) {
      throw new NotFoundException('Instructor profile not found');
    }
    return this.reviewService.listForInstructor(profile.id, dto);
  }
}
