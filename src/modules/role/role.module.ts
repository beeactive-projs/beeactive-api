import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { UserRole } from './entities/user-role.entity';
import { RoleService } from './role.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Role, Permission, RolePermission, UserRole]),
  ],
  providers: [RoleService],
  exports: [RoleService], // Export so guards can use it
})
export class RoleModule {}
