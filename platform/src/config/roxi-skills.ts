import { ROXI_SKILL_PLANS, type RoxiPlanKey, type RoxiSkill } from './business-rules';

/**
 * Which of Roxi's skills work today, for the plans page and for Roxi
 * herself. A skill marked 'soon' is shown as coming, never as included:
 * selling a plan on something that does not exist yet is the one thing the
 * plans page must not do. Flip a skill to 'live' only in the change that
 * makes it work.
 *
 * 'live' skills that rest on conversation rather than new machinery (solving
 * a problem, starting with nothing, finding one's skills, matching help) use
 * the tools Roxi already has — search and drafts — and her instructions.
 */
export const ROXI_SKILL_STATUS: Record<RoxiSkill, 'live' | 'soon'> = {
  search: 'live',
  drafts: 'live',
  surprise: 'live',
  good_moments: 'live',
  celebrations: 'soon',
  thank_you: 'live',
  problem_solver: 'live',
  lost_pet_guard: 'soon',
  start_with_nothing: 'live',
  skill_discovery: 'live',
  help_match: 'live',
  goals: 'live',
  reminders: 'live',
  day_plan: 'live',
  daily_opportunity: 'soon',
  neighbourhood: 'soon',
  budget_finder: 'soon',
  sell_with_me: 'soon',
  connectors_google: 'live',
  family_circle: 'soon',
  business_insights: 'soon',
  connectors_custom: 'live',
};

/** The skills a plan adds over the one below it, in the order the plans page lists them. */
export function skillsAddedBy(plan: RoxiPlanKey): RoxiSkill[] {
  return (Object.keys(ROXI_SKILL_PLANS) as RoxiSkill[]).filter((skill) => ROXI_SKILL_PLANS[skill] === plan);
}
