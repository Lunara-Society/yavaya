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
import { addCapsuleAction, addItemAction, addMilestoneAction, addMissionAction, addWatchAction, deleteItemAction, forgetAllAction, progressItemAction, snoozeAction, stepAction, toggleItemAction } from '../actions';
import { lifePath, memberClock } from '@/server/domains/roxi/world';
import { inMemberZone, memberDay } from '@/ui/roxi/member-time';

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
  const { currency: homeCurrency, timeZone } = await memberClock(db(), userId);
  const items = available ? await listItems(db(), userId) : [];
  const of = (kind: ItemView['kind']) => items.filter((item) => item.kind === kind);
  const goals = of('goal');
  const reminders = of('reminder');
  const recentDays = new Set(Array.from({ length: 4 }, (_, back) => memberDay(new Date(Date.now() - back * 86_400_000), timeZone)));
  const tasks = of('task').filter((task) => !task.done || (task.day && recentDays.has(task.day)));
  const moments = of('moment').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const facts = of('fact');
  const watches = of('watch');
  const missions = of('mission');
  const capsules = of('capsule');
  const path = available ? await lifePath(db(), userId) : [];
  const pathYears = [...new Set(path.map((entry) => entry.day.slice(0, 4)))];
  const errorKey = query.error && /^(roxi\.[a-z_.]+|error\.[a-z_.]+)$/.test(query.error) ? (query.error as MessageKey) : null;
  const when = (date: Date) => inMemberZone(date, locale, timeZone, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

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
                    {!reminder.done ? (
                      <form action={snoozeAction} className="rx-inline">
                        <input type="hidden" name="id" value={reminder.id} />
                        <input type="hidden" name="hours" value="24" />
                        <button type="submit" className="rx-line">{t('roxi.memory.snooze')}</button>
                      </form>
                    ) : null}
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

          <section className="rx-section" id="watch">
            <h2>{t('roxi.memory.watches')}</h2>
            <p className="rx-small">{t('roxi.memory.watches_lead', { n: limits.watches })}</p>
            <ul className="rx-items">
              {watches.map((watch) => (
                <li key={watch.id} id={`item-${watch.id}`}>
                  <span className="rx-dot" aria-hidden="true">◎</span>
                  <div className="rx-item-body">
                    <p className="rx-item-title">{watch.query || t('roxi.memory.watch_any')}</p>
                    <p className="rx-small">
                      {t(watch.district === 'work' ? 'roxi.memory.watch_work' : 'roxi.memory.watch_mercadito')}
                      {watch.maxPrice ? ` · ${t('roxi.memory.watch_max', { amount: `${watch.currency ?? ''} ${watch.maxPrice.toLocaleString(locale)}` })}` : ''}
                      {watch.placeName ? ` · ${watch.placeName}` : ''}
                    </p>
                  </div>
                  {remove(watch)}
                </li>
              ))}
            </ul>
            <form action={addWatchAction} className="rx-form rx-add">
              <label>
                <span>{t('roxi.memory.watch_query')}</span>
                <input name="query" maxLength={80} placeholder={t('roxi.memory.watch_hint')} />
              </label>
              <div className="rx-form-row">
                <label>
                  <span>{t('roxi.memory.watch_where')}</span>
                  <select name="district" defaultValue="mercadito">
                    <option value="mercadito">{t('roxi.memory.watch_mercadito')}</option>
                    <option value="work">{t('roxi.memory.watch_work')}</option>
                  </select>
                </label>
                <label>
                  <span>{t('roxi.memory.watch_price')}</span>
                  <input name="max" inputMode="decimal" maxLength={14} />
                </label>
                <label>
                  <span>{t('roxi.business.field.currency')}</span>
                  <input name="currency" defaultValue={homeCurrency ?? ''} maxLength={3} />
                </label>
                <label>
                  <span>{t('roxi.memory.watch_place')}</span>
                  <input name="place" maxLength={80} />
                </label>
              </div>
              <button type="submit" className="rx-line">{t('roxi.memory.add')}</button>
            </form>
          </section>

          <section className="rx-section" id="mission">
            <h2>{t('roxi.memory.missions')}</h2>
            <p className="rx-small">{limits.missions === 0 ? t('roxi.memory.needs_pro') : t('roxi.memory.missions_lead', { n: limits.missions })}</p>
            <ul className="rx-items">
              {missions.map((mission) => (
                <li key={mission.id} id={`item-${mission.id}`} className={mission.done ? 'is-done' : undefined}>
                  <span className="rx-dot" aria-hidden="true">➤</span>
                  <div className="rx-item-body">
                    <p className="rx-item-title">{mission.title}</p>
                    {mission.target ? <p className="rx-small">{t('roxi.memory.budget', { amount: mission.target.toLocaleString(locale) })}</p> : null}
                    <ol className="rx-steps">
                      {(mission.steps ?? []).map((step, index) => (
                        <li key={index}>
                          <form action={stepAction} className="rx-inline">
                            <input type="hidden" name="id" value={mission.id} />
                            <input type="hidden" name="index" value={index} />
                            <input type="hidden" name="done" value={step.done ? 'no' : 'yes'} />
                            <button type="submit" className={`rx-tick${step.done ? ' is-done' : ''}`} aria-pressed={step.done} aria-label={step.text}>
                              {step.done ? '✓' : ''}
                            </button>
                            <span className={step.done ? 'rx-struck' : undefined}>{step.text}</span>
                          </form>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {remove(mission)}
                </li>
              ))}
            </ul>
            {limits.missions > 0 ? (
              <form action={addMissionAction} className="rx-form rx-add">
                <label>
                  <span>{t('roxi.memory.mission_title')}</span>
                  <input name="title" required maxLength={160} placeholder={t('roxi.memory.mission_hint')} />
                </label>
                <label>
                  <span>{t('roxi.memory.mission_budget')}</span>
                  <input name="budget" inputMode="decimal" maxLength={14} />
                </label>
                <label className="rx-wide">
                  <span>{t('roxi.memory.mission_steps')}</span>
                  <textarea name="steps" rows={4} maxLength={3000} placeholder={t('roxi.memory.mission_steps_hint')} />
                </label>
                <button type="submit" className="rx-line">{t('roxi.memory.add')}</button>
              </form>
            ) : null}
          </section>

          <section className="rx-section" id="capsule">
            <h2>{t('roxi.memory.capsules')}</h2>
            <p className="rx-small">{limits.capsules === 0 ? t('roxi.memory.needs_pro') : t('roxi.memory.capsules_lead')}</p>
            <ul className="rx-items">
              {capsules.map((capsule) => (
                <li key={capsule.id} id={`item-${capsule.id}`}>
                  <span className="rx-dot" aria-hidden="true">✉</span>
                  <div className="rx-item-body">
                    {capsule.sealedUntil ? (
                      <p className="rx-item-title">{t('roxi.memory.capsule_sealed', { date: capsule.sealedUntil.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}</p>
                    ) : (
                      <>
                        <p className="rx-item-title">{capsule.title}</p>
                        {capsule.detail ? <p className="rx-small">{capsule.detail}</p> : null}
                      </>
                    )}
                  </div>
                  {remove(capsule)}
                </li>
              ))}
            </ul>
            {limits.capsules > 0 ? (
              <form action={addCapsuleAction} className="rx-form rx-add">
                <label>
                  <span>{t('roxi.memory.capsule_title')}</span>
                  <input name="title" required maxLength={160} />
                </label>
                <label className="rx-wide">
                  <span>{t('roxi.memory.capsule_detail')}</span>
                  <textarea name="detail" rows={3} maxLength={600} />
                </label>
                <label>
                  <span>{t('roxi.memory.capsule_opens')}</span>
                  <input name="opens" type="date" required />
                </label>
                <button type="submit" className="rx-line">{t('roxi.memory.add')}</button>
              </form>
            ) : null}
          </section>

          <section className="rx-section" id="camino">
            <h2>{t('roxi.memory.path')}</h2>
            <p className="rx-small">{t('roxi.memory.path_lead')}</p>
            {pathYears.map((year) => (
              <div key={year} className="rx-year">
                <h3>{year}</h3>
                <ul className="rx-path">
                  {path
                    .filter((entry) => entry.day.startsWith(year))
                    .map((entry, index) => (
                      <li key={`${entry.day}-${index}`} className={`is-${entry.source}`}>
                        <span className="rx-path-day">{new Date(`${entry.day}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span>
                        <span>
                          {entry.key && entry.key !== 'goal_done' ? t(`roxi.path.${entry.key}` as MessageKey) : entry.key === 'goal_done' ? t('roxi.path.goal_done', { title: entry.text }) : entry.text}
                          <span className="rx-tag">{t(entry.source === 'yavaya' ? 'roxi.path.source_yavaya' : 'roxi.path.source_member')}</span>
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            <form action={addMilestoneAction} className="rx-form rx-add">
              <LocalTimeFields />
              <label>
                <span>{t('roxi.memory.milestone_title')}</span>
                <input name="title" required maxLength={160} placeholder={t('roxi.memory.milestone_hint')} />
              </label>
              <label>
                <span>{t('roxi.memory.milestone_when')}</span>
                <input name="when" type="date" />
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
