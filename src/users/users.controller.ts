import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Can } from '@nestjs/authorization';
import { CurrentUser } from '@nestjs/authentication';
import { uuidParam } from '../common/pagination.js';
import { PermissionPolicy } from '../auth/policies/permission.policy.js';
import { RolesService } from '../roles/roles.service.js';
import {
  adminUpdateUserSchema,
  createStaffSchema,
  listUsersSchema,
  listCustomersSchema,
  customerStatusSchema,
  type ListCustomersQuery,
  type CustomerStatusDto,
  updateProfileSchema,
  type AdminUpdateUserDto,
  type CreateStaffDto,
  type ListUsersQuery,
  type UpdateProfileDto,
} from './dto/update-user.dto.js';
import type { User } from './entities/user.entity.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly roles: RolesService,
  ) {}

  /** The signed-in person: profile, role and what the role allows. */
  @Get('me')
  @Can.Anyone()
  async me(@CurrentUser() user: User) {
    const profile = await this.usersService.findById(user.id);
    const identities = await this.usersService.listIdentities(user.id);
    const role = user.role === 'customer' ? null : await this.roles.findOne(user.role).catch(() => null);
    return Object.assign(profile, {
      permissions: user.permissions ?? [],
      roleName: role?.name ?? null,
      identities: identities.map((i) => ({ provider: i.provider, email: i.email })),
    });
  }

  @Patch('me')
  @Can.Anyone()
  updateMe(@CurrentUser() user: User, @Body({ schema: updateProfileSchema }) dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Get()
  @Can(PermissionPolicy, 'people')
  list(@Query({ schema: listUsersSchema }) query: ListUsersQuery) {
    return this.usersService.list(query);
  }

  @Post('staff')
  @Can(PermissionPolicy, 'people')
  createStaff(@CurrentUser() actor: User, @Body({ schema: createStaffSchema }) dto: CreateStaffDto) {
    return this.usersService.createStaff(actor, dto);
  }

  /** Shoppers, for whoever handles orders. Team accounts stay under /users. */
  @Get('customers')
  @Can(PermissionPolicy, 'orders')
  customers(@Query({ schema: listCustomersSchema }) query: ListCustomersQuery) {
    return this.usersService.listCustomers(query);
  }

  @Get('customers/:id')
  @Can(PermissionPolicy, 'orders')
  customerDetail(@Param('id', { schema: uuidParam }) id: string) {
    return this.usersService.customerDetail(id);
  }

  /** Permanent. Needs the people permission, since it erases a person's data. */
  @Delete('customers/:id')
  @HttpCode(204)
  @Can(PermissionPolicy, 'people')
  deleteCustomer(@Param('id', { schema: uuidParam }) id: string) {
    return this.usersService.deleteCustomer(id);
  }

  @Patch('customers/:id')
  @Can(PermissionPolicy, 'orders')
  customerStatus(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: customerStatusSchema }) dto: CustomerStatusDto) {
    return this.usersService.setCustomerStatus(id, dto.status);
  }

  @Get(':id')
  @Can(PermissionPolicy, 'people')
  findOne(@Param('id', { schema: uuidParam }) id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @Can(PermissionPolicy, 'people')
  adminUpdate(
    @CurrentUser() actor: User,
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: adminUpdateUserSchema }) dto: AdminUpdateUserDto,
  ) {
    return this.usersService.adminUpdate(actor, id, dto);
  }

  @Post(':id/password-link')
  @HttpCode(204)
  @Can(PermissionPolicy, 'people')
  passwordLink(@CurrentUser() actor: User, @Param('id', { schema: uuidParam }) id: string) {
    return this.usersService.sendPasswordLink(actor, id);
  }
}
