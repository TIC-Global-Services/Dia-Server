import { z } from 'zod';
import { emailSchema, passwordSchema } from '../../auth/dto/auth.dto.js';
import { paginationSchema } from '../../common/pagination.js';
import { UserStatus } from '../entities/user.entity.js';

const roleKey = z.string().regex(/^[a-z0-9-]{1,40}$/);

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  avatarUrl: z.url().max(500).nullish(),
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

/** Changes an admin may make to another person. */
export const adminUpdateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: roleKey.optional(),
  status: z.enum(UserStatus).optional(),
});
export type AdminUpdateUserDto = z.infer<typeof adminUpdateUserSchema>;

export const createStaffSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  role: roleKey,
  /** Leave out to email the person a link to choose their own password. */
  password: passwordSchema.optional(),
});
export type CreateStaffDto = z.infer<typeof createStaffSchema>;

export const listUsersSchema = paginationSchema.extend({
  q: z.string().trim().max(100).refine((v) => v.length === 0 || v.length >= 3, 'Type at least 3 characters to search').optional(),
  /** staff = anyone with a team role; customers = shoppers. */
  kind: z.enum(['staff', 'customers', 'all']).default('all'),
});
export type ListUsersQuery = z.infer<typeof listUsersSchema>;

export const listCustomersSchema = paginationSchema.extend({ q: z.string().trim().max(100).refine((v) => v.length === 0 || v.length >= 3, 'Type at least 3 characters to search').optional() });
export type ListCustomersQuery = z.infer<typeof listCustomersSchema>;

export const customerStatusSchema = z.object({ status: z.enum(UserStatus) });
export type CustomerStatusDto = z.infer<typeof customerStatusSchema>;
