import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PermissionPolicy } from '../auth/policies/permission.policy.js';
import type { User } from '../users/entities/user.entity.js';
import { createRoleSchema, updateRoleSchema, type CreateRoleDto, type UpdateRoleDto } from './dto/role.dto.js';
import { PERMISSIONS } from './permissions.js';
import { RolesService } from './roles.service.js';

const keyParam = z.string().regex(/^[a-z0-9-]{1,40}$/);

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** The areas a role can be given. Any team member may read it (the profile page shows their own). */
  @Get('permissions')
  @Can(PermissionPolicy, 'staff')
  permissions() {
    return PERMISSIONS;
  }

  @Get()
  @Can(PermissionPolicy, 'staff')
  list() {
    return this.roles.list();
  }

  @Post()
  @Can(PermissionPolicy, 'people')
  create(@Body({ schema: createRoleSchema }) dto: CreateRoleDto, @CurrentUser() actor: User) {
    return this.roles.create(dto, actor);
  }

  @Patch(':key')
  @Can(PermissionPolicy, 'people')
  update(@Param('key', { schema: keyParam }) key: string, @Body({ schema: updateRoleSchema }) dto: UpdateRoleDto, @CurrentUser() actor: User) {
    return this.roles.update(key, dto, actor);
  }

  @Delete(':key')
  @HttpCode(204)
  @Can(PermissionPolicy, 'people')
  remove(@Param('key', { schema: keyParam }) key: string) {
    return this.roles.remove(key);
  }
}
