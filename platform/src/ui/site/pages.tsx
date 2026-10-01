import Link from 'next/link';
import { DistrictScene, Guilloche, HeroScene, OrnamentRule } from './art';
import type { SiteContent } from '@/i18n/site';
import {
  Badge,
  Cards,
  Checks,
  DISTRICT_IDS,
  DistrictNext,
  DistrictStatus,
  districtState,
  Gate,
  Note,
  PageHero,
  PAGE_PATHS,
  SampleCard,
  SectionHead,
  Steps,
  Table,
  type SiteState,
} from './blocks';
import { Icon, type IconName } from './icons';
import { Md, Paras } from './md';

/**
 * The public pages' bodies. Layout differs per district on purpose — dense
 * for Mercadito, a route for YavayaGo, a calm column for Community, progress
 * for Impact — so no district is the same grid recoloured.
 */

type Cta = { href: string; label: string };

export function HomeBody({ c, primaryCta }: { c: SiteContent; primaryCta: Cta }) {
  const p = c.pages.home;
  return (
    <>
      <section className="hero">
        <HeroScene className="hero-art" />
        <div className="wrap">
          <div className="hero-mark">
            <Guilloche className="hero-seal" size={520} lobes={36} rings={12} strokeWidth={0.45} />
            <h1 className="h-xl">YAVAYA</h1>
          </div>
          <p className="hero-sub">{p.sub}</p>
          <ul className="hero-verbs">
            {p.verbs.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
          <p className="hero-one">{p.one}</p>
          <div className="btn-row">
            <a className="btn btn-gold" href="#distritos">
              {p.ctaPrimary}
            </a>
            <Link className="btn btn-line" href={primaryCta.href}>
              {primaryCta.label}
            </Link>
          </div>
        </div>
      </section>
      <section className="section" id="distritos" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <OrnamentRule className="ornament" />
          <SectionHead eyebrow={p.gatesEyebrow} title={p.gatesTitle} />
          <div className="gates">
            {DISTRICT_IDS.map((id) => (
              <Gate key={id} c={c} id={id} />
            ))}
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <div className="split">
            <div>
              <SectionHead eyebrow={p.trustEyebrow} title={p.trustTitle} lead={p.trustLead} />
              <Link className="btn btn-gold" href={PAGE_PATHS.trust}>
                {p.trustCta}
              </Link>
            </div>
            <Cards items={p.trustPoints} cols="g2" />
          </div>
        </div>
      </section>
      <section className="section seal-section">
        <Guilloche className="seal-bg" size={600} lobes={40} rings={12} strokeWidth={0.4} />
        <div className="wrap">
          <p className="quote">
            <Md text={p.quote} />
          </p>
          <div className="btn-row mt">
            <Link className="btn btn-line" href={PAGE_PATHS.about}>
              {c.nav.about}
            </Link>
            <Link className="btn btn-line" href={PAGE_PATHS.roadmap}>
              {c.nav.roadmap}
            </Link>
            <Link className="btn btn-line" href={PAGE_PATHS.status}>
              {p.ctaSecondary}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export function DistrictsBody({ c }: { c: SiteContent }) {
  const p = c.pages.districts;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} photo="districts" />
      <section className="section">
        <div className="wrap">
          <div className="gates">
            {DISTRICT_IDS.map((id) => {
              const d = c.districts[id];
              return (
                <Gate
                  key={id}
                  c={c}
                  id={id}
                  text={d.purpose}
                  bottom={`${d.color} · ${c.ui.states[districtState(id)]} · ${d.phase}`}
                />
              );
            })}
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap narrow">
          <SectionHead {...p.layer} />
          <Checks items={p.layer.items} />
          <p className="mt">
            <Link className="btn btn-gold" href={PAGE_PATHS.trust}>
              {c.nav.trust}
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}

export function MercaditoBody({ c }: { c: SiteContent }) {
  const p = c.pages.mercadito;
  return (
    <>
      <PageHero
        eyebrow={p.eyebrow}
        title={p.title}
        lead={p.lead}
        tinted
        art={<DistrictScene id="mercadito" priority />}
        badge={
          <>
            <DistrictStatus c={c} id="mercadito" />{' '}
            <Link className="btn btn-gold" href="/mercadito" style={{ marginLeft: 12 }}>
              {p.enter}
            </Link>
          </>
        }
      />
      <section className="section">
        <div className="wrap">
          <SectionHead {...p.catsHead} />
          <ul className="dense">
            {p.categories.map((k) => (
              <li key={k.name}>
                <Icon name={k.icon as IconName} />
                <b>{k.name}</b>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <SectionHead {...p.cardHead} />
          <div className="anatomy">
            <SampleCard c={c} icon={p.sample.icon} sample={p.sample} />
            <div>
              <ol>
                {p.cardParts.map((x) => (
                  <li key={x}>
                    <Md text={x} />
                  </li>
                ))}
              </ol>
              <p className="muted mt">{c.ui.demoExplain}</p>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <div className="split">
            <div>
              <SectionHead {...p.protectHead} />
              <Checks items={p.protect} />
            </div>
            <div>
              <SectionHead {...p.newSellerHead} />
              <Checks items={p.newSeller} />
              <div className="mt">
                <Note text={p.payNote} />
              </div>
            </div>
          </div>
        </div>
      </section>
      <DistrictNext c={c} id="mercadito" />
    </>
  );
}

export function YavayaGoBody({ c }: { c: SiteContent }) {
  const p = c.pages.yavayago;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} tinted badge={<DistrictStatus c={c} id="yavayago" />} art={<DistrictScene id="yavayago" priority />} />
      <section className="section">
        <div className="wrap">
          <SectionHead {...p.routeHead} />
          <ol className="route">
            {p.route.map((r) => (
              <li key={r.title}>
                <strong>{r.title}</strong>
                <span>
                  <Md text={r.text} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <div className="split">
            <div>
              <SectionHead {...p.customerHead} />
              <Checks items={p.customer} />
            </div>
            <div>
              <SectionHead {...p.driverHead} />
              <Checks items={p.driver} />
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <SectionHead {...p.focusHead} />
          <Cards items={p.focus} cols="g4" />
          <div className="mt">
            <Note text={p.payNote} />
          </div>
        </div>
      </section>
      <DistrictNext c={c} id="yavayago" />
    </>
  );
}

export function WorkBody({ c }: { c: SiteContent }) {
  const p = c.pages.work;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} tinted badge={<DistrictStatus c={c} id="work" />} art={<DistrictScene id="work" priority />} />
      <section className="section">
        <div className="wrap">
          <SectionHead {...p.diffHead} />
          <Cards items={p.diff} tone />
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <SectionHead {...p.fieldsHead} />
          <Table head={p.fieldsTable.head} rows={p.fieldsTable.rows} />
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <SectionHead {...p.plansHead} />
          <div className="plans">
            {p.plans.map((pl, i) => (
              <div key={pl.name} className={`plan${i === 1 ? ' featured' : ''}`}>
                <h3>{pl.name}</h3>
                <div className="price">{pl.price}</div>
                <div className="per">{pl.per}</div>
                <div className="when">
                  <Badge c={c} state={pl.launch ? 'dev' : 'planned'} /> <span className="muted">{pl.when}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt">
            <Note text={p.plansNote} />
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <div className="split">
            <div>
              <SectionHead {...p.employerHead} />
              <Checks items={p.employer} />
            </div>
            <div>
              <SectionHead {...p.proHead} />
              <Checks items={p.pro} />
            </div>
          </div>
        </div>
      </section>
      <DistrictNext c={c} id="work" />
    </>
  );
}

export function CommunityBody({ c }: { c: SiteContent }) {
  const p = c.pages.community;
  return (
    <>
      <PageHero
        eyebrow={p.eyebrow}
        title={p.title}
        lead={p.lead}
        tinted
        art={<DistrictScene id="community" priority />}
        badge={
          <>
            <DistrictStatus c={c} id="community" />{' '}
            <Link className="btn btn-gold" href="/community" style={{ marginLeft: 12 }}>
              {p.enter}
            </Link>
          </>
        }
      />
      <section className="section">
        <div className="wrap">
          <div className="calm">
            {p.spaces.map((s) => (
              <article key={s.title}>
                <h3>{s.title}</h3>
                <p>
                  <Md text={s.text} />
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <div className="split">
            <div>
              <SectionHead {...p.yesHead} />
              <Checks items={p.yes} />
            </div>
            <div>
              <SectionHead {...p.noHead} />
              <Checks items={p.no} cross />
            </div>
          </div>
          <div className="mt">
            <Note text={p.modNote} />
          </div>
        </div>
      </section>
      <CausesSection c={c} />
      <DistrictNext c={c} id="community" />
    </>
  );
}

/**
 * Causes: what was the Impact district, now a section of Community. Not
 * built; shown so its rules are public before the first cause exists.
 */
function CausesSection({ c }: { c: SiteContent }) {
  const p = c.pages.impact;
  return (
    <>
      <section className="section" id="causes">
        <div className="wrap">
          <SectionHead eyebrow={p.eyebrow} title={p.title} lead={p.lead} />
          <div className="promise">
            {p.promise.map((x) => (
              <div key={x.title}>
                <b>{x.big}</b>
                <h3>{x.title}</h3>
                <p className="muted mb0">
                  <Md text={x.text} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <SectionHead {...p.reviewHead} />
          <Steps items={p.review} />
          <div className="mt">
            <SectionHead {...p.typesHead} />
            <Table head={p.typesTable.head} rows={p.typesTable.rows} />
            <div className="mt">
              <Note text={p.typesNote} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function ServicesBody({ c }: { c: SiteContent }) {
  const p = c.pages.services;
  return (
    <>
      <PageHero
        eyebrow={p.eyebrow}
        title={p.title}
        lead={p.lead}
        tinted
        art={<DistrictScene id="services" priority />}
        badge={
          <>
            <DistrictStatus c={c} id="services" />{' '}
            <Link className="btn btn-gold" href="/services" style={{ marginLeft: 12 }}>
              {p.enter}
            </Link>
          </>
        }
      />
      <section className="section">
        <div className="wrap">
          <Note text={p.statusNote} />
          <div className="mt">
            <SectionHead {...p.urgentHead} />
            <Cards items={p.urgent} tone />
            <p className="muted mt">{p.urgentNote}</p>
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <SectionHead {...p.areasHead} />
          <Table head={p.areasTable.head} rows={p.areasTable.rows} />
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <div className="split">
            <div>
              <SectionHead {...p.howHead} />
              <Steps items={p.how} />
            </div>
            <div>
              <SectionHead {...p.credHead} />
              <Checks items={p.cred} />
              <div className="mt">
                <Note text={p.freeNote} />
              </div>
            </div>
          </div>
        </div>
      </section>
      <DistrictNext c={c} id="services" />
    </>
  );
}

export function AnimalsBody({ c }: { c: SiteContent }) {
  const p = c.pages.animals;
  return (
    <>
      <PageHero
        eyebrow={p.eyebrow}
        title={p.title}
        lead={p.lead}
        tinted
        art={<DistrictScene id="animals" priority />}
        badge={
          <>
            <DistrictStatus c={c} id="animals" />{' '}
            <Link className="btn btn-gold" href="/animals" style={{ marginLeft: 12 }}>
              {p.enter}
            </Link>
          </>
        }
      />
      <section className="section">
        <div className="wrap">
          <div className="organic">
            <div>
              <SectionHead {...p.pillarsHead} />
              <Cards items={p.pillars} cols="g2" tone />
            </div>
            <div className="blob">
              <Icon name="animals" />
            </div>
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <SectionHead {...p.adoptHead} />
          <Steps items={p.adopt} />
          <div className="mt">
            <Note text={p.adoptNote} />
          </div>
        </div>
      </section>
      <DistrictNext c={c} id="animals" />
    </>
  );
}

export function TrustBody({ c }: { c: SiteContent }) {
  const p = c.pages.trust;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} photo="trust" />
      <section className="section">
        <div className="wrap">
          <p className="quote">
            <Md text={p.rule} />
          </p>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <SectionHead {...p.pyramidHead} />
          <div className="pyramid">
            {p.pyramid.map((tier, i) => (
              <div key={tier.name} className="tier">
                <div className="tier-n">{i}</div>
                <div>
                  <h3>{tier.name}</h3>
                  <dl>
                    <dt>{p.pyramidLabels.needs}</dt>
                    <dd>{tier.needs}</dd>
                    <dt>{p.pyramidLabels.can}</dt>
                    <dd>{tier.can}</dd>
                  </dl>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <SectionHead {...p.verifyHead} />
          <Table head={p.verifyTable.head} rows={p.verifyTable.rows} />
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <SectionHead {...p.defenseHead} />
          <Cards items={p.defense} />
          <div className="mt">
            <Note text={p.defenseNote} />
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <SectionHead {...p.districtHead} />
          <Table head={p.districtTable.head} rows={p.districtTable.rows} />
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <div className="split">
            <div>
              <SectionHead {...p.guardianHead} />
              <Checks items={p.guardian} />
              <p className="muted mt">
                <Md text={p.guardianNote} />
              </p>
            </div>
            <div>
              <SectionHead {...p.businessHead} />
              <Checks items={p.business} />
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <SectionHead {...p.formulaHead} />
          <Table head={p.formulaTable.head} rows={p.formulaTable.rows} />
        </div>
      </section>
    </>
  );
}

export function ReputationBody({ c }: { c: SiteContent }) {
  const p = c.pages.reputation;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} photo="reputation" />
      <section className="section">
        <div className="wrap">
          <div className="split">
            <div>
              <SectionHead {...p.scoreHead} />
              <p className="muted">
                <Md text={p.scoreNote} />
              </p>
            </div>
            <div className="grid g2">
              <div className="card">
                <h3>{p.plusTitle}</h3>
                <Checks items={p.plus} />
              </div>
              <div className="card">
                <h3>{p.minusTitle}</h3>
                <Checks items={p.minus} cross />
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <SectionHead {...p.levelsHead} />
          <ol className="ladder">
            {p.levels.map((l, i) => (
              <li key={l.name}>
                <div className="n">{String(i + 1).padStart(2, '0')}</div>
                <h3>{l.name}</h3>
                <p>{l.unlock}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <SectionHead {...p.medalsHead} />
          <div className="medals">
            {p.medals.map((m) => (
              <div key={m.name} className="medal">
                <i aria-hidden="true">{m.symbol}</i>
                <span>{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <div className="split">
            <div>
              <SectionHead {...p.earnHead} />
              <Checks items={p.earn} />
            </div>
            <div>
              <SectionHead {...p.journeyHead} />
              <Steps items={p.journey} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function TokensBody({ c }: { c: SiteContent }) {
  const p = c.pages.tokens;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} photo="tokens" />
      <section className="section">
        <div className="wrap">
          <Cards items={p.pillars} />
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <SectionHead {...p.packagesHead} />
          <div className="plans">
            {p.packages.map((pk) => (
              <div key={pk.name} className="plan">
                <h3>{pk.name}</h3>
                <div className="price">{pk.tokens}</div>
                <div className="per">{p.tokensWord}</div>
                {'note' in pk && pk.note ? <p className="muted mb0">{pk.note}</p> : null}
              </div>
            ))}
          </div>
          <div className="mt">
            <Note text={p.packagesNote} />
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <div className="split">
            <div>
              <SectionHead {...p.useHead} />
              <Table head={p.useTable.head} rows={p.useTable.rows} />
            </div>
            <div>
              <SectionHead {...p.earnHead} />
              <Table head={p.earnTable.head} rows={p.earnTable.rows} />
            </div>
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap narrow">
          <SectionHead {...p.payHead} />
          <Checks items={p.pay} />
          <p className="mt">
            <Link className="btn btn-line" href={PAGE_PATHS.pricing}>
              {c.nav.pricing}
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}

export function PricingBody({ c }: { c: SiteContent }) {
  const p = c.pages.pricing;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} photo="tokens" />
      <section className="section">
        <div className="wrap">
          <div className="split">
            <div>
              <SectionHead {...p.freeHead} />
              <Checks items={p.free} />
            </div>
            <div>
              <SectionHead {...p.classesHead} />
              <Table head={p.classesTable.head} rows={p.classesTable.rows} />
            </div>
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <SectionHead {...p.paidHead} />
          <Table head={p.paidTable.head} rows={p.paidTable.rows} />
          <div className="mt">
            <Note text={p.paidNote} />
          </div>
          <div className="btn-row mt">
            <Link className="btn btn-line" href={PAGE_PATHS.work}>
              {c.districts.work.name}
            </Link>
            <Link className="btn btn-line" href={PAGE_PATHS.tokens}>
              {c.nav.tokens}
            </Link>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <SectionHead {...p.founderHead} />
          <Steps items={p.founder} />
          <p className="quote mt">
            <Md text={p.founderQuote} />
          </p>
        </div>
      </section>
    </>
  );
}

export function TransparencyBody({ c }: { c: SiteContent }) {
  const p = c.pages.transparency;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} photo="transparency" />
      <section className="section">
        <div className="wrap">
          <SectionHead {...p.willHead} />
          <Cards items={p.will} />
          <div className="mt">
            <Note text={p.nowNote} />
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <SectionHead {...p.demoHead} />
          <Steps items={p.demo} />
          <div className="mt">
            <Checks items={p.demoRules} />
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap narrow">
          <SectionHead {...p.northHead} />
          <Paras text={p.north} />
        </div>
      </section>
    </>
  );
}

/** One capability row as the status page shows it. */
export type StatusRow = {
  key: string;
  name: string;
  detail: string;
  state: SiteState;
  label: string;
  /** What would have to change, for anything not REAL. Operator-facing, untranslated. */
  note?: string;
};

export function StatusBody({
  c,
  groups,
  legend,
}: {
  c: SiteContent;
  groups: { title: string; rows: StatusRow[] }[];
  legend: { state: SiteState; label: string; explain: string }[];
}) {
  const p = c.pages.status;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} photo="status" />
      <section className="section">
        <div className="wrap narrow">
          <div className="register">
            {groups.map((g) => (
              <div key={g.title}>
                <h2 className="reg-group">{g.title}</h2>
                {g.rows.map((row) => (
                  <div key={row.key} className="reg-row" style={{ marginBottom: 8 }}>
                    <div>
                      <h3>{row.name}</h3>
                      <p>{row.detail}</p>
                      {row.note ? (
                        <p className="muted" style={{ fontSize: '0.82rem', marginTop: 6 }}>
                          {row.note}
                        </p>
                      ) : null}
                    </div>
                    <span className={`badge badge-${row.state}`}>{row.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap narrow">
          <SectionHead {...p.legendHead} />
          <div className="register">
            {legend.map((l) => (
              <div key={l.state} className="reg-row">
                <div>
                  <p>{l.explain}</p>
                </div>
                <span className={`badge badge-${l.state}`}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function RoadmapBody({ c }: { c: SiteContent }) {
  const p = c.pages.roadmap;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} photo="roadmap" />
      <section className="section">
        <div className="wrap narrow">
          <div className="grid">
            {p.phases.map((ph) => (
              <div key={ph.title} className="card">
                <div className="btn-row" style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 className="h-md" style={{ margin: 0 }}>
                    {ph.title}
                  </h3>
                  <Badge c={c} state={ph.state as SiteState} />
                </div>
                <Paras text={ph.text} />
                <ul className="tags mt">
                  {ph.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap narrow">
          <SectionHead {...p.rulesHead} />
          <Checks items={p.rules} />
        </div>
      </section>
    </>
  );
}

export function AboutBody({ c }: { c: SiteContent }) {
  const p = c.pages.about;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} photo="districts" />
      <section className="section">
        <div className="wrap">
          <div className="split">
            <div>
              <SectionHead {...p.notHead} />
              <Checks items={p.not} cross />
            </div>
            <div>
              <p className="quote">
                <Md text={p.is} />
              </p>
              <p className="lead mt">
                <Md text={p.isLead} />
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <SectionHead {...p.missionHead} />
          <Cards items={p.mission} />
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <div className="split">
            <div>
              <SectionHead {...p.goldenHead} />
              <Checks items={p.golden} />
            </div>
            <div>
              <SectionHead {...p.moatHead} />
              <Table head={p.moatTable.head} rows={p.moatTable.rows} />
            </div>
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="wrap">
          <SectionHead {...p.countriesHead} />
          <ul className="tags">
            {p.countries.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <SectionHead {...p.visionHead} />
          <div className="grid g2">
            {p.vision.map((v) => (
              <div key={v} className="card">
                <p className="quote mb0" style={{ fontSize: '1.35rem' }}>
                  <Md text={v} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function HelpBody({ c }: { c: SiteContent }) {
  const p = c.pages.help;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} photo="street" />
      <section className="section">
        <div className="wrap narrow">
          <div className="faq">
            {p.faq.map((q) => (
              <details key={q.q}>
                <summary>{q.q}</summary>
                <div className="a">
                  <Paras text={q.a} />
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function TermsBody({ c }: { c: SiteContent }) {
  const p = c.pages.terms;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} />
      <section className="section">
        <div className="wrap">
          <div className="prose">
            <p className="muted">{p.version}</p>
            {p.sections.map((s) => (
              <div key={s.title}>
                <h2>{s.title}</h2>
                <Paras text={s.text} />
                {'list' in s && s.list ? (
                  <ul>
                    {s.list.map((i) => (
                      <li key={i}>
                        <Md text={i} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function PrivacyBody({ c }: { c: SiteContent }) {
  const p = c.pages.privacy;
  return (
    <>
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={p.lead} />
      <section className="section">
        <div className="wrap">
          <div className="prose">
            {p.sections.map((s) => (
              <div key={s.title}>
                <h2>{s.title}</h2>
                <Paras text={s.text} />
                {'list' in s && s.list ? (
                  <ul>
                    {s.list.map((i) => (
                      <li key={i}>
                        <Md text={i} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
