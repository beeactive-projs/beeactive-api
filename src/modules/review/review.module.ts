import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Review } from './entities/review.entity';
import { InstructorProfile } from '../profile/entities/instructor-profile.entity';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

/**
 * Public reviews for instructor profiles. Read-only in v1.
 *
 * Exports `ReviewService` so `ProfileService` can ask for a rating
 * summary when building the public profile DTO (rating average + total
 * on the stat strip).
 */
@Module({
  imports: [SequelizeModule.forFeature([Review, InstructorProfile])],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
