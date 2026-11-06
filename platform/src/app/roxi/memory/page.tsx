import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { db } from '@/server/db/client';
import { AppShell } from '@/ui/components/app-shell';
import { shellContext } from '@/ui/shell-context';
import { signInPath } from '@/server/auth/sign-in-path';
import { ROXI_PLANS } from '@/config/business-rules';
import { currentPlan } from '@/server/domains/roxi/credits';
import { itemsAvailable, listItems, type ItemView } from '@/server/domains/roxi/items';
import { LocalTimeFields } from '@/ui/roxi/local-time';
import { addItemAction, deleteItemAction, forgetAllAction, progressItemAction, toggleItemAction } from '../actions';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('roxi.memory.title') };
}
export const dynamic = 'force-dynamic';

/**
 * Everything Roxi keeps for the member, in one place: goals, the day's
 * tasks, reminders, good moments and things she remembers. All of it can be
 * changed or deleted here, one by one or all at once. Roxi saves something
 * only after asking; this page is where the member sees that she did.
 */
export default async function RoxiMemoryPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string; limit?: string }> }) {
  const { t, locale, language, theme, member, userId } = await shellContext();
  if (!userId || !member) redirect(await signInPath());
  const query = await searchParams;
  const available = itemsAvailable();
  const plan = (await currentPlan(db(), userId)).plan;
  const limits = ROXI_PLANS[plan];
  const items = available ? await listItems(db(), userId) : [];
  const of = (kind: ItemView['kind']) => items.filter((item) => item.kind === kind);
  const goals = of('goal');
  const reminders = of('reminder');
  const recentDays = new Set(Array.from({ length: 4 }, (_, back) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)));
  const tasks = of('task').filter((task) => !task.done || (task.day && recentDays.has(task.day)));
  const moments = of('moment').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const facts = of('fact');
  const errorKey = query.error && /^(roxi\.[a-z_.]+|error\.[a-z_.]+)$/.test(query.error) ? (query.error as MessageKey) : null;
  const when = (date: Date) => date.toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const remove = (item: ItemView) => (
    <form action={deleteItemAction}>
      <input type="hidden" name="id" value={item.id} />
      <button type="submit" className="rx-icon" aria-label={t('roxi.memory.delete')} title={t('roxi.memory.delete')}>
        ×
      </button>
    </form>
  );
  const toggle = (item: ItemView) => (
    <form action={toggleItemAction}>
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="done" value={item.done ? 'no' : 'yes'} />
      <button type="submit" className={`rx-tick${item.done ? ' is-done' : ''}`} aria-pressed={item.done} aria-label={item.done ? t('roxi.memory.undo') : t('roxi.memory.mark_done')}>
        {item.done ? '✓' : ''}
      </button>
    </form>
  );

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <section className="rx-hero">
        <p className="rx-eyebrow">
          <a href="/roxi">{t('roxi.plans.title')}</a>
        </p>
        <h1 className="rx-title">{t('roxi.memory.title')}</h1>
        <p className="rx-lead">{t('roxi.memory.lead')}</p>
      </section>

      {!available ? <p className="rx-banner is-warn">{t('roxi.memory.unavailable')}</p> : null}
      {query.done === 'forgotten' ? <p className="rx-banner" role="status">{t('roxi.memory.forgotten')}</p> : null}
      {errorKey ? <p className="rx-banner is-warn" role="alert">{t(errorKey, { limit: Number(query.limit) || 0 })}</p> : null}

      {available ? (
        <>
          <section className="rx-section" id="goal">
            <h2>{t('roxi.memory.goals')}</h2>
            <p className="rx-small">{t('roxi.memory.goals_lead', { n: limits.goals })}</p>
            <ul className="rx-items">
              {goals.map((goal) => {
                const share = goal.target ? Math.min(100, Math.round(((goal.progress ?? 0) / goal.target) * 100)) : null;
                return (
                  <li key={goal.id} id={`item-${goal.id}`} className={goal.done ? 'is-done' : undefined}>
                    {toggle(goal)}
                    <div className="rx-item-body">
                      <p className="rx-item-title">{goal.title}</p>
                      {goal.detail ? <p className="rx-small">{goal.detail}</p> : null}
                      {goal.target ? (
                        <>
                          <div className="rx-meter" role="img" aria-label={t('roxi.memory.progress', { done: goal.progress ?? 0, target: goal.target })}>
                            <span style={{ width: `${share}%` }} />
                          </div>
                          <form action={progressItemAction} className="rx-inline">
                            <input type="hidden" name="id" value={goal.id} />
                            <label>
                              <span className="sr-only">{t('roxi.memory.progress_label')}</span>
                              <input name="progress" inputMode="decimal" defaultValue={goal.progress ?? 0} size={8} />
                            </label>
                            <span className="rx-small">/ {goal.target.toLocaleString(locale)}</span>
                            <button type="submit" className="rx-line">{t('roxi.memory.save')}</button>
                          </form>
                        </>
                      ) : null}
                    </div>
                    {remove(goal)}
                  </li>
                );
              })}
            </ul>
            <form action={addItemAction} className="rx-form rx-add">
              <input type="hidden" name="kind" value="goal" />
              <label>
                <span>{t('roxi.memory.goal_title')}</span>
                <input name="title" required maxLength={160} placeholder={t('roxi.memory.goal_hint')} />
              </label>
              <label>
                <span>{t('roxi.memory.goal_target')}</span>
                <input name="target" inputMode="decimal" maxLength={14} />
              </label>
              <button type="submit" className="rx-line">{t('roxi.memory.add')}</button>
            </form>
          </section>

          <section className="rx-section" id="task">
            <h2>{t('roxi.memory.today')}</h2>
            <p className="rx-small">{t('roxi.memory.today_lead')}</p>
            <ul className="rx-items">
              {tasks.map((task) => (
                <li key={task.id} id={`item-${task.id}`} className={task.done ? 'is-done' : undefined}>
                  {toggle(task)}
                  <div className="rx-item-body">
                    <p className="rx-item-title">{task.title}</p>
                    {task.day ? <p className="rx-small">{new Date(`${task.day}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })}</p> : null}
                  </div>
                  {remove(task)}
                </li>
              ))}
            </ul>
            <form action={addItemAction} className="rx-form rx-add">
              <input type="hidden" name="kind" value="task" />
              <LocalTimeFields />
              <label>
                <span>{t('roxi.memory.task_title')}</span>
                <input name="title" required maxLength={160} placeholder={t('roxi.memory.task_hint')} />
              </label>
              <button type="submit" className="rx-line">{t('roxi.memory.add')}</button>
            </form>
          </section>

          <section className="rx-section" id="reminder">
            <h2>{t('roxi.memory.reminders')}</h2>
            <p className="rx-small">{t(limits.recurringReminders ? 'roxi.memory.reminders_lead_repeat' : 'roxi.memory.reminders_lead', { n: limits.reminders })}</p>
            <ul className="rx-items">
              {reminders.map((reminder) => (
                <li key={reminder.id} id={`item-${reminder.id}`} className={reminder.done ? 'is-done' : undefined}>
                  {toggle(reminder)}
                  <div className="rx-item-body">
                    <p className="rx-item-title">{reminder.title}</p>
                    <p className="rx-small">
                      {reminder.dueAt ? when(reminder.dueAt) : ''}
                      {reminder.repeat !== 'none' ? ` · ${t(`roxi.memory.repeat.${reminder.repeat}` as MessageKey)}` : ''}
                      {reminder.action ? ` · ${reminder.action}` : ''}
                    </p>
                  </div>
                  {remove(reminder)}
                </li>
              ))}
            </ul>
            <form action={addItemAction} className="rx-form rx-add">
              <input type="hidden" name="kind" value="reminder" />
              <LocalTimeFields />
              <label>
                <span>{t('roxi.memory.reminder_title')}</span>
                <input name="title" required maxLength={160} placeholder={t('roxi.memory.reminder_hint')} />
              </label>
              <div className="rx-form-row">
                <label>
                  <span>{t('roxi.memory.reminder_when')}</span>
                  <input name="due" type="datetime-local" required />
                </label>
                <label>
                  <span>{t('roxi.memory.reminder_repeat')}</span>
                  <select name="repeat" defaultValue="none">
                    <option value="none">{t('roxi.memory.repeat.none')}</option>
                    {limits.recurringReminders ? (
                      <>
                        <option value="weekly">{t('roxi.memory.repeat.weekly')}</option>
                        <option value="monthly">{t('roxi.memory.repeat.monthly')}</option>
                        <option value="yearly">{t('roxi.memory.repeat.yearly')}</option>
                      </>
                    ) : null}
                  </select>
                </label>
              </div>
              <button type="submit" className="rx-line">{t('roxi.memory.add')}</button>
            </form>
          </section>

          <section className="rx-section" id="moment">
            <h2>{t('roxi.memory.moments')}</h2>
            <p className="rx-small">{t('roxi.memory.moments_lead')}</p>
            <ul className="rx-items">
              {moments.map((moment) => (
                <li key={moment.id} id={`item-${moment.id}`}>
                  <span className="rx-dot" aria-hidden="true">✦</span>
                  <div className="rx-item-body">
                    <p className="rx-item-title">{moment.title}</p>
                    <p className="rx-small">{moment.createdAt.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                  {remove(moment)}
                </li>
              ))}
            </ul>
            <form action={addItemAction} className="rx-form rx-add">
              <input type="hidden" name="kind" value="moment" />
              <label>
                <span>{t('roxi.memory.moment_title')}</span>
                <input name="title" required maxLength={160} placeholder={t('roxi.memory.moment_hint')} />
              </label>
              <button type="submit" className="rx-line">{t('roxi.memory.add')}</button>
            </form>
          </section>

          <section className="rx-section" id="fact">
            <h2>{t('roxi.memory.facts')}</h2>
            <p className="rx-small">{t('roxi.memory.facts_lead')}</p>
            <ul className="rx-items">
              {facts.map((fact) => (
                <li key={fact.id} id={`item-${fact.id}`}>
                  <span className="rx-dot" aria-hidden="true">•</span>
                  <div className="rx-item-body">
                    <p className="rx-item-title">{fact.title}</p>
                  </div>
                  {remove(fact)}
                </li>
              ))}
            </ul>
            <form action={addItemAction} className="rx-form rx-add">
              <input type="hidden" name="kind" value="fact" />
              <label>
                <span>{t('roxi.memory.fact_title')}</span>
                <input name="title" required maxLength={160} placeholder={t('roxi.memory.fact_hint')} />
              </label>
              <button type="submit" className="rx-line">{t('roxi.memory.add')}</button>
            </form>
          </section>

          <section className="rx-section">
            <h2>{t('roxi.memory.forget_title')}</h2>
            <form action={forgetAllAction} className="rx-cancel">
              <p className="rx-small">{t('roxi.memory.forget_lead')}</p>
              <label className="rx-check">
                <input type="checkbox" name="confirm" value="yes" required /> {t('roxi.memory.forget_confirm')}
              </label>
              <button type="submit" className="rx-line">{t('roxi.memory.forget')}</button>
            </form>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
