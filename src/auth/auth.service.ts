import {
  EmailVerificationService,
  PasswordHasher,
  PasswordResetService,
  TokenService,
} from '@nestjs/authentication';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { User, UserRole, UserStatus } from '../users/entities/user.entity.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import type {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  SocialLoginDto,
  SocialProvider,
} from './dto/auth.dto.js';
import { OtpService } from './otp.service.js';
import { SocialService } from './social.service.js';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly emailVerification: EmailVerificationService,
    private readonly passwordReset: PasswordResetService,
    private readonly otp: OtpService,
    private readonly social: SocialService,
    private readonly config: ConfigService<Env, true>,
    private readonly settings: SettingsService,
  ) {}

  /** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD, once, if no admin exists. */
  async onModuleInit(): Promise<void> {
    const email = this.config.get('ADMIN_EMAIL', { infer: true });
    const password = this.config.get('ADMIN_PASSWORD', { infer: true });
    if (!email || !password || (await this.users.hasAdmin())) return;
    const existing = await this.users.findByEmail(email);
    if (existing) {
      this.logger.warn(
        `ADMIN_EMAIL ${email} belongs to a non-admin user; not promoting it automatically`,
      );
      return;
    }
    await this.users.create({
      email,
      emailVerified: true,
      name: 'Admin',
      role: UserRole.ADMIN,
      passwordHash: await this.hasher.hash(password),
    });
    this.logger.log(`Created admin account ${email}`);
  }

  // --- email + password ---

  async register(dto: RegisterDto): Promise<AuthResult> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('Email is already registered');
    }
    if (await this.users.findByPhone(dto.phone)) {
      throw new ConflictException('Mobile number is already registered');
    }
    const user = await this.users.create({
      email: dto.email,
      phone: dto.phone,
      name: dto.name ?? null,
      passwordHash: await this.hasher.hash(dto.password),
    });
    await this.sendVerification(user);
    return this.signIn(user, 'password');
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email, true);
    // verify() also runs against a dummy hash when the user or hash is missing,
    // so timing does not reveal which emails exist.
    const ok = await this.hasher.verify(
      dto.password,
      user?.passwordHash ?? null,
    );
    if (!user || !ok)
      throw new UnauthorizedException('Invalid email or password');
    return this.signIn(user, 'password');
  }

  // --- tokens ---

  async refresh(refreshToken: string) {
    try {
      return await this.tokens.refresh(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  logout(refreshToken: string): Promise<boolean> {
    return this.tokens.revoke(refreshToken);
  }

  logoutAll(userId: string): Promise<void> {
    return this.tokens.revokeAll(userId);
  }

  // --- mobile OTP ---

  /** A code is only sent to a number that already belongs to an account: signing in never creates one. */
  async requestOtp(phone: string) {
    await this.requireAccountWithPhone(phone);
    return this.otp.request(phone);
  }

  async verifyOtp(phone: string, code: string): Promise<AuthResult> {
    await this.otp.verify(phone, code);
    let user = await this.requireAccountWithPhone(phone);
    // Receiving the code proves the number, even if it was only typed at registration.
    if (!user.phoneVerified) user = await this.users.setVerifiedPhone(user.id, phone);
    return this.signIn(user, 'otp');
  }

  private async requireAccountWithPhone(phone: string): Promise<User> {
    const user = await this.users.findByPhone(phone);
    if (!user) {
      throw new NotFoundException(
        'No account uses this mobile number. Create an account first.',
      );
    }
    return user;
  }

  /** Signed-in user adds or changes their phone number. */
  async requestPhoneLink(userId: string, phone: string) {
    const owner = await this.users.findByPhone(phone);
    if (owner && owner.id !== userId)
      throw new ConflictException('Phone number is already registered');
    return this.otp.request(phone);
  }

  async confirmPhoneLink(
    userId: string,
    phone: string,
    code: string,
  ): Promise<User> {
    await this.otp.verify(phone, code);
    return this.users.setVerifiedPhone(userId, phone);
  }

  // --- social login ---

  signInOptions() {
    const clientId = (this.settings.get('GOOGLE_CLIENT_IDS') ?? '').split(',').map((v) => v.trim()).find(Boolean);
    return { google: clientId ? { clientId } : null };
  }

  async socialLogin(
    provider: SocialProvider,
    dto: SocialLoginDto,
  ): Promise<AuthResult> {
    const profile = await this.social.verify(provider, dto.idToken, dto.nonce);

    const linked = await this.users.findByIdentity(provider, profile.subject);
    if (linked) return this.signIn(linked, provider);

    if (profile.email && profile.emailVerified) {
      const existing = await this.users.findByEmail(profile.email);
      if (existing) {
        // Never attach a social login to an unverified local account: someone could
        // have registered the victim's email with their own password beforehand.
        if (!existing.emailVerified) {
          throw new ForbiddenException(
            'An unverified account uses this email. Verify it first, then connect your social login from your profile.',
          );
        }
        await this.users.linkIdentity(
          existing.id,
          provider,
          profile.subject,
          profile.email,
        );
        return this.signIn(existing, provider);
      }
    }

    const user = await this.users.create({
      email: profile.emailVerified ? profile.email : null,
      emailVerified: Boolean(profile.email && profile.emailVerified),
      name: profile.name,
    });
    await this.users.linkIdentity(
      user.id,
      provider,
      profile.subject,
      profile.email,
    );
    return this.signIn(user, provider);
  }

  /** Signed-in user connects another login method to their account. */
  async linkSocial(
    userId: string,
    provider: SocialProvider,
    dto: SocialLoginDto,
  ): Promise<void> {
    const profile = await this.social.verify(provider, dto.idToken, dto.nonce);
    const owner = await this.users.findByIdentity(provider, profile.subject);
    if (owner && owner.id !== userId)
      throw new ConflictException(`This ${provider} account is already linked`);
    if (!owner)
      await this.users.linkIdentity(
        userId,
        provider,
        profile.subject,
        profile.email,
      );
  }

  // --- password management ---

  async forgotPassword(email: string): Promise<void> {
    // Always succeeds from the caller's view, so it cannot be used to probe for accounts.
    this.passwordReset.request(email);
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const result = await this.passwordReset.reset(token, password);
    if (!result)
      throw new BadRequestException('Reset link is invalid or expired');
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<AuthResult> {
    const user = await this.users.findByIdWithPassword(userId);
    if (user.passwordHash) {
      if (
        !dto.currentPassword ||
        !(await this.hasher.verify(dto.currentPassword, user.passwordHash))
      ) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }
    await this.users.setPasswordHash(
      user.id,
      await this.hasher.hash(dto.newPassword),
    );
    await this.tokens.revokeAll(user.id); // every other device signs in again
    return this.signIn(user, 'password');
  }

  // --- email verification ---

  async verifyEmail(token: string): Promise<void> {
    const result = await this.emailVerification.verify(token);
    if (!result)
      throw new BadRequestException('Verification link is invalid or expired');
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user.email)
      throw new BadRequestException('Add an email address first');
    if (user.emailVerified) return;
    await this.sendVerification(user);
  }

  // --- internals ---

  private async sendVerification(user: User): Promise<void> {
    if (!user.email) return;
    try {
      await this.emailVerification.send({ id: user.id, email: user.email });
    } catch (err) {
      // Sign-up must not fail because mail is down; the user can resend.
      this.logger.error(`Could not send verification email: ${String(err)}`);
    }
  }

  private async signIn(user: User, method: string): Promise<AuthResult> {
    if (user.status !== UserStatus.ACTIVE)
      throw new ForbiddenException('Account is suspended');
    await this.users.touchLogin(user.id);
    const issued = await this.tokens.issue(user.id, { method });
    // The hash is only loaded for password checks; it must never reach a response.
    const safe = Object.assign(new User(), user);
    Reflect.deleteProperty(safe, 'passwordHash');
    return { ...issued, user: safe };
  }
}
