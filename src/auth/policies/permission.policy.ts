import { Policy } from '@nestjs/authorization';
import type { User } from '../../users/entities/user.entity.js';
import { can, isStaff } from '../../roles/permissions.js';

/**
 * One ability per area of the back office, read from the permissions the user's role carries
 * (loaded on every request, so a role change takes effect at once). `staff` = any team member.
 */
@Policy()
export class PermissionPolicy {
  staff(user: User | null) { return isStaff(user); }
  orders(user: User | null) { return can(user, 'orders'); }
  refunds(user: User | null) { return can(user, 'refunds'); }
  catalogue(user: User | null) { return can(user, 'catalogue'); }
  offers(user: User | null) { return can(user, 'offers'); }
  shipping(user: User | null) { return can(user, 'shipping'); }
  content(user: User | null) { return can(user, 'content'); }
  /** Uploading pictures and videos: whoever edits the catalogue or the site's content. */
  media(user: User | null) { return can(user, 'catalogue') || can(user, 'content'); }
  settings(user: User | null) { return can(user, 'settings'); }
  people(user: User | null) { return can(user, 'people'); }
}
