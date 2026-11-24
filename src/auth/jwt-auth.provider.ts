import {
  AuthenticationRegistry,
  JwtBearerProvider,
  type JwtClaims,
} from '@nestjs/authentication';
import { Injectable } from '@nestjs/common';
import type { User } from '../users/entities/user.entity.js';
import { RolesService } from '../roles/roles.service.js';
import { UsersService } from '../users/users.service.js';

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: User;
  }
}

/** Resolves a verified bearer token to a user. Suspended users are rejected here, on every request. */
@Injectable()
export class JwtAuth extends JwtBearerProvider<User> {
  constructor(
    private readonly users: UsersService,
    private readonly roles: RolesService,
    registry: AuthenticationRegistry,
  ) {
    super({ realm: 'dia' });
    registry.registerProvider(this, { order: 1 });
  }

  protected async validate({ sub }: JwtClaims): Promise<User | null> {
    const user = sub ? await this.users.findActiveById(sub) : null;
    if (user) user.permissions = await this.roles.permissionsOf(user.role);
    return user;
  }
}
