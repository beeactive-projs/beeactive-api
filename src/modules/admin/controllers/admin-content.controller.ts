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
import { AdminContentService } from '../services/admin-content.service';
import { AdminListDto } from '../dto/admin-list.dto';

/** Content moderation. Read ADMIN/SUPPORT+; delete ADMIN/SUPER_ADMIN. */
@ApiTags('Admin — Content')
@Controller('admin/content')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
export class AdminContentController {
  constructor(private readonly content: AdminContentService) {}

  @Get('posts')
  @ApiEndpoint(AdminDocs.listPosts)
  posts(@Query() q: AdminListDto) {
    return this.content.listPosts(q);
  }

  @Delete('posts/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiEndpoint(AdminDocs.deletePost)
  deletePost(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.content.deletePost(req.user.id, id, req.ip ?? null);
  }

  @Get('reviews')
  @ApiEndpoint(AdminDocs.listReviews)
  reviews(@Query() q: AdminListDto) {
    return this.content.listReviews(q);
  }

  @Delete('reviews/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiEndpoint(AdminDocs.deleteReview)
  deleteReview(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.content.deleteReview(req.user.id, id, req.ip ?? null);
  }
}
