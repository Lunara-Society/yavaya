import Link from 'next/link';
import type { ReactNode } from 'react';
import type { SiteContent } from '@/i18n/site';
import { Icon, type IconName } from './icons';
import { Md, Paras } from './md';

/**
 * Building blocks of the public pages. Each takes its text from the site
 * content; none carries a literal sentence.
 */

export const DISTRICT_IDS = ['mercadito', 'yavayago', 'work', 'community', 'impact', 'animals'] as const;
export type DistrictId = (typeof DISTRICT_IDS)[number];

export type PageId = keyof SiteContent['nav'];

/** One URL per page. The language comes from the member's preference, not the path. */
export const PAGE_PATHS: Record<PageId, string> = {
  home: '/',
  districts: '/districts',
  mercadito: '/mercadito',
  yavayago: '/yavayago',
  work: '/work',
  community: '/community',
  impact: '/impact',
  animals: '/animals',
  trust: '/trust',
  reputation: '/reputation',
  tokens: '/tokens',
  pricing: '/pricing',
  transparency: '/transparency',
  status: '/status',
  roadmap: '/roadmap',
  about: '/about',
  help: '/help',
  privacy: '/privacy',
};

export type SiteState = keyof SiteContent['ui']['states'];

export function Badge({ c, state }: { c: SiteContent; state: SiteState }) {
  return <span className={`badge badge-${state}`}>{c.ui.states[state]}</span>;
}

export function PageHero({
  eyebrow,
  title,
  lead,
  tinted,
  badge,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  tinted?: boolean;
  badge?: ReactNode;
}) {
  return (
    <section className={`page-hero${tinted ? ' tinted' : ''}`}>
      <div className="wrap">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="lead">
          <Md text={lead} />
        </p>
        {badge ? <p className="mt mb0">{badge}</p> : null}
      </div>
    </section>
  );
}

export function SectionHead({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: string }) {
  return (
    <div className="section-head">
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
      <h2 className="h-lg">{title}</h2>
      {lead ? (
        <p className="lead">
          <Md text={lead} />
        </p>
      ) : null}
    </div>
  );
}

type CardItem = { icon?: string; title: string; text: string | readonly string[] };

export function Cards({ items, cols = 'g3', tone }: { items: readonly CardItem[]; cols?: string; tone?: boolean }) {
  return (
    <div className={`grid ${cols}`}>
      {items.map((it, i) => (
        <div key={i} className={`card${tone ? ' tone' : ''}`}>
          {it.icon ? (
            <div className="ico">
              <Icon name={it.icon as IconName} />
            </div>
          ) : null}
          <h3>{it.title}</h3>
          <Paras text={it.text} />
        </div>
      ))}
    </div>
  );
}

export function Checks({ items, cross }: { items: readonly string[]; cross?: boolean }) {
  return (
    <ul className={`list-check${cross ? ' list-x' : ''}`}>
      {items.map((item, i) => (
        <li key={i}>
          <Md text={item} />
        </li>
      ))}
    </ul>
  );
}

export function Table({ head, rows }: { head: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td key={i}>{i === 0 ? <strong><Md text={cell} /></strong> : <Md text={cell} />}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Steps({ items }: { items: readonly { title: string; text: string }[] }) {
  return (
    <ol className="steps">
      {items.map((s, i) => (
        <li key={i}>
          <strong>{s.title}</strong>
          <span>
            <Md text={s.text} />
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Note({ text }: { text: string }) {
  return (
    <div className="note">
      <Md text={text} />
    </div>
  );
}

export function DistrictStatus({ c, id }: { c: SiteContent; id: DistrictId }) {
  return (
    <>
      <Badge c={c} state="planned" /> <span className="muted">· {c.districts[id].phase}</span>
    </>
  );
}

/** A clearly marked DEMO card, showing what every listing will display. */
export function SampleCard({
  c,
  icon,
  sample,
}: {
  c: SiteContent;
  icon: string;
  sample: { title: string; meta: string; trust: readonly string[] };
}) {
  return (
    <div className="sample">
      <span className="demo-tag">{c.ui.demo}</span>
      <div className="sample-img">
        <Icon name={icon as IconName} />
      </div>
      <div className="sample-body">
        <h3>{sample.title}</h3>
        <div className="sample-meta">{sample.meta}</div>
        <ul className="trustline">
          {sample.trust.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The gateway into a district. `top` labels it above the name; `bottom` below. */
export function Gate({
  c,
  id,
  top,
  bottom,
  text,
}: {
  c: SiteContent;
  id: DistrictId;
  top?: string;
  bottom?: string;
  text?: string;
}) {
  const d = c.districts[id];
  return (
    <Link className={`gate tone-${id}`} href={PAGE_PATHS[id]}>
      <span className="gate-art">
        <Icon name={id} />
      </span>
      {top ? <span className="gate-foot">{top}</span> : null}
      <span className="gate-name">{d.name}</span>
      <span className="gate-tag">{text ?? d.tagline}</span>
      {top ? null : <span className="gate-foot">{bottom ?? `${c.ui.states.planned} · ${d.phase}`}</span>}
    </Link>
  );
}

/** Closes every district page: the shared identity, and the next district. */
export function DistrictNext({ c, id }: { c: SiteContent; id: DistrictId }) {
  const next = DISTRICT_IDS[(DISTRICT_IDS.indexOf(id) + 1) % DISTRICT_IDS.length] as DistrictId;
  return (
    <section className="section alt">
      <div className="wrap">
        <div className="split">
          <div>
            <SectionHead eyebrow={c.ui.sharedTitle} title={c.ui.sharedHead} lead={c.ui.sharedLead} />
            <div className="btn-row">
              <Link className="btn btn-line" href={PAGE_PATHS.trust}>
                {c.nav.trust}
              </Link>
              <Link className="btn btn-line" href={PAGE_PATHS.reputation}>
                {c.nav.reputation}
              </Link>
            </div>
          </div>
          <Gate c={c} id={next} top={c.ui.nextDistrict} />
        </div>
      </div>
    </section>
  );
}
