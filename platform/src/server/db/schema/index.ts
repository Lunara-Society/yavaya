/**
 * The full Yavaya schema, grouped by domain boundary.
 *
 * Domains own their tables. Cross-domain reads go through a domain's public
 * service module, not by importing another domain's table into feature code.
 */
export * from './enums';
export * from './geography';
export * from './identity';
export * from './access';
export * from './audit';
export * from './tokens';
export * from './reputation';
export * from './moderation';
export * from './notifications';
export * from './payments';
export * from './platform';
export * from './media';
export * from './mercadito';
export * from './community';
export * from './sanctuary';
export * from './services';
export * from './animals';
