import { shellContext } from '@/ui/shell-context';
import { SAFE_SPACE_RULES } from '@/config/business-rules';
import { ErrorNote, VioletaShell, Who } from '@/ui/violeta/parts';
import { VIOLETA_METADATA } from '../meta';
import { violetaPage } from '../guard';
import { changeHandleAction, leaveAction, presenceAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = VIOLETA_METADATA;

/** Her name here, whether she is seen, and the way out that erases everything. */
export default async function VioletaSettings({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; renamed?: string }> }) {
  const query = await searchParams;
  const { t, userId } = await shellContext();
  const { member, unread, guardian } = await violetaPage(userId);
  return (
    <VioletaShell t={t} active="settings" unread={unread} guardian={guardian}>
      <div className="cm-column">
        <h1 className="vt-title">{t('violeta.settings.title')}</h1>
        {query.saved ? <p className="mk-banner" role="status">{t('violeta.settings.saved')}</p> : null}
        {query.renamed ? <p className="mk-banner" role="status">{t('violeta.settings.renamed', { name: member.handle })}</p> : null}
        <ErrorNote t={t} error={query.error} />

        <section className="vt-section">
          <h2 className="vt-h">{t('violeta.settings.name_title')}</h2>
          <p>
            <Who t={t} handle={member.handle} kind={member.kind} profession={member.profession} />
          </p>
          <p className="muted">{t('violeta.settings.name_text')}</p>
          <form action={changeHandleAction}>
            <button className="btn btn-line" type="submit">
              {t('violeta.settings.rename')}
            </button>
            <p className="hint muted">{t('violeta.settings.rename_hint', { days: SAFE_SPACE_RULES.handleChangeCooldownDays })}</p>
          </form>
        </section>

        <section className="vt-section">
          <h2 className="vt-h">{t('violeta.settings.presence_title')}</h2>
          <p className="muted">{t(member.showPresence ? 'violeta.settings.presence_on' : 'violeta.settings.presence_off')}</p>
          <form action={presenceAction}>
            <input type="hidden" name="visible" value={member.showPresence ? '0' : '1'} />
            <button className="btn btn-line" type="submit">
              {t(member.showPresence ? 'violeta.settings.hide' : 'violeta.settings.show')}
            </button>
          </form>
        </section>

        <section className="vt-section">
          <h2 className="vt-h">{t('violeta.settings.device_title')}</h2>
          <ul className="vt-list muted">
            <li>{t('violeta.settings.device_history')}</li>
            <li>{t('violeta.settings.device_exit')}</li>
            <li>{t('violeta.settings.device_shared')}</li>
          </ul>
        </section>

        <section className="vt-section vt-danger-zone">
          <h2 className="vt-h">{t('violeta.settings.leave_title')}</h2>
          <p className="muted">{t('violeta.settings.leave_text')}</p>
          <form action={leaveAction} className="mk-form">
            <label>
              <span>
                <input type="checkbox" name="confirm" required /> {t('violeta.settings.leave_confirm')}
              </span>
            </label>
            <button className="btn btn-line" type="submit">
              {t('violeta.settings.leave')}
            </button>
          </form>
        </section>
      </div>
    </VioletaShell>
  );
}
