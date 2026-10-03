/**
 * YavayaGo's closed vocabularies. Display names are i18n keys:
 * `go.category.<key>` and `go.vehicle.<key>`.
 */
export const GO_CATEGORIES = ['food', 'groceries', 'pharmacy', 'bakery', 'drinks', 'essentials', 'local'] as const;
export type GoCategory = (typeof GO_CATEGORIES)[number];

export const GO_VEHICLES = ['motorcycle', 'car', 'bicycle', 'on_foot'] as const;
export type GoVehicle = (typeof GO_VEHICLES)[number];

/** Vehicles that carry a plate the customer can check. */
export const VEHICLES_WITH_PLATE: readonly GoVehicle[] = ['motorcycle', 'car'];

export const GO_PAYMENT_METHODS = ['cash'] as const;
