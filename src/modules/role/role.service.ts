
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { UserRole } from './entities/user-role.entity';

@Injectable()
export class RoleService {
  constructor(
    @InjectModel(Role)
    private roleModel: typeof Role,
    @InjectModel(Permission)
    private permissionModel: typeof Permission,
    @InjectModel(UserRole)
    private userRoleModel: typeof UserRole,
  ) {}

  // =====================================================
  // ROLE CRUD
  // =====================================================

  async findAll(): Promise<Role[]> {
    return this.roleModel.findAll({
      include: [Permission],
      order: [['level', 'ASC']],
    });
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.roleModel.findByPk(id, {
      include: [Permission],
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    return role;
  }

  async findByName(name: string): Promise<Role> {
    const role = await this.roleModel.findOne({
      where: { name },
      include: [Permission],
    });

    if (!role) {
      throw new NotFoundException(`Role ${name} not found`);
    }

    return role;
  }

  // =====================================================
  // USER ROLE ASSIGNMENT
  // =====================================================

  async assignRoleToUser(
    userId: string,
    roleId: string,
    organizationId?: string,
    expiresAt?: Date,
    transaction?: Transaction,
  ): Promise<UserRole> {
    const existing = await this.userRoleModel.findOne({
      where: {
        userId: userId,
        roleId: roleId,
        organizationId: organizationId || null,
      },
      transaction,
    });

    if (existing) {
      return existing;
    }

    return this.userRoleModel.create(
      {
        userId: userId,
        roleId: roleId,
        organizationId: organizationId,
        expiresAt: expiresAt,
      },
      { transaction },
    );
  }

  async assignRoleToUserByName(
    userId: string,
    roleName: string,
    organizationId?: string,
    expiresAt?: Date,
    transaction?: Transaction,
  ): Promise<UserRole> {
    const role = await this.findByName(roleName);
    return this.assignRoleToUser(
      userId,
      role.id,
      organizationId,
      expiresAt,
      transaction,
    );
  }

  async removeRoleFromUser(
    userId: string,
    roleId: string,
    organizationId?: string,
  ): Promise<boolean> {
    const deleted = await this.userRoleModel.destroy({
      where: {
        userId: userId,
        roleId: roleId,
        organizationId: organizationId || null,
      },
    });

    return deleted > 0;
  }

  async getUserRoles(userId: string, organizationId?: string): Promise<Role[]> {
    const where: any = { userId: userId };

    if (organizationId !== undefined) {
      where.organizationId = organizationId;
    }

    const userRoles = await this.userRoleModel.findAll({
      where,
      include: [
        {
          model: Role,
          include: [Permission],
        },
      ],
    });

    return userRoles.map((ur) => ur.role);
  }

  async getUserPermissions(
    userId: string,
    organizationId?: string,
  ): Promise<Permission[]> {
    const roles = await this.getUserRoles(userId, organizationId);

    const permissionsMap = new Map<string, Permission>();

    for (const role of roles) {
      if (role.permissions) {
        for (const permission of role.permissions) {
          permissionsMap.set(permission.id, permission);
        }
      }
    }

    return Array.from(permissionsMap.values());
  }

  // =====================================================
  // PERMISSION CHECKS
  // =====================================================

  async userHasRole(
    userId: string,
    roleName: string,
    organizationId?: string,
  ): Promise<boolean> {
    const role = await this.findByName(roleName);

    const where: any = {
      userId: userId,
      roleId: role.id,
    };

    if (organizationId !== undefined) {
      where.organizationId = organizationId;
    }

    const userRole = await this.userRoleModel.findOne({ where });

    return !!userRole;
  }

  async userHasAnyRole(
    userId: string,
    roleNames: string[],
    organizationId?: string,
  ): Promise<boolean> {
    const roles = await this.roleModel.findAll({
      where: { name: roleNames },
    });

    const roleIds = roles.map((r) => r.id);

    const where: any = {
      userId: userId,
      roleId: roleIds,
    };

    if (organizationId !== undefined) {
      where.organizationId = organizationId;
    }

    const count = await this.userRoleModel.count({ where });

    return count > 0;
  }

  async userHasPermission(
    userId: string,
    permissionName: string,
    organizationId?: string,
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, organizationId);
    return permissions.some((p) => p.name === permissionName);
  }

  async userHasAnyPermission(
    userId: string,
    permissionNames: string[],
    organizationId?: string,
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, organizationId);
    return permissions.some((p) => permissionNames.includes(p.name));
  }

  async userHasAllPermissions(
    userId: string,
    permissionNames: string[],
    organizationId?: string,
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, organizationId);
    const userPermissionNames = permissions.map((p) => p.name);

    return permissionNames.every((name) => userPermissionNames.includes(name));
  }

  // =====================================================
  // PERMISSION CRUD
  // =====================================================

  async findAllPermissions(): Promise<Permission[]> {
    return this.permissionModel.findAll({
      order: [
        ['resource', 'ASC'],
        ['action', 'ASC'],
      ],
    });
  }

  async findPermissionByName(name: string): Promise<Permission> {
    const permission = await this.permissionModel.findOne({
      where: { name },
    });

    if (!permission) {
      throw new NotFoundException(`Permission ${name} not found`);
    }

    return permission;
  }
}
