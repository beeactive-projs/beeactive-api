import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { DiscoverOrganizationsDto } from './dto/discover-organizations.dto';
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { OrganizationDocs } from '../../common/docs/organization.docs';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Organization Controller
 *
 * Manages organizations (studios, gyms, teams):
 *
 * Public (no auth):
 * - GET    /organizations/discover        → Browse/search public organizations
 * - GET    /organizations/:id/public      → Public profile (org + trainer + sessions)
 *
 * Authenticated:
 * - POST   /organizations                 → Create organization (ORGANIZER only)
 * - GET    /organizations                 → List my organizations
 * - GET    /organizations/:id             → Get organization details (member only)
 * - PATCH  /organizations/:id             → Update organization (owner only)
 * - DELETE /organizations/:id             → Delete organization (owner only)
 * - POST   /organizations/:id/join        → Self-join (public + OPEN policy only)
 * - GET    /organizations/:id/members     → List members
 * - PATCH  /organizations/:id/members/me  → Update own membership settings
 * - DELETE /organizations/:id/members/me  → Leave organization
 * - DELETE /organizations/:id/members/:userId → Remove member (owner only)
 */
@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  // =====================================================
  // DISCOVERY (public — no auth required)
  // =====================================================

  @Get('discover')
  @ApiEndpoint(OrganizationDocs.discoverOrganizations)
  async discoverOrganizations(@Query() dto: DiscoverOrganizationsDto) {
    return this.organizationService.discoverOrganizations(dto);
  }

  @Get(':id/public')
  @ApiEndpoint(OrganizationDocs.getPublicProfile)
  async getPublicProfile(@Param('id') id: string) {
    return this.organizationService.getPublicProfile(id);
  }

  // =====================================================
  // ORGANIZATION CRUD (auth required)
  // =====================================================

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ORGANIZER', 'ADMIN', 'SUPER_ADMIN')
  @ApiEndpoint({ ...OrganizationDocs.create, body: CreateOrganizationDto })
  async create(@Request() req, @Body() dto: CreateOrganizationDto) {
    return this.organizationService.create(req.user.id, dto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint(OrganizationDocs.getMyOrganizations)
  async getMyOrganizations(@Request() req) {
    return this.organizationService.getMyOrganizations(req.user.id);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint(OrganizationDocs.getById)
  async getById(@Param('id') id: string, @Request() req) {
    return this.organizationService.getById(id, req.user.id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint({ ...OrganizationDocs.update, body: UpdateOrganizationDto })
  async update(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationService.update(id, req.user.id, dto);
  }

  // =====================================================
  // SELF-JOIN (auth required)
  // =====================================================

  @Post(':id/join')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint(OrganizationDocs.selfJoin)
  async selfJoin(@Param('id') id: string, @Request() req) {
    await this.organizationService.selfJoinOrganization(id, req.user.id);
    return { message: 'You have joined the organization' };
  }

  // =====================================================
  // MEMBER MANAGEMENT (auth required)
  // =====================================================

  @Get(':id/members')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint(OrganizationDocs.getMembers)
  async getMembers(
    @Param('id') id: string,
    @Request() req,
    @Query() pagination: PaginationDto,
  ) {
    return this.organizationService.getMembers(
      id,
      req.user.id,
      pagination.page,
      pagination.limit,
    );
  }

  @Patch(':id/members/me')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint({
    ...OrganizationDocs.updateMyMembership,
    body: UpdateMemberDto,
  })
  async updateMyMembership(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.organizationService.updateMyMembership(id, req.user.id, dto);
  }

  @Delete(':id/members/me')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint(OrganizationDocs.leaveOrganization)
  async leaveOrganization(@Param('id') id: string, @Request() req) {
    await this.organizationService.leaveOrganization(id, req.user.id);
    return { message: 'You have left the organization' };
  }

  @Delete(':id/members/:userId')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint(OrganizationDocs.removeMember)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') memberId: string,
    @Request() req,
  ) {
    await this.organizationService.removeMember(id, memberId, req.user.id);
    return { message: 'Member removed successfully' };
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiEndpoint(OrganizationDocs.deleteOrganization)
  async deleteOrganization(@Param('id') id: string, @Request() req) {
    await this.organizationService.deleteOrganization(id, req.user.id);
    return { message: 'Organization deleted successfully' };
  }
}
