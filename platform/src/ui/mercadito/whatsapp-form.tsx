import type { Translator } from '@/i18n';
import { saveWhatsappAction } from '@/app/mercadito/actions';

/** Where a seller sets the number buyers reach them on. Plain form, no JavaScript. */
export function WhatsappForm({
  t,
  current,
  back,
  invalid,
}: {
  t: Translator;
  current: string | null;
  back: string;
  invalid: boolean;
}) {
  return (
    <section className="card">
      <h2 style={{ fontSize: '1.1rem', marginBottom: 6 }}>{t('mercadito.whatsapp.title')}</h2>
      <p className="muted">{t('mercadito.whatsapp.hint')}</p>
      {current ? (
        <p>{t('mercadito.whatsapp.current', { phone: current })}</p>
      ) : (
        <p className="mk-banner">{t('mercadito.whatsapp.missing')}</p>
      )}
      {invalid ? <p className="mk-error">{t('mercadito.error.whatsapp')}</p> : null}
      <form action={saveWhatsappAction} className="mk-form" style={{ marginTop: 10 }}>
        <input type="hidden" name="back" value={back} />
        <label>
          {t('mercadito.whatsapp.field')}
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder={t('mercadito.whatsapp.placeholder')} required />
        </label>
        <div className="btn-row">
          <button className="btn btn-line" type="submit">
            {t('mercadito.whatsapp.save')}
          </button>
        </div>
      </form>
      {current ? (
        <form action={saveWhatsappAction} style={{ marginTop: 10 }}>
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="remove" value="1" />
          <button className="btn btn-line" type="submit">
            {t('mercadito.whatsapp.remove')}
          </button>
        </form>
      ) : null}
    </section>
  );
}
