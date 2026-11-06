import { describe, expect, it } from 'vitest';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';
import { ROXI_PLANS } from '@/config/business-rules';
import { inMemberZone, memberDay } from '@/ui/roxi/member-time';

describe("Roxi's pages: what the member reads", () => {
  it('show a reminder at the hour the member set it, not the server’s', () => {
    // 9:00 in Managua (UTC−6) is 15:00 UTC: the server's clock.
    const nineInManagua = new Date('2026-11-09T15:00:00Z');
    expect(inMemberZone(nineInManagua, 'es', 'America/Managua', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })).toBe('09:00');
    expect(memberDay(new Date('2026-11-10T03:00:00Z'), 'America/Managua')).toBe('2026-11-09');
    // A zone the runtime does not know still prints the moment instead of failing the page.
    expect(() => inMemberZone(nineInManagua, 'es', 'Not/AZone', { hour: '2-digit' })).not.toThrow();
  });

  it('say "one" in words wherever a plan allows exactly one, in both languages', () => {
    const limits = { goals: 'roxi.plans.limit.goals', reminders: 'roxi.plans.limit.reminders', connections: 'roxi.plans.limit.connections_google' } as const;
    for (const plan of Object.values(ROXI_PLANS)) {
      for (const [field, key] of Object.entries(limits)) {
        if (plan[field as keyof typeof limits] !== 1) continue;
        for (const dictionary of [es, en]) {
          const one = (dictionary as Record<string, string>)[`${key}_one`];
          expect(one, `${key}_one`).toBeTruthy();
          expect(one).not.toMatch(/\{n\}|\b1\b/);
        }
      }
    }
    expect(es['roxi.plans.limit.goals_one']).toBe('Una meta a la vez');
  });

  it('never give a coming skill the name of a page that already works', () => {
    for (const dictionary of [es, en]) {
      expect(dictionary['roxi.skill.business_insights']).not.toBe(dictionary['roxi.business.title']);
    }
  });
});
