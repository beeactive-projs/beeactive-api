import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import {
  ApiEndpoint,
  ApiStandardResponses,
} from '../../common/decorators/api-response.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

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
  @ApiEndpoint({
    summary: 'Create a new organization',
    description:
      'Create a new organization. Requires ORGANIZER role. Creator becomes the owner.',
    auth: true,
    body: CreateOrganizationDto,
    responses: [
      {
        status: 201,
        description: 'Organization created successfully',
        example: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: "John's Fitness Studio",
          slug: 'johns-fitness-studio',
          description: 'Personal training and group sessions',
          timezone: 'Europe/Bucharest',
          is_active: true,
        },
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  })
  async create(@Request() req, @Body() dto: CreateOrganizationDto) {
    return this.organizationService.create(req.user.id, dto);
  }

  @Get()
  @ApiEndpoint({
    summary: 'List my organizations',
    description:
      'Returns all organizations the authenticated user belongs to.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Organizations listed',
        example: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: "John's Fitness Studio",
            slug: 'johns-fitness-studio',
          },
        ],
      },
      ApiStandardResponses.Unauthorized,
    ],
  })
  async getMyOrganizations(@Request() req) {
    return this.organizationService.getMyOrganizations(req.user.id);
  }

  @Get(':id')
  @ApiEndpoint({
    summary: 'Get organization by ID',
    description:
      'Returns organization details. User must be a member.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Organization details retrieved',
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  })
  async getById(@Param('id') id: string, @Request() req) {
    return this.organizationService.getById(id, req.user.id);
  }

  @Patch(':id')
  @ApiEndpoint({
    summary: 'Update organization',
    description: 'Update organization details. Owner only.',
    auth: true,
    body: UpdateOrganizationDto,
    responses: [
      {
        status: 200,
        description: 'Organization updated',
      },
      ApiStandardResponses.BadRequest,
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  })
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
  @ApiEndpoint({
    summary: 'List organization members',
    description:
      'Returns all members. If you are the owner AND a member has shared_health_info=true, their health data is included.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Members listed',
        example: [
          {
            id: 'member-uuid',
            user_id: 'user-uuid',
            first_name: 'Jane',
            last_name: 'Doe',
            is_owner: false,
            shared_health_info: true,
            health_data: {
              fitness_level: 'INTERMEDIATE',
              goals: ['weight_loss'],
            },
          },
        ],
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
    ],
  })
  async getMembers(@Param('id') id: string, @Request() req) {
    return this.organizationService.getMembers(id, req.user.id);
  }

  @Patch(':id/members/me')
  @ApiEndpoint({
    summary: 'Update my membership settings',
    description:
      'Update your own membership in this organization (e.g., share/hide health data, set nickname).',
    auth: true,
    body: UpdateMemberDto,
    responses: [
      {
        status: 200,
        description: 'Membership updated',
        example: {
          id: 'member-uuid',
          shared_health_info: true,
          nickname: 'Johnny',
        },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.NotFound,
    ],
  })
  async updateMyMembership(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.organizationService.updateMyMembership(id, req.user.id, dto);
  }

  @Delete(':id/members/:userId')
  @ApiEndpoint({
    summary: 'Remove a member',
    description:
      'Remove a member from the organization. Owner only. Cannot remove the owner.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Member removed',
        example: { message: 'Member removed successfully' },
      },
      ApiStandardResponses.Unauthorized,
      ApiStandardResponses.Forbidden,
      ApiStandardResponses.NotFound,
    ],
  })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') memberId: string,
    @Request() req,
  ) {
    await this.organizationService.removeMember(id, memberId, req.user.id);
    return { message: 'Member removed successfully' };
  }
}
