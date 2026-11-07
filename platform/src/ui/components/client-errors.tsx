import { headers } from 'next/headers';

/**
 * Catches what no error boundary sees: errors thrown in event handlers,
 * timers and promises (Roxi's voice panel, a map, a form's own script), and
 * reports them to /api/client-errors, which forwards them to Sentry from the
 * server (src/instrumentation.ts explains why the browser SDK is not used).
 *
 * An inline script rather than a component, deliberately: it is a few hundred
 * bytes in the page instead of a chunk counted against the size budget, and
 * it is listening before the page's JavaScript has even loaded — which is
 * when some of the worst failures happen.
 *
 * Only errors from this site's own scripts: a browser extension's error, or a
 * cross-origin script's (which the browser reduces to "Script error."), is
 * not Yavaya's. An aborted fetch or a blocked media play is a person leaving a
 * page, not a failure. At most three per page load, each message once, and
 * never anything from Espacio Violeta. The same rules as
 * client-error-report.ts, which the error boundary uses.
 */
const SCRIPT = `(function(){var n=0,s={},o=location.origin;function r(e,k){try{if(n>=3||/^\\/violeta(\\/|$)/.test(location.pathname))return;var m=e&&e.message!=null?String(e.message):String(e),t=String((e&&e.name)||'Error');if(!m||s[t+m])return;s[t+m]=1;n++;fetch('/api/client-errors',{method:'POST',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({kind:k,name:t.slice(0,80),message:m.slice(0,500),stack:String((e&&e.stack)||'').slice(0,3000),path:location.pathname.slice(0,200)})}).catch(function(){})}catch(x){}}addEventListener('error',function(v){if(v.filename&&v.filename.indexOf(o)===0)r(v.error||v.message,'error')});addEventListener('unhandledrejection',function(v){var e=v.reason;if(e&&(e.name==='AbortError'||e.name==='NotAllowedError'))return;var t=e&&e.stack;if(t&&String(t).indexOf(o)<0)return;r(e,'rejection')})})();`;

export async function ClientErrors() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  // React drops a nonce from the DOM after load, as in json-ld.tsx.
  return <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
