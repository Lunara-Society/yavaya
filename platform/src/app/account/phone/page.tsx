import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { siteContext } from "@/ui/site/context";
import { SiteShell } from "@/ui/site/site-shell";
import { VERIFICATION_RULES } from "@/config/business-rules";
import { phoneState } from "@/server/domains/identity/phone/service";
import { phoneVerifierAvailability } from "@/server/domains/identity/phone/verifier";
import { getWhatsapp } from "@/server/domains/mercadito/service";
import type { MessageKey } from "@/i18n";
import {
  confirmPhoneCodeAction,
  sendPhoneCodeAction,
  useVerifiedForWhatsappAction,
} from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t("phone.title"), robots: { index: false } };
}

const ERRORS = [
  "invalid_number",
  "blocked",
  "delivery_failed",
  "cooldown",
  "daily_limit",
  "already_verified",
  "unavailable",
  "rate_limited",
  "no_challenge",
  "expired",
  "too_many_attempts",
  "mismatch",
  "failed",
  "format",
] as const;

/**
 * Phone verification.
 *
 * When no SMS provider is configured the page says so and offers no form: a
 * "send code" button that sends nothing is the control this codebase refuses
 * to render.
 */
export default async function PhonePage({
  searchParams,
}: {
  searchParams: Promise<{
    sent?: string;
    error?: string;
    verified?: string;
    whatsapp?: string;
  }>;
}) {
  const query = await searchParams;
  const { c, t, language, theme, member, userId } = await siteContext();
  if (!userId) redirect("/login");

  const [state, whatsapp] = await Promise.all([
    phoneState(db(), userId),
    getWhatsapp(db(), userId),
  ]);
  const availability = phoneVerifierAvailability();
  const usable = availability.available;
  const developmentOnly =
    availability.available && availability.provider === "console";

  const error = (ERRORS as readonly string[]).includes(query.error ?? "")
    ? query.error
    : null;
  const awaitingCode = usable && query.sent === "1" && state.pending !== null;
  const verified = state.verifiedAt !== null && state.phoneE164 !== null;
  const whatsappDiffers =
    verified && whatsapp !== null && whatsapp !== state.phoneE164;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <section className="mk-head">
        <div className="wrap">
          <p className="eyebrow">
            <Link href="/account">{t("nav.member_area")}</Link>
          </p>
          <h1>{t("phone.title")}</h1>
          <p className="muted" style={{ maxWidth: 640 }}>
            {t("phone.subtitle")}
          </p>
        </div>
      </section>

      <div className="wrap">
        <div className="ph-page">
          <section className="card ph-status">
            {verified ? (
              <p className="ph-verified">
                <span aria-hidden="true" className="ph-seal">
                  ✓
                </span>
                <span>
                  <strong>{t("phone.verified_label")}</strong>
                  <span className="ph-number">{state.phoneE164}</span>
                </span>
              </p>
            ) : (
              <p className="muted">{t("phone.not_verified")}</p>
            )}
            {query.verified === "1" ? (
              <p className="mk-banner">{t("phone.done")}</p>
            ) : null}
            {query.whatsapp === "1" ? (
              <p className="mk-banner">{t("phone.whatsapp_updated")}</p>
            ) : null}
            {whatsappDiffers ? (
              <div className="ph-note">
                <p>
                  {t("phone.whatsapp_differs", { whatsapp: whatsapp ?? "" })}
                </p>
                <form action={useVerifiedForWhatsappAction}>
                  <button className="btn btn-line" type="submit">
                    {t("phone.use_for_whatsapp")}
                  </button>
                </form>
              </div>
            ) : null}
          </section>

          {!usable ? (
            <p className="mk-banner ph-unavailable">{t("phone.unavailable")}</p>
          ) : (
            <>
              {developmentOnly ? (
                <p className="mk-error">{t("phone.console")}</p>
              ) : null}
              {error ? (
                <p className="mk-error">
                  {t(`phone.error.${error}` as MessageKey)}
                </p>
              ) : null}

              {awaitingCode && state.pending ? (
                <section className="card">
                  <h2 className="ph-h">{t("phone.code_title")}</h2>
                  <p>
                    {t("phone.sent", {
                      phone: state.pending.target,
                      minutes: VERIFICATION_RULES.phoneCodeTtlMinutes,
                    })}
                  </p>
                  <form action={confirmPhoneCodeAction} className="mk-form">
                    <label>
                      {t("phone.code")}
                      <input
                        name="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]*"
                        maxLength={6}
                        required
                        autoFocus
                        className="ph-code"
                      />
                    </label>
                    <div className="btn-row">
                      <button className="btn btn-gold" type="submit">
                        {t("phone.confirm")}
                      </button>
                      <Link className="btn btn-line" href="/account/phone">
                        {t("phone.start_over")}
                      </Link>
                    </div>
                  </form>
                </section>
              ) : (
                <section className="card">
                  <h2 className="ph-h">
                    {verified ? t("phone.change") : t("phone.start")}
                  </h2>
                  <form action={sendPhoneCodeAction} className="mk-form">
                    <label>
                      {t("phone.field")}
                      <input
                        name="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder={t("phone.placeholder")}
                        defaultValue={verified ? "" : (whatsapp ?? "")}
                        required
                      />
                    </label>
                    <p className="muted" style={{ fontSize: "0.9rem" }}>
                      {t("phone.field_hint")}
                    </p>
                    <div className="btn-row">
                      <button className="btn btn-gold" type="submit">
                        {t("phone.send")}
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
