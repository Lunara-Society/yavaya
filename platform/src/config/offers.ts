/**
 * What can be offered on a Mirador video and by which kind of offer
 * (docs/mirador/README.md, "Offers"). Shared by the server's checks
 * (server/domains/mirador/offers.ts) and the form, so the form never offers
 * a choice the server refuses.
 */
export const OFFER_KINDS = ['sale', 'free', 'contribution', 'donation', 'animals', 'need'] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];
export const OFFER_CATEGORIES = ['food', 'baked', 'crafts', 'clothes', 'plants', 'animal_food', 'animal_care', 'help', 'other'] as const;
export type OfferCategory = (typeof OFFER_CATEGORIES)[number];
/** Food for people: the food rules apply (what is in it, made today, a day at most). */
export const FOOD_CATEGORIES: readonly OfferCategory[] = ['food', 'baked'];

/**
 * What each kind may offer. Hands that help (transport, volunteering, a
 * temporary home) are never sold — that is Servicios —, animals' things go
 * to rescuers, and soup kitchens get what feeds or clothes people.
 */
export const KIND_CATEGORIES: Record<OfferKind, readonly OfferCategory[]> = {
  sale: ['food', 'baked', 'crafts', 'clothes', 'plants', 'animal_food', 'animal_care', 'other'],
  contribution: ['food', 'baked', 'crafts', 'clothes', 'plants', 'animal_food', 'animal_care', 'other'],
  free: OFFER_CATEGORIES,
  donation: ['food', 'baked', 'clothes', 'other'],
  animals: ['animal_food', 'animal_care', 'help'],
  need: OFFER_CATEGORIES,
};
