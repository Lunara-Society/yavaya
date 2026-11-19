import 'server-only';
import type { Executor } from '@/server/db/client';
import type { MessageKey, Translator } from '@/i18n';
import { placeById } from '@/server/domains/geography/places';
import type { ListingDraft } from '@/server/domains/roxi/drafts';

/** A draft as the review card and the panel show it: the words, the photos' private addresses, and the labels already translated. */
export type DraftView = {
  id: string;
  fields: Record<string, string>;
  photos: Array<{ id: string; url: string }>;
  place: { id: string; label: string; currency: string } | null;
  category: string | null;
  condition: string | null;
  source: 'web' | 'whatsapp';
  expiresAt: string;
  /** The filled-in form, where the member publishes it themselves. */
  openUrl: string;
};

export async function draftView(executor: Executor, draft: ListingDraft, t: Translator, locale: string): Promise<DraftView> {
  const place = draft.fields.locationId ? await placeById(executor, draft.fields.locationId, locale) : null;
  return {
    id: draft.id,
    fields: draft.fields,
    photos: draft.photoIds.map((id) => ({ id, url: `/api/roxi/drafts/photo/${id}` })),
    place: place ? { id: place.id, label: `${place.name}, ${place.context}`, currency: place.currencyCode } : null,
    category: draft.fields.category ? t(`mercadito.category.${draft.fields.category}` as MessageKey) : null,
    condition: draft.fields.condition ? t(`mercadito.condition.${draft.fields.condition}` as MessageKey) : null,
    source: draft.source,
    expiresAt: draft.expiresAt.toISOString(),
    openUrl: `/mercadito/publish?draft=${draft.id}`,
  };
}
