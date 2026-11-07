import 'server-only';
import { serverEnv } from '@/config/env';
import { CAPABILITIES, type Capability, type CapabilityState } from '@/config/capabilities';
import { listProviderAvailability } from '@/server/domains/payments/service';
import { emailAvailability } from '@/server/domains/notifications/email/service';
import { mediaStorageAvailability } from '@/server/domains/media/storage';
import { safeSpaceAvailable } from '@/server/domains/safe-space/service';
import { twoStepAvailable } from '@/server/domains/identity/two-step';
import { canVerifyPhones, phoneVerifierAvailability } from '@/server/domains/identity/phone/verifier';
import { googleSignIn } from '@/server/domains/identity/google';
import { roxiAvailability } from '@/server/domains/roxi/service';
import { billingReadiness } from '@/server/domains/roxi/billing';
import { itemsAvailable } from '@/server/domains/roxi/items';
import { connectorsAvailable } from '@/server/domains/roxi/connectors/service';
import { googleConnectorAvailable } from '@/server/domains/roxi/connectors/google';
import { whatsappAvailability } from '@/server/domains/whatsapp/service';

/**
 * Email is the one capability with a genuine MOCK state: the console provider
 * exists so a developer can complete a verification flow locally, and it sends
 * nothing at all. Reporting that as REAL would hide the launch blocker.
 */
function emailCapabilityState(): CapabilityState {
  if (emailAvailability().available) return 'REAL';
  return serverEnv().EMAIL_PROVIDER === 'console' ? 'MOCK' : 'REQUIRES_CONFIGURATION';
}

function smsCapabilityState(): CapabilityState {
  if (canVerifyPhones()) return 'REAL';
  return serverEnv().SMS_PROVIDER === 'console' ? 'MOCK' : 'REQUIRES_CONFIGURATION';
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
  const sms = phoneVerifierAvailability();
  const google = googleSignIn();
  const roxi = roxiAvailability();

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
      // Measured like email: REAL only with Twilio Verify fully configured;
      // the console verifier logs codes and sends nothing.
      state: smsCapabilityState(),
      group: 'integration',
      // Deferred by the owner (20 October 2026): SMS costs per message, so phone
      // verification comes later; email, Google and two-step sign-in come first.
      blockedBy: sms.available && sms.provider !== 'console' ? undefined : sms.available ? 'SMS_PROVIDER=console writes codes to the log and sends nothing.' : `Deferred by the owner's decision (20 October 2026): phone verification comes later. ${sms.reason}`,
    },
    {
      key: 'google_sign_in',
      nameKey: 'capability.google_sign_in.name',
      detailKey: 'capability.google_sign_in.detail',
      // Measured: the button exists only when the OAuth client is configured.
      state: google.available ? 'REAL' : 'REQUIRES_CONFIGURATION',
      group: 'integration',
      blockedBy: google.available ? undefined : google.reason,
    },
    {
      key: 'roxi',
      nameKey: 'capability.roxi.name',
      detailKey: 'capability.roxi.detail',
      // Measured: the button appears only when an agent is configured, and
      // what Roxi does on the site goes through the same forms and services
      // as everything else, so there is nothing further to simulate.
      state: roxi.available ? 'REAL' : 'REQUIRES_CONFIGURATION',
      group: 'integration',
      blockedBy: roxi.available
        ? undefined
        : 'Set ROXI_AGENT_ID to the ElevenLabs agent (docs/roxi/README.md). ELEVENLABS_API_KEY is optional and makes conversations start only from signed links.',
    },
    {
      key: 'roxi_plans',
      nameKey: 'capability.roxi_plans.name',
      detailKey: 'capability.roxi_plans.detail',
      // Sold only when their credit limits can be kept: Stripe to take the
      // money and an ElevenLabs key to read each conversation's real cost.
      state: roxi.available && billingReadiness().ready ? 'REAL' : 'REQUIRES_CONFIGURATION',
      group: 'integration',
      blockedBy: (() => {
        const readiness = billingReadiness();
        if (readiness.ready) return roxi.available ? undefined : 'Roxi herself is not configured (ROXI_AGENT_ID).';
        return [
          readiness.missing.includes('metering') ? 'ELEVENLABS_API_KEY (Agents permission) is not set, so conversation costs cannot be read back and credits cannot be counted; then enable authentication on the agent so only signed links open conversations.' : '',
          readiness.missing.includes('payments') ? 'Stripe is not configured.' : '',
        ]
          .filter(Boolean)
          .join(' ');
      })(),
    },
    {
      key: 'roxi_memory',
      nameKey: 'capability.roxi_memory.name',
      detailKey: 'capability.roxi_memory.detail',
      state: roxi.available && itemsAvailable() ? 'REAL' : 'REQUIRES_CONFIGURATION',
      group: 'integration',
      blockedBy: itemsAvailable() ? undefined : 'Set ROXI_KEY (at least 32 random characters): goals, reminders and moments are sealed with it and are never stored without it.',
    },
    {
      key: 'roxi_connectors_google',
      nameKey: 'capability.roxi_connectors_google.name',
      detailKey: 'capability.roxi_connectors_google.detail',
      state: googleConnectorAvailable() && connectorsAvailable() ? 'REAL' : 'REQUIRES_CONFIGURATION',
      group: 'integration',
      blockedBy:
        googleConnectorAvailable() && connectorsAvailable()
          ? undefined
          : 'In the Google Cloud project behind GOOGLE_CLIENT_ID: enable the Gmail and Calendar APIs, add their scopes to the consent screen, register /api/roxi/connectors/google/callback as a redirect URI, then set ROXI_GOOGLE_CONNECTOR=enabled (and ROXI_KEY). Gmail scopes are restricted: until Google verifies the app, at most 100 accounts can connect and the consent screen warns them.',
    },
    {
      key: 'roxi_connectors_custom',
      nameKey: 'capability.roxi_connectors_custom.name',
      detailKey: 'capability.roxi_connectors_custom.detail',
      state: roxi.available && connectorsAvailable() ? 'REAL' : 'REQUIRES_CONFIGURATION',
      group: 'integration',
      blockedBy: connectorsAvailable() ? undefined : 'Set ROXI_KEY: connector secrets are sealed with it and are never stored without it.',
    },
    {
      key: 'whatsapp_inbox',
      nameKey: 'capability.whatsapp_inbox.name',
      detailKey: 'capability.whatsapp_inbox.detail',
      // Measured: REAL once the webhook can be verified and messages sealed. Replies from the inbox are
      // a further step (a Cloud API token); without it the team answers from the phone app.
      state: whatsappAvailability().receive ? 'REAL' : 'REQUIRES_CONFIGURATION',
      group: 'integration',
      blockedBy: whatsappAvailability().receive
        ? whatsappAvailability().reply
          ? undefined
          : 'Receiving works. Replying from the inbox also needs WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID; until then the team replies from the WhatsApp Business app.'
        : `Set ${whatsappAvailability().missing.join(', ')}, then give Dualhook the webhook address and verify token (CONFIGURATION.md, "WhatsApp").`,
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
      /*
       * Never REAL today, whatever GEOIP_PROVIDER says: no provider is
       * integrated, and its only values ("none", "unconfigured") look nothing
       * up. It used to read REAL for "none" — a setting standing in for an
       * implementation, which is exactly what this register exists to stop.
       */
      state: 'REQUIRES_CONFIGURATION',
      group: 'integration',
      blockedBy:
        'Not built: no IP-to-place provider is integrated (GEOIP_PROVIDER takes only "none" or "unconfigured", and neither looks anything up). Location is chosen by hand or with the browser\'s explicit permission — a degraded start, not a broken one. Building it needs a provider (a local IP-to-city database or an API), consent wording, and a rule to keep nothing: look up, suggest a country or city, discard.',
    },
  ];

  for (const provider of listProviderAvailability()) {
    integrations.push({
      key: `payments_${provider.key}`,
      nameKey: `capability.payments.${provider.key}.name`,
      detailKey: 'capability.payments.detail',
      // Test keys make a working checkout with no real money: DEMO, not REAL.
      state: provider.available ? (provider.testMode ? 'DEMO' : 'REAL') : 'REQUIRES_CONFIGURATION',
      group: 'integration',
      blockedBy: provider.available
        ? provider.testMode
          ? 'Connected to the provider test environment: only administrators can try a purchase, with test cards. Live keys make it real.'
          : undefined
        : provider.reason,
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
  if (capability.key === 'mercadito' || capability.key === 'identity_photos') {
    const media = mediaStorageAvailability();
    return media.available ? { ...capability, state: 'REAL', blockedBy: undefined } : capability;
  }
  if (capability.key === 'two_step') {
    return twoStepAvailable() ? { ...capability, state: 'REAL', blockedBy: undefined } : capability;
  }
  if (capability.key === 'password_reset') {
    return emailCapabilityState() === 'REAL' ? { ...capability, state: 'REAL', blockedBy: undefined } : capability;
  }
  if (capability.key === 'safe_space') {
    return safeSpaceAvailable() ? { ...capability, state: 'REAL', blockedBy: undefined } : capability;
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
