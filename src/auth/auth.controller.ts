import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Can } from '@nestjs/authorization';
import { CurrentUser, Public } from '@nestjs/authentication';
import { Throttle } from '@nestjs/throttler';
import type { User } from '../users/entities/user.entity.js';
import { AuthService } from './auth.service.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  socialLoginSchema,
  socialProviderSchema,
  verifyEmailSchema,
  type ChangePasswordDto,
  type ForgotPasswordDto,
  type LoginDto,
  type OtpRequestDto,
  type OtpVerifyDto,
  type RefreshDto,
  type RegisterDto,
  type ResetPasswordDto,
  type SocialLoginDto,
  type SocialProvider,
  type VerifyEmailDto,
} from './dto/auth.dto.js';

// Credential endpoints get a much tighter limit than the global default.
const STRICT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(STRICT)
  @Post('register')
  register(@Body({ schema: registerSchema }) dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle(STRICT)
  @Post('login')
  @HttpCode(200)
  login(@Body({ schema: loginSchema }) dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body({ schema: refreshSchema }) dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body({ schema: refreshSchema }) dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Can.Anyone()
  @Post('logout-all')
  @HttpCode(204)
  logoutAll(@CurrentUser() user: User) {
    return this.auth.logoutAll(user.id);
  }

  // --- mobile OTP ---

  @Public()
  @Throttle(STRICT)
  @Post('otp/request')
  @HttpCode(200)
  requestOtp(@Body({ schema: otpRequestSchema }) dto: OtpRequestDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Public()
  @Throttle(STRICT)
  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body({ schema: otpVerifySchema }) dto: OtpVerifyDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  @ApiBearerAuth()
  @Can.Anyone()
  @Throttle(STRICT)
  @Post('phone/request')
  @HttpCode(200)
  requestPhone(
    @CurrentUser() user: User,
    @Body({ schema: otpRequestSchema }) dto: OtpRequestDto,
  ) {
    return this.auth.requestPhoneLink(user.id, dto.phone);
  }

  @ApiBearerAuth()
  @Can.Anyone()
  @Throttle(STRICT)
  @Post('phone/verify')
  @HttpCode(200)
  verifyPhone(
    @CurrentUser() user: User,
    @Body({ schema: otpVerifySchema }) dto: OtpVerifyDto,
  ) {
    return this.auth.confirmPhoneLink(user.id, dto.phone, dto.code);
  }

  // --- social ---

  /** What the website may offer on its sign-in screen. */
  @Public()
  @Get('providers')
  providers() {
    return this.auth.signInOptions();
  }

  @Public()
  @Throttle(STRICT)
  @Post('social/:provider')
  @HttpCode(200)
  social(
    @Param('provider', { schema: socialProviderSchema })
    provider: SocialProvider,
    @Body({ schema: socialLoginSchema }) dto: SocialLoginDto,
  ) {
    return this.auth.socialLogin(provider, dto);
  }

  @ApiBearerAuth()
  @Can.Anyone()
  @Post('social/:provider/link')
  @HttpCode(204)
  linkSocial(
    @CurrentUser() user: User,
    @Param('provider', { schema: socialProviderSchema })
    provider: SocialProvider,
    @Body({ schema: socialLoginSchema }) dto: SocialLoginDto,
  ) {
    return this.auth.linkSocial(user.id, provider, dto);
  }

  // --- password and email ---

  @Public()
  @Throttle(STRICT)
  @Post('password/forgot')
  @HttpCode(202)
  forgot(@Body({ schema: forgotPasswordSchema }) dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle(STRICT)
  @Post('password/reset')
  @HttpCode(204)
  reset(@Body({ schema: resetPasswordSchema }) dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @ApiBearerAuth()
  @Can.Anyone()
  @Throttle(STRICT)
  @Post('password/change')
  @HttpCode(200)
  change(
    @CurrentUser() user: User,
    @Body({ schema: changePasswordSchema }) dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user.id, dto);
  }

  @Public()
  @Throttle(STRICT)
  @Post('email/verify')
  @HttpCode(204)
  verifyEmail(@Body({ schema: verifyEmailSchema }) dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @ApiBearerAuth()
  @Can.Anyone()
  @Throttle(STRICT)
  @Post('email/resend')
  @HttpCode(204)
  resend(@CurrentUser() user: User) {
    return this.auth.resendVerification(user.id);
  }
}
