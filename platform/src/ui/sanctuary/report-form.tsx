import type { MessageKey, Translator } from '@/i18n';
import { SANCTUARY_REPORT_CATEGORIES } from '@/server/domains/sanctuary/service';
import { reportChurchAction } from '@/app/sanctuary/actions';

/** Report a church, or one of its words. Reports collect under one ticket per church. */
export function ReportForm({ churchId, devotionalId, t }: { churchId: string; devotionalId?: string; t: Translator }) {
  return (
    <form action={reportChurchAction} className="mk-form" style={{ marginTop: 12 }}>
      <input type="hidden" name="churchId" value={churchId} />
      {devotionalId ? <input type="hidden" name="devotionalId" value={devotionalId} /> : null}
      <label>
        {t('sanctuary.report.category')}
        <select name="category" required defaultValue="">
          <option value="" disabled>
            {t('mercadito.form.choose')}
          </option>
          {SANCTUARY_REPORT_CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {t(`sanctuary.report.category.${key}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('sanctuary.report.description')}
        <textarea name="details" maxLength={2000} style={{ minHeight: 80 }} />
      </label>
      <button className="btn btn-line" type="submit">
        {t('sanctuary.report.submit')}
      </button>
    </form>
  );
}
