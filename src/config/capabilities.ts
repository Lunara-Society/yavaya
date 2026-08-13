/**
 * Capability states.
 *
 * Every capability in Yavaya declares exactly one of these, and the interface
 * renders it. This is the mechanism behind the standard: nothing may be
 * presented as working when it is not.
 *
 *   REAL      — implemented, wired to production infrastructure, working now.
 *   DEMO      — visible sample content. Explicitly marked, excluded from every
 *               statistic, never generates a notification, expires.
 *   MOCK      — a stand-in with no real behaviour behind it. Must never appear
 *               in a user-facing flow that implies it works.
 *   REQUIRES_CONFIGURATION — implemented, but inert until credentials, an
 *               external provider, or a regulatory decision is supplied.
 *
 * A capability may not be `REAL` because it "basically works". If any part of
 * the path to a user-visible result is simulated, it is not REAL.
 */
export const CAPABILITY_STATES = ['REAL', 'DEMO', 'MOCK', 'REQUIRES_CONFIGURATION'] as const;

export type CapabilityState = (typeof CAPABILITY_STATES)[number];

export type Capability = {
  key: string;
  /** i18n key for the capability's name. */
  nameKey: string;
  /** i18n key for one line describing what it does. */
  detailKey: string;
  state: CapabilityState;
  group: 'platform' | 'trust' | 'district' | 'integration';
  /**
   * For anything not REAL: what would have to happen. Written for an operator,
   * not a user. Kept in English deliberately — it points at documentation and
   * configuration keys, which are not translated.
   */
  blockedBy?: string;
};

/**
 * The platform capability register.
 *
 * This is the single source of truth for `/status`, and the place a reviewer
 * looks to answer "what actually works?". Changing a state here without the
 * implementation to match it is the one thing this file exists to prevent.
 */
export const CAPABILITIES: readonly Capability[] = [
  // --- Platform -------------------------------------------------------------
  {
    key: 'identity',
    nameKey: 'capability.identity.name',
    detailKey: 'capability.identity.detail',
    state: 'REAL',
    group: 'platform',
  },
  {
    key: 'authentication',
    nameKey: 'capability.authentication.name',
    detailKey: 'capability.authentication.detail',
    state: 'REAL',
    group: 'platform',
  },
  {
    key: 'authorization',
    nameKey: 'capability.authorization.name',
    detailKey: 'capability.authorization.detail',
    state: 'REAL',
    group: 'platform',
  },
  {
    key: 'geography',
    nameKey: 'capability.geography.name',
    detailKey: 'capability.geography.detail',
    state: 'REAL',
    group: 'platform',
  },
  {
    key: 'language',
    nameKey: 'capability.language.name',
    detailKey: 'capability.language.detail',
    state: 'REAL',
    group: 'platform',
  },
  {
    key: 'appearance',
    nameKey: 'capability.appearance.name',
    detailKey: 'capability.appearance.detail',
    state: 'REAL',
    group: 'platform',
  },
  {
    key: 'notification_preferences',
    nameKey: 'capability.notification_preferences.name',
    detailKey: 'capability.notification_preferences.detail',
    state: 'REAL',
    group: 'platform',
  },
  {
    key: 'location_privacy',
    nameKey: 'capability.location_privacy.name',
    detailKey: 'capability.location_privacy.detail',
    state: 'REAL',
    group: 'platform',
  },

  // --- Trust ----------------------------------------------------------------
  {
    key: 'anti_duplication',
    nameKey: 'capability.anti_duplication.name',
    detailKey: 'capability.anti_duplication.detail',
    state: 'REAL',
    group: 'trust',
  },
  {
    key: 'new_user_monitoring',
    nameKey: 'capability.new_user_monitoring.name',
    detailKey: 'capability.new_user_monitoring.detail',
    state: 'REAL',
    group: 'trust',
  },
  {
    key: 'audit',
    nameKey: 'capability.audit.name',
    detailKey: 'capability.audit.detail',
    state: 'REAL',
    group: 'trust',
  },
  {
    key: 'tokens',
    nameKey: 'capability.tokens.name',
    detailKey: 'capability.tokens.detail',
    state: 'REAL',
    group: 'trust',
  },
  {
    key: 'reputation',
    nameKey: 'capability.reputation.name',
    detailKey: 'capability.reputation.detail',
    state: 'REAL',
    group: 'trust',
  },
  {
    key: 'trust_shield',
    nameKey: 'capability.trust_shield.name',
    detailKey: 'capability.trust_shield.detail',
    state: 'REAL',
    group: 'trust',
  },
  {
    key: 'rate_limiting',
    nameKey: 'capability.rate_limiting.name',
    detailKey: 'capability.rate_limiting.detail',
    state: 'REAL',
    group: 'trust',
  },
  {
    key: 'moderation',
    nameKey: 'capability.moderation.name',
    detailKey: 'capability.moderation.detail',
    state: 'REQUIRES_CONFIGURATION',
    group: 'trust',
    blockedBy: 'Schema and enforcement records exist; reporting flows and the moderation queue are Phase 1.',
  },
  {
    key: 'live_activity',
    nameKey: 'capability.live_activity.name',
    detailKey: 'capability.live_activity.detail',
    state: 'REAL',
    group: 'trust',
    blockedBy:
      'Implemented and real, but emits nothing until districts produce events. It is never padded with invented activity.',
  },

  // --- Districts ------------------------------------------------------------
  // Every district is Phase 1 or later. None is built, and none pretends to be.
  {
    key: 'districts',
    nameKey: 'capability.districts.name',
    detailKey: 'capability.districts.detail',
    state: 'REQUIRES_CONFIGURATION',
    group: 'district',
    blockedBy: 'Registry, theming and routing exist. District experiences are Phase 1+.',
  },

  // --- Integrations ---------------------------------------------------------
  // These read their real state from the environment at request time; see
  // `integrationCapabilities()` in src/server/domains/platform/capability.ts.
] as const;

export function capabilitiesByGroup(group: Capability['group']): Capability[] {
  return CAPABILITIES.filter((capability) => capability.group === group);
}

/** i18n key for a state label, so the badge is never a hard-coded word. */
export function stateLabelKey(state: CapabilityState): string {
  return `capability.state.${state}`;
}
