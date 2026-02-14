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
import { ApiEndpoint } from '../../common/decorators/api-response.decorator';
import { OrganizationDocs } from '../../common/docs/organization.docs';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Organization Controller
 *
 * Manages organizations (studios, gyms, teams):
 * - POST   /organizations               → Create organization (ORGANIZER only)
 * - GET    /organizations               → List my organizations
 * - GET    /organizations/:id           → Get organization details
 * - PATCH  /organizations/:id           → Update organization (owner only)
 * - GET    /organizations/:id/members   → List members
 * - PATCH  /organizations/:id/members/me → Update own membership settings
 * - DELETE /organizations/:id/members/:userId → Remove member (owner only)
 */
@ApiTags('Organizations')
@Controller('organizations')
@UseGuards(AuthGuard('jwt'))
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  // =====================================================
  // ORGANIZATION CRUD
  // =====================================================

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ORGANIZER', 'ADMIN', 'SUPER_ADMIN')
  @ApiEndpoint({ ...OrganizationDocs.create, body: CreateOrganizationDto })
  async create(@Request() req, @Body() dto: CreateOrganizationDto) {
    return this.organizationService.create(req.user.id, dto);
  }

  @Get()
  @ApiEndpoint(OrganizationDocs.getMyOrganizations)
  async getMyOrganizations(@Request() req) {
    return this.organizationService.getMyOrganizations(req.user.id);
  }

  @Get(':id')
  @ApiEndpoint(OrganizationDocs.getById)
  async getById(@Param('id') id: string, @Request() req) {
    return this.organizationService.getById(id, req.user.id);
  }

  @Patch(':id')
  @ApiEndpoint({ ...OrganizationDocs.update, body: UpdateOrganizationDto })
  async update(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationService.update(id, req.user.id, dto);
  }

  // =====================================================
  // MEMBER MANAGEMENT
  // =====================================================

  @Get(':id/members')
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

  @Delete(':id/members/:userId')
  @ApiEndpoint(OrganizationDocs.removeMember)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') memberId: string,
    @Request() req,
  ) {
    await this.organizationService.removeMember(id, memberId, req.user.id);
    return { message: 'Member removed successfully' };
  }
}
