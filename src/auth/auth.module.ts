import { AuthenticationModule } from '@nestjs/authentication';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailModule } from '@nestjs/mail';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Env } from '../config/env.schema.js';
import { UsersModule } from '../users/users.module.js';
import { jwtSecret } from './auth.constants.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthenticationStore } from './authentication-store.service.js';
import {
  AuthEmailToken,
  AuthRefreshToken,
  AuthRevokedFamily,
  AuthSession,
} from './entities/auth-tokens.entity.js';
import { JwtAuth } from './jwt-auth.provider.js';
import {
  EmailVerificationMailer,
  PasswordResetMailer,
} from './mailer.service.js';
import { OtpService } from './otp.service.js';
import { PermissionPolicy } from './policies/permission.policy.js';
import { RolesModule } from '../roles/roles.module.js';
import { SettingsMailTransport } from '../settings/settings-mail.transport.js';
import { SettingsService } from '../settings/settings.service.js';
import { SmsService } from './sms.service.js';
import { SocialService } from './social.service.js';

@Module({
  imports: [
    UsersModule,
    RolesModule,
    TypeOrmModule.forFeature([
      AuthRefreshToken,
      AuthRevokedFamily,
      AuthEmailToken,
      AuthSession,
    ]),
    AuthenticationModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const appUrl = config.get('APP_URL', { infer: true });
        return {
          accessToken: {
            key: jwtSecret(config),
            issuer: config.get('JWT_ISSUER', { infer: true }),
            audience: config.get('JWT_AUDIENCE', { infer: true }),
            ttl: config.get('ACCESS_TOKEN_TTL', { infer: true }),
          },
          emailVerification: { url: `${appUrl}/verify-email` },
          // Set-password and reset links open the admin, where staff actually sign in.
          passwordReset: { url: `${config.get('ADMIN_URL', { infer: true })}/reset-password` },
        };
      },
    }),
    MailModule.forRootAsync({
      isGlobal: true,
      inject: [SettingsService],
      useFactory: (settings: SettingsService) => ({
        // Read on every send, so a key or sender saved in the back office applies at once.
        get from() {
          return settings.get('MAIL_FROM') ?? 'Dia <no-reply@dia.local>';
        },
        transport: new SettingsMailTransport(settings),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthenticationStore,
    JwtAuth,
    EmailVerificationMailer,
    PasswordResetMailer,
    OtpService,
    SmsService,
    SocialService,
    PermissionPolicy,
  ],
  exports: [PermissionPolicy, SmsService],
})
export class AuthModule {}
