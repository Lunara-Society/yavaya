import { NextResponse } from 'next/server';
import { serverEnv } from '@/config/env';
import { mobileConfig } from '@/server/domains/platform/mobile-config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/v1/config — public, read-only remote configuration for the
 * mobile app (feature flags, minimum supported build, an optional notice).
 * Holds no personal data and no secrets; cached briefly at the edge.
 */
export async function GET(): Promise<Response> {
  const env = serverEnv();
  return NextResponse.json(mobileConfig(env.MOBILE_FLAGS, env.MOBILE_MIN_BUILD, env.MOBILE_MESSAGE), {
    headers: { 'cache-control': 'public, max-age=60' },
  });
}
