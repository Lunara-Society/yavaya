import type { MessageKey, Translator } from '@/i18n';
import { SAFE_SPACE_REPORT_CATEGORIES } from '@/config/safe-space';
import { SAFE_SPACE_RULES } from '@/config/business-rules';
import { reportAction } from './actions';

/** Reporting is the one way a guardian reads a message: so it is her choice, and says so. */
export function ReportForm({ t, source, messageId, from }: { t: Translator; source: 'room' | 'thread'; messageId: string; from: string }) {
  return (
    <details className="vt-report">
      <summary>{t('violeta.report.title')}</summary>
      <form action={reportAction} className="mk-form">
        <input type="hidden" name="source" value={source} />
        <input type="hidden" name="messageId" value={messageId} />
        <input type="hidden" name="from" value={from} />
        <p className="hint">{t('violeta.report.explain')}</p>
        <select name="category" required defaultValue="">
          <option value="" disabled>
            {t('violeta.report.choose')}
          </option>
          {SAFE_SPACE_REPORT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {t(`violeta.report.category.${category}` as MessageKey)}
            </option>
          ))}
        </select>
        <textarea name="note" maxLength={SAFE_SPACE_RULES.reportNoteMaxLength} placeholder={t('violeta.report.note')} />
        <button className="btn btn-line" type="submit">
          {t('violeta.report.submit')}
        </button>
      </form>
    </details>
  );
}
