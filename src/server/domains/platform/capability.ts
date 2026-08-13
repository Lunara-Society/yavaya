import 'server-only';
import { serverEnv } from '@/config/env';
import { CAPABILITIES, type Capability } from '@/config/capabilities';
import { listProviderAvailability } from '@/server/domains/payments/service';

/**
 * Integration capabilities, resolved from the environment at request time.
 *
 * These are not hard-coded in the register because their state genuinely
 * depends on deployment. Everything else is a static declaration; these are
 * measured.
 */
export function integrationCapabilities(): Capability[] {
  const env = serverEnv();

  const integrations: Capability[] = [
    {
      key: 'email_delivery',
      nameKey: 'capability.email_delivery.name',
      detailKey: 'capability.email_delivery.detail',
      state: env.EMAIL_PROVIDER === 'unconfigured' ? 'REQUIRES_CONFIGURATION' : 'REAL',
      group: 'integration',
      blockedBy:
        env.EMAIL_PROVIDER === 'unconfigured'
          ? 'Set EMAIL_PROVIDER, SMTP_URL and EMAIL_FROM, then implement the delivery adapter. Registration must not open to the public before this exists.'
          : undefined,
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
      state: env.MEDIA_STORAGE_PROVIDER === 'unconfigured' ? 'REQUIRES_CONFIGURATION' : 'REAL',
      group: 'integration',
      blockedBy:
        env.MEDIA_STORAGE_PROVIDER === 'unconfigured'
          ? 'Uploads are rejected rather than lost. Needs a storage adapter plus the validation pipeline (type sniffing, re-encoding to strip EXIF, malware scanning, separate serving origin).'
          : undefined,
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
  return [...CAPABILITIES, ...integrationCapabilities()];
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
