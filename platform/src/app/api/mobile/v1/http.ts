/** HTTP statuses the mobile API answers with, named so a reader need not recall the numbers. */
export const HTTP = {
  seeOther: 303,
  badRequest: 400,
  unauthorized: 401,
  paymentRequired: 402,
  forbidden: 403,
  notFound: 404,
  tooMany: 429,
  badGateway: 502,
} as const;
