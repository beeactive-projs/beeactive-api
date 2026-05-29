import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { SessionDocs } from '../../common/docs/session.docs';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { SessionDiscoverService } from './services/session-discover.service';
import { DiscoverSessionsQueryDto } from './dto/discover-sessions.dto';

/**
 * Public discover + slug surface.
 *
 * All routes use `@Public()` + `OptionalJwtAuthGuard`:
 *   - anonymous callers are allowed in (sees OPEN/FREE only)
 *   - authed callers get personalised results (eligible CLIENTS_ONLY/
 *     GROUP_ONLY surfaced)
 *
 * Caching: short HTTP-level caches on the response. The discover query
 * varies by `Authorization` so cache layers (CDN, Varnish) MUST honor
 * the Vary header to avoid serving an authed personalised result to
 * an anonymous caller.
 */
@ApiTags('Sessions · Discover')
@Controller('sessions')
@UseGuards(OptionalJwtAuthGuard)
export class SessionDiscoverController {
  constructor(private readonly discoverService: SessionDiscoverService) {}

  @Get('discover')
  @Public()
  @Header(
    'Cache-Control',
    'public, max-age=60, s-maxage=60, stale-while-revalidate=120',
  )
  @Header('Vary', 'Authorization')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiEndpoint(SessionDocs.discover)
  discover(
    @Request() req: AuthenticatedRequest,
    @Query() query: DiscoverSessionsQueryDto,
  ) {
    return this.discoverService.discover(req.user?.id ?? null, query);
  }

  @Get('public/:instructorHandle/:templateSlug')
  @Public()
  @Header(
    'Cache-Control',
    'public, max-age=120, s-maxage=120, stale-while-revalidate=240',
  )
  @Header('Vary', 'Authorization')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiEndpoint(SessionDocs.publicBySlug)
  publicBySlug(
    @Request() req: AuthenticatedRequest,
    @Param('instructorHandle') instructorHandle: string,
    @Param('templateSlug') templateSlug: string,
  ) {
    return this.discoverService.getBySlug(
      instructorHandle,
      templateSlug,
      req.user?.id ?? null,
    );
  }

  @Get('instances/:id/public')
  @Public()
  @Header(
    'Cache-Control',
    'public, max-age=120, s-maxage=120, stale-while-revalidate=240',
  )
  @Header('Vary', 'Authorization')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiEndpoint(SessionDocs.publicInstance)
  publicInstance(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.discoverService.getInstancePublic(id, req.user?.id ?? null);
  }
}
