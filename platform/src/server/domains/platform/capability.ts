import 'server-only';
import { serverEnv } from '@/config/env';
import { CAPABILITIES, type Capability, type CapabilityState } from '@/config/capabilities';
import { listProviderAvailability } from '@/server/domains/payments/service';
import { emailAvailability } from '@/server/domains/notifications/email/service';
import { mediaStorageAvailability } from '@/server/domains/media/storage';

/**
 * Email is the one capability with a genuine MOCK state: the console provider
 * exists so a developer can complete a verification flow locally, and it sends
 * nothing at all. Reporting that as REAL would hide the launch blocker.
 */
function emailCapabilityState(): CapabilityState {
  if (emailAvailability().available) return 'REAL';
  return serverEnv().EMAIL_PROVIDER === 'console' ? 'MOCK' : 'REQUIRES_CONFIGURATION';
}

function emailBlocker(): string | undefined {
  const availability = emailAvailability();
  return availability.available ? undefined : availability.reason;
}

/**
 * Integration capabilities, resolved from the environment at request time.
 *
 * These are not hard-coded in the register because their state genuinely
 * depends on deployment. Everything else is a static declaration; these are
 * measured.
 */
export function integrationCapabilities(): Capability[] {
  const env = serverEnv();
  const media = mediaStorageAvailability();

  const integrations: Capability[] = [
    {
      key: 'email_delivery',
      nameKey: 'capability.email_delivery.name',
      detailKey: 'capability.email_delivery.detail',
      /*
       * Three distinct states, because "an adapter is selected" is not the same
       * as "mail is delivered":
       *   smtp or resend, with credentials → REAL
       *   console             → MOCK — it writes to the log and sends nothing
       *   anything else       → REQUIRES_CONFIGURATION
       */
      state: emailCapabilityState(),
      group: 'integration',
      blockedBy: emailBlocker(),
    },
    {
      key: 'sms_delivery',
      nameKey: 'capability.sms_delivery.name',
      detailKey: 'capability.sms_delivery.detail',
      state: env.SMS_PROVIDER === 'unconfigured' ? 'REQUIRES_CONFIGURATION' : 'REAL',
      group: 'integration',
      blockedBy:
        env.SMS_PROVIDER === 'unconfigured'
          ? 'Choose a provider with reliable delivery across all seven launch countries. Phone verification cannot complete until then.'
          : undefined,
    },
    {
      key: 'kyc',
      nameKey: 'capability.kyc.name',
      detailKey: 'capability.kyc.detail',
      state: env.KYC_PROVIDER === 'unconfigured' ? 'REQUIRES_CONFIGURATION' : 'REAL',
      group: 'integration',
      blockedBy:
        env.KYC_PROVIDER === 'unconfigured'
          ? 'Set KYC_PROVIDER=manual to route submissions to the admin review queue, or integrate a vendor. Per-country document requirements are an open legal decision.'
          : undefined,
    },
    {
      key: 'media_storage',
      nameKey: 'capability.media_storage.name',
      detailKey: 'capability.media_storage.detail',
      /*
       * Measured, like email: REAL only when the S3 adapter has every
       * credential it needs. A provider name on its own proves nothing.
       */
      state: media.available ? 'REAL' : 'REQUIRES_CONFIGURATION',
      group: 'integration',
      blockedBy: media.available ? undefined : media.reason,
    },
    {
      key: 'geoip',
      nameKey: 'capability.geoip.name',
      detailKey: 'capability.geoip.detail',
      state: env.GEOIP_PROVIDER === 'unconfigured' ? 'REQUIRES_CONFIGURATION' : 'REAL',
      group: 'integration',
      blockedBy:
        env.GEOIP_PROVIDER === 'unconfigured'
          ? 'Location is chosen manually or via explicit GPS permission. This is a degraded experience, not a broken one.'
          : undefined,
    },
  ];

  for (const provider of listProviderAvailability()) {
    integrations.push({
      key: `payments_${provider.key}`,
      nameKey: 'capability.payments.name',
      detailKey: 'capability.payments.detail',
      state: provider.available ? 'REAL' : 'REQUIRES_CONFIGURATION',
      group: 'integration',
      blockedBy: provider.available ? undefined : provider.reason,
    });
  }

  return integrations;
}

/** The complete picture: declared capabilities plus measured integrations. */
export function allCapabilities(): Capability[] {
  return [...CAPABILITIES.map(measured), ...integrationCapabilities()];
}

/**
 * Email verification is implemented and tested; whether it works for a member
 * depends only on delivery. Declaring it statically would either claim REAL
 * where no code can arrive, or keep saying "requires configuration" after it
 * works — both are wrong, so it follows the measured email state.
 */
function measured(capability: Capability): Capability {
  if (capability.key === 'mercadito') {
    const media = mediaStorageAvailability();
    return media.available ? { ...capability, state: 'REAL', blockedBy: undefined } : capability;
  }
  if (capability.key !== 'email_verification') return capability;
  const state = emailCapabilityState();
  if (state === 'REAL') return { ...capability, state, blockedBy: undefined };
  return capability;
}

/**
 * True when every capability a flow depends on is REAL.
 *
 * Call this before offering a flow, so the interface can decline honestly
 * instead of failing halfway through.
 */
export function capabilitiesReady(keys: string[]): boolean {
  const byKey = new Map(allCapabilities().map((capability) => [capability.key, capability]));
  return keys.every((key) => byKey.get(key)?.state === 'REAL');
}
