/**
 * The permission catalogue.
 *
 * Permissions are checked by key on the server. Nothing is authorised by
 * hiding a button, by a value the browser sent, or by comparing an email
 * address in application code.
 */
export const PERMISSIONS = {
  // Identity ----------------------------------------------------------------
  'users.read': 'identity',
  'users.suspend': 'identity',
  'users.ban': 'identity',
  'users.restore': 'identity',
  'users.merge_review': 'identity',
  'users.verify_identity': 'identity',

  // Reputation --------------------------------------------------------------
  'reputation.read': 'reputation',
  'reputation.adjust': 'reputation',
  'reputation.configure': 'reputation',

  // Tokens ------------------------------------------------------------------
  'tokens.read_any': 'tokens',
  'tokens.grant': 'tokens',
  'tokens.revoke': 'tokens',
  'tokens.configure': 'tokens',

  // Moderation --------------------------------------------------------------
  'moderation.queue.read': 'moderation',
  'moderation.ticket.assign': 'moderation',
  'moderation.ticket.resolve': 'moderation',
  'moderation.content.remove': 'moderation',
  'moderation.enforcement.issue': 'moderation',
  'moderation.enforcement.revoke': 'moderation',

  // District operations -----------------------------------------------------
  'drivers.review': 'delivery',
  'drivers.approve': 'delivery',
  'causes.review': 'community',
  'causes.approve': 'community',
  'adoptions.review': 'animals',
  'adoptions.approve': 'animals',
  'listings.moderate': 'marketplace',
  'sanctuary.review': 'sanctuary',
  'services.review': 'services',
  'work.moderate': 'work',
  'safe_space.review': 'community',

  // Platform ----------------------------------------------------------------
  'districts.manage': 'platform',
  'settings.manage': 'platform',
  'flags.manage': 'platform',
  'demo.manage': 'platform',
  'analytics.read': 'platform',
  'audit.read': 'audit',
  'payments.read': 'payments',
  'payments.reconcile': 'payments',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

/**
 * System roles.
 *
 * `admin` holds everything. The narrower roles exist so day-to-day operations
 * do not require the full-authority account — least privilege is the default,
 * even for staff.
 */
export const SYSTEM_ROLES: Record<
  string,
  { name: string; description: string; permissions: readonly PermissionKey[] }
> = {
  admin: {
    name: 'Administrator',
    description: 'Full administrative authority over the platform.',
    permissions: PERMISSION_KEYS,
  },
  moderator: {
    name: 'Moderator',
    description: 'Handles reports, tickets and content enforcement.',
    permissions: [
      'users.read',
      'users.suspend',
      'reputation.read',
      'moderation.queue.read',
      'moderation.ticket.assign',
      'moderation.ticket.resolve',
      'moderation.content.remove',
      'moderation.enforcement.issue',
      'listings.moderate',
      'sanctuary.review',
      'services.review',
      'work.moderate',
    ],
  },
  district_reviewer: {
    name: 'District reviewer',
    description: 'Reviews driver applications, causes, adoption applications, churches and professional licences.',
    permissions: [
      'users.read',
      'drivers.review',
      'drivers.approve',
      'causes.review',
      'causes.approve',
      'adoptions.review',
      'adoptions.approve',
      'sanctuary.review',
      'services.review',
    ],
  },
  /*
   * Espacio Violeta's reports are read only by guardians the owner chose by
   * name — not by every moderator. A reported message there can be about
   * abuse, and the person who reads it should have been picked for that.
   */
  safe_space_guardian: {
    name: 'Espacio Violeta guardian',
    description: 'Reads and decides reports inside Espacio Violeta. Nothing else.',
    permissions: ['safe_space.review'],
  },
  support: {
    name: 'Support',
    description: 'Reads accounts and tickets to help users; changes nothing.',
    permissions: ['users.read', 'reputation.read', 'moderation.queue.read', 'tokens.read_any'],
  },
  member: {
    name: 'Member',
    description: 'A verified Yavaya member. Holds no administrative permission.',
    permissions: [],
  },
};
