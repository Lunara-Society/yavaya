'use server';

import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n';
import { requestContext } from '@/server/auth/context';
import { submitAppeal } from '@/server/domains/access/sanctions';
import { toClientError } from '@/server/errors';
import { SANCTION_RULES } from '@/config/business-rules';

export type AppealState = { status: 'idle' } | { status: 'error'; message: string } | { status: 'sent'; message: string };

/** The account comes from the sealed link, never from the form: the member cannot sign in to say who they are. */
export async function appealAction(_previous: AppealState, formData: FormData): Promise<AppealState> {
  const { t } = await getTranslator();
  const token = String(formData.get('token') ?? '').slice(0, 400);
  const body = String(formData.get('body') ?? '').slice(0, SANCTION_RULES.appealMaxLength + 1);
  try {
    const { networkHash } = await requestContext();
    const outcome = await db().transaction((tx) => submitAppeal(tx, { token, body, networkHash }));
    if (outcome === 'lifted') return { status: 'sent', message: t('appeal.lifted') };
    if (outcome === 'already') return { status: 'sent', message: t('appeal.already') };
    return { status: 'sent', message: t('appeal.sent') };
  } catch (error) {
    const clientError = toClientError(error);
    return {
      status: 'error',
      message: t(clientError.messageKey as MessageKey, { min: SANCTION_RULES.appealMinLength, max: SANCTION_RULES.appealMaxLength, ...(clientError.details as Record<string, string | number>) }),
    };
  }
}
