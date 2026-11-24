import { z } from 'zod';

export const emailSchema = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());

/** E.164 after stripping spaces, dashes and brackets, e.g. +919876543210. */
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s\-()]/g, ''))
  .pipe(
    z
      .string()
      .regex(
        /^\+[1-9]\d{7,14}$/,
        'Use international format, e.g. +919876543210',
      ),
  );

export const passwordSchema = z.string().min(8).max(128);

export const registerSchema = z.object({
  email: emailSchema,
  /** Mobile number, so the customer can also sign in with a one-time code. */
  phone: phoneSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120).optional(),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10).max(500),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

export const otpRequestSchema = z.object({ phone: phoneSchema });
export type OtpRequestDto = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'Code is 6 digits'),
});
export type OtpVerifyDto = z.infer<typeof otpVerifySchema>;

export const socialProviderSchema = z.enum(['google']);
export type SocialProvider = z.infer<typeof socialProviderSchema>;

export const socialLoginSchema = z.object({
  /** The OpenID Connect ID token the client got from the provider SDK. */
  idToken: z.string().min(20).max(8192),
  /** Raw nonce, when the client sent one to the provider. */
  nonce: z.string().max(200).optional(),
});
export type SocialLoginDto = z.infer<typeof socialLoginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(500),
  password: passwordSchema,
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  /** Required when the account already has a password. */
  currentPassword: z.string().max(128).optional(),
  newPassword: passwordSchema,
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(10).max(500),
});
export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;
