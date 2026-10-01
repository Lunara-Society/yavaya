import Link from 'next/link';
import type { MessageKey, Translator } from '@/i18n';
import type { AnimalCard as AnimalCardView } from '@/server/domains/animals/service';

/**
 * Animales' shared pieces. An animal is shown the way an adopter needs to
 * see it: a face, a name, and the facts that decide whether it fits a home.
 */

export function ageText(t: Translator, months: number | null): string {
  if (months === null) return t('animals.age.unknown');
  if (months < 12) return months === 1 ? t('animals.age.month_one') : t('animals.age.months', { count: months });
  const years = Math.floor(months / 12);
  return years === 1 ? t('animals.age.year_one') : t('animals.age.years', { count: years });
}

export function facts(t: Translator, animal: Pick<AnimalCardView, 'species' | 'sex' | 'size' | 'ageMonths'>): string {
  return [
    t(`animals.species.${animal.species}` as MessageKey),
    t(`animals.sex.${animal.sex}` as MessageKey),
    t(`animals.size.${animal.size}` as MessageKey),
    ageText(t, animal.ageMonths),
  ].join(' · ');
}

export function AnimalCard({ animal, t, footer }: { animal: AnimalCardView; t: Translator; footer?: string }) {
  return (
    <Link className="an-card" href={`/animals/${animal.id}`}>
      <span className="an-photo">
        {animal.photoId ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from /media, pre-sized
          <img src={`/media/${animal.photoId}`} alt="" loading="lazy" decoding="async" />
        ) : null}
        {animal.status !== 'available' ? <span className="an-status">{t(`animals.status.${animal.status}` as MessageKey)}</span> : null}
      </span>
      <span className="an-card-body">
        <strong className="an-name">{animal.name}</strong>
        <span className="an-facts">{facts(t, animal)}</span>
        <span className="an-health">
          {animal.sterilised ? <span>✓ {t('animals.health.sterilised')}</span> : null}
          {animal.vaccinated ? <span>✓ {t('animals.health.vaccinated')}</span> : null}
        </span>
        <span className="an-place">
          {animal.placeName} · {animal.rescuerName}
        </span>
        {footer ? <span className="an-foot">{footer}</span> : null}
      </span>
    </Link>
  );
}
