import Link from 'next/link';
import type { Locale, Translator } from '@/i18n';
import { GUIDE_PUBLISHED, GUIDE_SECONDS, guideDuration, guideFiles, type GuideKey } from '@/config/guide';
import { siteUrl } from '@/server/seo';
import { JsonLd } from '@/ui/site/json-ld';

/**
 * A district's own film, at the top of its page, with a line inviting a play.
 *
 * Nothing loads until someone presses play (`preload="none"`): the poster is a
 * small image and the video streams in ranges. Touch screens get the 720p
 * file, which is kinder to a phone's data plan.
 */
export function GuideVideo({ guideKey, title, t, locale, note }: { guideKey: GuideKey; title: string; t: Translator; locale: Locale; note?: string }) {
  const minutes = Math.ceil(GUIDE_SECONDS[guideKey] / 60);
  return (
    <section className="gv" aria-label={title}>
      <GuideVideoJsonLd guideKey={guideKey} name={title} description={t('guide.video_description', { name: title })} />
      <div className="gv-media">
        <GuidePlayer guideKey={guideKey} t={t} locale={locale} />
      </div>
      <div className="gv-text">
        <p className="eyebrow">
          {t('guide.eyebrow')} · {t('guide.minutes', { minutes })}
        </p>
        <h2>{title}</h2>
        <p className="gv-hint">
          <span className="gv-play" aria-hidden="true">▶</span> {t('guide.watch_hint', { minutes })}
        </p>
        <p className="muted gv-note">{t('guide.spoken')}</p>
        {note ? <p className="muted gv-note">{note}</p> : null}
        <p>
          <Link className="gv-link" href="/guia">
            {t('guide.full_link')} →
          </Link>
        </p>
      </div>
    </section>
  );
}

/**
 * The video element itself, shared with the full guide page.
 *
 * The narration is Spanish, so Spanish captions stay off unless asked for,
 * while someone reading the site in English gets English subtitles from the
 * first word.
 */
export function GuidePlayer({ guideKey, t, locale, id }: { guideKey: GuideKey; t: Translator; locale: Locale; id?: string }) {
  const files = guideFiles(guideKey);
  return (
    <video id={id} className="gv-video" controls preload="none" playsInline poster={files.poster}>
      <source src={files.sd} type="video/mp4" media="(pointer: coarse)" />
      <source src={files.hd} type="video/mp4" />
      <track kind="captions" srcLang="es" label={t('guide.captions')} src={files.captions} />
      <track kind="subtitles" srcLang="en" label={t('guide.captions_en')} src={files.subtitlesEn} default={locale === 'en'} />
      {t('guide.unsupported')}
    </video>
  );
}

/** schema.org VideoObject, so search engines can list the film with its page. */
export function GuideVideoJsonLd({ guideKey, name, description }: { guideKey: GuideKey; name: string; description: string }) {
  const base = siteUrl();
  const files = guideFiles(guideKey);
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name,
        description,
        thumbnailUrl: [`${base}${files.poster}`],
        uploadDate: GUIDE_PUBLISHED,
        duration: guideDuration(guideKey),
        contentUrl: `${base}${files.hd}`,
        inLanguage: 'es',
      }}
    />
  );
}
