import { z } from 'zod';
import { PERMISSION_KEYS } from '../permissions.js';

const permissions = z
  .array(z.enum(PERMISSION_KEYS as [string, ...string[]]))
  .max(PERMISSION_KEYS.length)
  .transform((list) => [...new Set(list)]);

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullish(),
  permissions,
});
export type CreateRoleDto = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).nullish(),
  permissions: permissions.optional(),
});
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;
