/** What a role can be allowed to do. One level per area: having it means full use of that area. */
export const PERMISSIONS = [
  { key: 'orders', label: 'Orders', description: 'See every order, pack and ship it, take cash payments, cancel.' },
  { key: 'refunds', label: 'Refunds', description: 'Send money back to customers.' },
  { key: 'catalogue', label: 'Catalogue', description: 'Pieces, collections, stock and photographs.' },
  { key: 'offers', label: 'Offers', description: 'Coupons and automatic discounts.' },
  { key: 'shipping', label: 'Shipping', description: 'Delivery zones and rates.' },
  { key: 'content', label: 'Website content', description: 'Pages and banners.' },
  { key: 'settings', label: 'Settings', description: 'Payment gateways, email, SMS and sign-in providers. Holds the keys to the shop.' },
  { key: 'people', label: 'People and access', description: 'Add team members, change roles and what each role can do.' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
export const PERMISSION_KEYS: string[] = PERMISSIONS.map((p) => p.key);

/** The whole of everything, now and later. Only the Admin role holds it. */
export const EVERYTHING = '*';

export const BUILT_IN_ROLES: { key: string; name: string; description: string; permissions: string[] }[] = [
  { key: 'admin', name: 'Admin', description: 'Everything, including people and access. Cannot be edited.', permissions: [EVERYTHING] },
  { key: 'manager', name: 'Manager', description: 'Runs the shop day to day: orders, refunds, catalogue, offers, shipping and content.', permissions: ['orders', 'refunds', 'catalogue', 'offers', 'shipping', 'content'] },
  { key: 'catalogue', name: 'Catalogue editor', description: 'Looks after pieces, photographs, stock and website content.', permissions: ['catalogue', 'content'] },
  { key: 'fulfilment', name: 'Fulfilment', description: 'Packs and ships orders.', permissions: ['orders', 'shipping'] },
  { key: 'support', name: 'Support', description: 'Looks up orders to answer customers. Cannot refund.', permissions: ['orders'] },
];

type WithPermissions = { permissions?: string[] } | null | undefined;

/** Does this signed-in user hold the permission? The Admin role holds "*". */
export function can(user: WithPermissions, permission: string): boolean {
  const have = user?.permissions ?? [];
  return have.includes(EVERYTHING) || have.includes(permission);
}

/** Anyone with at least one permission is team, not a customer. */
export const isStaff = (user: WithPermissions): boolean => (user?.permissions?.length ?? 0) > 0;

/** May `actor` hand out all of `granted`? Nobody can give away more than they have. */
export function canGrant(actor: WithPermissions, granted: string[]): boolean {
  const have = actor?.permissions ?? [];
  if (have.includes(EVERYTHING)) return true;
  return granted.every((p) => p !== EVERYTHING && have.includes(p));
}
