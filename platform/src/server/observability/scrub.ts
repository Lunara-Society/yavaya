/**
 * What may leave Yavaya in an error report, and what may not.
 *
 * Error reports go to Sentry (sentry.io, United States). They exist so the
 * team learns that something broke and where, not who it broke for. So a
 * report carries the error, its stack and the route — and never a cookie, a
 * header beyond the browser's name, a request body, a query string (reset and
 * sign-in links carry their secret there), an IP address, or an email address
 * that found its way into a message (Postgres puts the offending value of a
 * unique constraint into its error text: `Key (email)=(…) already exists`).
 *
 * Pure functions on plain objects so the rules can be tested without Sentry.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Long runs of letters and digits: tokens, keys, signed links, session ids. */
const SECRETISH = /\b(?:sk|rk|pk|whsec|xi|sk_live|sk_test)_[A-Za-z0-9_]{8,}\b|\b[A-Za-z0-9_-]{40,}\b/g;
/** Postgres echoes the conflicting value: `Key (column)=(value)`. The column is useful, the value is not. */
const PG_DETAIL = /(Key \([^)]*\)=\()[^)]*(\))/g;

/**
 * Espacio Violeta, its API, and the pages that hold its messages: nothing
 * about them leaves Yavaya, not even that an error happened there. The privacy
 * page promises exactly this.
 */
const SILENT_PATH = /^(?:https?:\/\/[^/]+)?\/(?:api\/)?violeta(?:[/?#]|$)/;

export function isSilentPath(urlOrPath: string | undefined): boolean {
  return Boolean(urlOrPath && SILENT_PATH.test(urlOrPath));
}

export function scrubText(text: string): string {
  return text.replace(PG_DETAIL, '$1[removed]$2').replace(EMAIL, '[email]').replace(SECRETISH, '[removed]');
}

/** An address without its query string or fragment. */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

type Frame = { vars?: unknown };
type ExceptionValue = { value?: string; stacktrace?: { frames?: Frame[] } };
type Breadcrumb = { category?: string; message?: string; data?: Record<string, unknown> };

export type ReportShape = {
  message?: string;
  exception?: { values?: ExceptionValue[] };
  request?: { url?: string; query_string?: unknown; cookies?: unknown; headers?: Record<string, string>; data?: unknown; env?: unknown };
  user?: unknown;
  extra?: Record<string, unknown>;
  breadcrumbs?: Breadcrumb[];
  server_name?: string;
};

/** Applied to every report just before it is sent; null means it is not sent at all. */
export function scrubReport<T extends ReportShape>(report: T): T | null {
  if (isSilentPath(report.request?.url)) return null;
  if (report.message) report.message = scrubText(report.message);
  for (const value of report.exception?.values ?? []) {
    if (value.value) value.value = scrubText(value.value);
    // Local variables can hold anything the function was holding: a password, a message.
    for (const frame of value.stacktrace?.frames ?? []) delete frame.vars;
  }
  if (report.request) {
    const request = report.request;
    if (request.url) request.url = scrubUrl(request.url);
    delete request.query_string;
    delete request.cookies;
    delete request.data;
    delete request.env;
    const agent = request.headers?.['user-agent'] ?? request.headers?.['User-Agent'];
    request.headers = agent ? { 'user-agent': agent } : {};
  }
  // No user at all: not an id, not an address. The digest on the error page is how support finds one occurrence.
  delete report.user;
  // The container's host name says nothing useful and changes on every deploy.
  delete report.server_name;
  if (report.breadcrumbs) report.breadcrumbs = report.breadcrumbs.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null);
  return report;
}

/**
 * Console lines are dropped: the server logs things for its own log, some of
 * them about people. Requests keep their method, status and address without
 * the query.
 */
export function scrubBreadcrumb<T extends Breadcrumb>(crumb: T): T | null {
  if (crumb.category === 'console') return null;
  if (crumb.message) crumb.message = scrubText(crumb.message);
  if (crumb.data) {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(crumb.data)) {
      if (key === 'url' && typeof value === 'string') data.url = scrubUrl(value);
      else if (key === 'method' || key === 'status_code' || key === 'http.method' || key === 'http.response.status_code') data[key] = value;
    }
    crumb.data = data;
  }
  return crumb;
}
