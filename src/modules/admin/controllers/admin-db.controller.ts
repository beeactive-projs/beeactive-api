import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../../../common/decorators/api-response.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminDocs } from '../../../common/docs/admin.docs';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AdminDbService } from '../services/admin-db.service';
import { ListDbRowsDto } from '../dto/list-db-rows.dto';

/** Read-only DB browser — SUPER_ADMIN only. */
@ApiTags('Admin — Database')
@Controller('admin/db')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN')
export class AdminDbController {
  constructor(private readonly db: AdminDbService) {}

  @Get('tables')
  @ApiEndpoint(AdminDocs.listDbTables)
  listTables() {
    return this.db.listTables();
  }

  @Get('tables/:table')
  @ApiEndpoint(AdminDocs.getDbRows)
  getRows(@Param('table') table: string, @Query() query: ListDbRowsDto) {
    return this.db.getRows(table, query);
  }
}
