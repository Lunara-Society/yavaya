import Link from 'next/link';
import type { MessageKey, Translator } from '@/i18n';
import type { ChurchCard, DevotionalView } from '@/server/domains/sanctuary/service';
import { SANCTUARY_RULES } from '@/config/business-rules';
import { SERVICE_ROWS } from './config';

/** "today at 19:00", "Sunday at 09:00" — always in the church's own time. */
export function whenText(t: Translator, next: { weekday: number; startTime: string; inDays: number }): string {
  if (next.inDays === 0) return t('sanctuary.when.today', { time: next.startTime });
  if (next.inDays === 1) return t('sanctuary.when.tomorrow', { time: next.startTime });
  return t('sanctuary.when.day', { day: t(`sanctuary.weekday.${next.weekday}` as MessageKey), time: next.startTime });
}

/** A calendar date, written for the reader without shifting it a day by timezone. */
export function dateText(isoDate: string, locale: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

export function ChurchRow({ church, t }: { church: ChurchCard; t: Translator }) {
  return (
    <Link className="sc-church" href={`/sanctuary/churches/${church.id}`}>
      <span className="sc-church-seal" aria-hidden="true">
        ✝
      </span>
      <span className="sc-church-text">
        <strong>{church.name}</strong>
        <span className="muted">
          {church.denomination ? `${church.denomination} · ` : ''}
          {church.placeName}
        </span>
        {church.next ? <span className="sc-next">{t('sanctuary.next', { when: whenText(t, church.next) })}</span> : null}
      </span>
    </Link>
  );
}

export function WordCard({ word, t, locale, full = false }: { word: DevotionalView; t: Translator; locale: string; full?: boolean }) {
  const signed = t('sanctuary.devotional.signed', { church: '\u0000' }).split('\u0000');
  return (
    <article className={full ? 'sc-word sc-word-full' : 'sc-word'}>
      <div className="sc-word-head">
        {word.isToday ? <span className="sc-today">{t('sanctuary.today.badge')}</span> : <span className="sc-date">{dateText(word.forDate, locale)}</span>}
        {word.scripture ? <span className="sc-scripture">{word.scripture}</span> : null}
      </div>
      <h3 className="sc-word-title">{full ? word.title : <Link href={`/sanctuary/words/${word.id}`}>{word.title}</Link>}</h3>
      <p className={full ? 'sc-word-body' : 'sc-word-body cm-clamp'}>{word.body}</p>
      <p className="sc-signed">
        {/* The sentence is translated whole; the church's name is linked inside it. */}
        {signed[0]}
        <Link href={`/sanctuary/churches/${word.church.id}`}>{word.church.name}</Link>
        {signed[1]}
        <span className="muted"> · {word.church.placeName}</span>
      </p>
      {!full ? (
        <Link className="sc-read" href={`/sanctuary/words/${word.id}`}>
          {t('sanctuary.read')} →
        </Link>
      ) : null}
    </article>
  );
}

type CountryOptions = Array<{ code: string; name: string; places: Array<{ id: string; label: string }> }>;
type ChurchValues = {
  name: string;
  denomination: string | null;
  description: string;
  locationId: string;
  address: string | null;
  whatsappE164: string | null;
  streamUrl: string | null;
  services: Array<{ weekday: number; startTime: string; title: string }>;
};

/** The church form: registration and editing. Plain HTML, no JavaScript. */
export function ChurchForm({
  t,
  countries,
  action,
  churchId,
  initial,
}: {
  t: Translator;
  countries: CountryOptions;
  action: (formData: FormData) => Promise<void>;
  churchId?: string;
  initial?: ChurchValues;
}) {
  const R = SANCTUARY_RULES;
  const rows = Array.from({ length: SERVICE_ROWS }, (_, i) => initial?.services[i] ?? null);
  return (
    <form action={action} className="mk-form">
      {churchId ? <input type="hidden" name="churchId" value={churchId} /> : null}
      <label>
        {t('sanctuary.form.name')}
        <input name="name" required minLength={R.nameMinLength} maxLength={R.nameMaxLength} defaultValue={initial?.name} />
      </label>
      <label>
        {t('sanctuary.form.denomination')}
        <input name="denomination" maxLength={R.denominationMaxLength} defaultValue={initial?.denomination ?? ''} />
        <span className="muted sc-hint">{t('sanctuary.form.denomination_hint')}</span>
      </label>
      <label>
        {t('sanctuary.form.description')}
        <textarea name="description" required minLength={R.descriptionMinLength} maxLength={R.descriptionMaxLength} style={{ minHeight: 130 }} defaultValue={initial?.description} />
        <span className="muted sc-hint">{t('sanctuary.form.description_hint', { min: R.descriptionMinLength, max: R.descriptionMaxLength })}</span>
      </label>
      <div className="sc-two">
        <label>
          {t('sanctuary.form.place')}
          <select name="locationId" required defaultValue={initial?.locationId ?? ''}>
            <option value="" disabled>
              {t('mercadito.form.choose')}
            </option>
            {countries.map((country) => (
              <optgroup key={country.code} label={country.name}>
                {country.places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          {t('sanctuary.form.address')}
          <input name="address" maxLength={R.addressMaxLength} defaultValue={initial?.address ?? ''} />
        </label>
      </div>
      <div className="sc-two">
        <label>
          {t('sanctuary.form.whatsapp')}
          <input name="whatsapp" type="tel" inputMode="tel" placeholder="+502 5555 1234" defaultValue={initial?.whatsappE164 ?? ''} />
          <span className="muted sc-hint">{t('sanctuary.form.whatsapp_hint')}</span>
        </label>
        <label>
          {t('sanctuary.form.stream')}
          <input name="streamUrl" type="url" inputMode="url" placeholder="https://" defaultValue={initial?.streamUrl ?? ''} />
          <span className="muted sc-hint">{t('sanctuary.form.stream_hint')}</span>
        </label>
      </div>

      <fieldset className="sc-services">
        <legend>{t('sanctuary.form.services')}</legend>
        <p className="muted sc-hint">{t('sanctuary.form.services_hint')}</p>
        <div className="sc-service-head" aria-hidden="true">
          <span>{t('sanctuary.form.service_day')}</span>
          <span>{t('sanctuary.form.service_time')}</span>
          <span>{t('sanctuary.form.service_title')}</span>
        </div>
        {rows.map((row, i) => (
          <div className="sc-service-row" key={i}>
            <select name={`service_day_${i}`} defaultValue={String(row?.weekday ?? 0)} aria-label={t('sanctuary.form.service_day')}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>
                  {t(`sanctuary.weekday.${d}` as MessageKey)}
                </option>
              ))}
            </select>
            <input name={`service_time_${i}`} type="time" defaultValue={row?.startTime ?? ''} aria-label={t('sanctuary.form.service_time')} />
            <input
              name={`service_title_${i}`}
              maxLength={R.serviceTitleMaxLength}
              placeholder={i === 0 ? t('sanctuary.form.service_title_ph') : ''}
              defaultValue={row?.title ?? ''}
              aria-label={t('sanctuary.form.service_title')}
            />
          </div>
        ))}
      </fieldset>

      {churchId ? <p className="mk-banner">{t('sanctuary.form.rereview_note')}</p> : null}
      <div className="btn-row">
        <button className="btn btn-gold" type="submit">
          {churchId ? t('sanctuary.form.submit_edit') : t('sanctuary.form.submit_new')}
        </button>
      </div>
    </form>
  );
}
