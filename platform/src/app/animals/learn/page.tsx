import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { ANIMALS_RULES } from '@/config/business-rules';
import { GUIDE_SECTIONS, QUIZ } from '@/config/animals';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { formatDate } from '@/ui/mercadito/format';
import { getCertificate } from '@/server/domains/animals/service';
import { quizAction } from '../actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('animals.learn.title'), description: t('animals.learn.lead') };
}

const OPTIONS = ['a', 'b', 'c'] as const;

/**
 * The welfare guide and its quiz. Public to read — everyone should know how
 * to care for an animal — and the quiz, for members, grants the certificate
 * an adoption requires. After answering, every question is explained.
 */
export default async function LearnPage({ searchParams }: { searchParams: Promise<{ score?: string; wrong?: string; next?: string; error?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const certificate = userId ? await getCertificate(db(), userId) : null;
  const score = query.score !== undefined ? Number.parseInt(query.score, 10) : null;
  const wrong = new Set((query.wrong ?? '').split(',').map((v) => Number.parseInt(v, 10)).filter(Number.isInteger));
  const answered = score !== null && Number.isInteger(score);
  const passed = answered && score >= ANIMALS_RULES.quizPassMark;
  const next = query.next && /^[0-9a-f-]{36}$/i.test(query.next) ? query.next : null;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="animals" tone="animals">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/animals">← {t('animals.back')}</Link>
        </p>
        <p className="eyebrow">{c.districts.animals.name}</p>
        <h1 className="h-md">{t('animals.learn.title')}</h1>
        <p className="lead">{t('animals.learn.lead')}</p>
        {certificate ? (
          <p className="an-certificate" role="status">
            ✓ {t('animals.learn.have_certificate', { date: formatDate(certificate.passedAt, locale) })}
          </p>
        ) : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}

        <div className="an-guide">
          {GUIDE_SECTIONS.map((section, index) => (
            <section key={section} className="an-guide-section">
              <h2>
                <span className="an-num">{index + 1}</span> {t(`animals.guide.${section}.title` as MessageKey)}
              </h2>
              <p>{t(`animals.guide.${section}.text` as MessageKey)}</p>
            </section>
          ))}
        </div>

        <section id="result" className="sc-section">
          <h2 className="sc-h">{t('animals.quiz.title')}</h2>
          <p className="muted">{t('animals.quiz.lead', { pass: ANIMALS_RULES.quizPassMark, total: QUIZ.length })}</p>
          {answered ? (
            <div className={passed ? 'an-result pass' : 'an-result'} role="status">
              <strong>{t('animals.quiz.score', { score, total: QUIZ.length })}</strong>{' '}
              {passed ? t('animals.quiz.passed') : t('animals.quiz.failed', { pass: ANIMALS_RULES.quizPassMark })}
              {passed && next ? (
                <p className="mb0" style={{ marginTop: 10 }}>
                  <Link className="btn btn-gold" href={`/animals/${next}/apply`}>
                    {t('animals.quiz.continue')}
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}

          {answered ? (
            <ol className="an-answers">
              {QUIZ.map((question) => (
                <li key={question.id} className={wrong.has(question.id) ? 'wrong' : 'right'}>
                  <strong>{t(`animals.quiz.${question.id}.q` as MessageKey)}</strong>
                  <span>
                    {wrong.has(question.id) ? '✗ ' : '✓ '}
                    {t('animals.quiz.correct_is', { answer: t(`animals.quiz.${question.id}.${OPTIONS[question.correct]}` as MessageKey) })}
                  </span>
                  <span className="muted">{t(`animals.quiz.${question.id}.why` as MessageKey)}</span>
                </li>
              ))}
            </ol>
          ) : null}

          {!member ? (
            <div className="cm-gate card">
              <p>{t('animals.quiz.sign_in')}</p>
              <Link className="btn btn-gold" href="/login">
                {t('community.square.sign_in')}
              </Link>
            </div>
          ) : !answered || !passed ? (
            <form action={quizAction} className="an-quiz">
              {next ? <input type="hidden" name="next" value={next} /> : null}
              {QUIZ.map((question, index) => (
                <fieldset key={question.id}>
                  <legend>
                    {index + 1}. {t(`animals.quiz.${question.id}.q` as MessageKey)}
                  </legend>
                  {OPTIONS.map((option, value) => (
                    <label key={option}>
                      <input type="radio" name={`q${question.id}`} value={value} required /> {t(`animals.quiz.${question.id}.${option}` as MessageKey)}
                    </label>
                  ))}
                </fieldset>
              ))}
              <button className="btn btn-gold" type="submit">
                {answered ? t('animals.quiz.retry') : t('animals.quiz.submit')}
              </button>
            </form>
          ) : null}
        </section>
      </div>
    </SiteShell>
  );
}
