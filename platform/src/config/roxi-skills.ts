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
  front_door: 'live',
  goals: 'live',
  day_plan: 'live',
  reminders: 'live',
  promise_keeper: 'live',
  surprise: 'live',
  good_moments: 'live',
  celebrations: 'soon',
  thank_you: 'live',
  problem_solver: 'live',
  lost_pet_guard: 'soon',
  start_with_nothing: 'live',
  skill_discovery: 'live',
  help_match: 'live',
  life_map: 'live',
  community_pulse: 'live',
  business_ledger: 'live',
  human_connection: 'live',
  price_memory: 'live',
  trusted_contact: 'soon',
  share: 'live',
  real_world_memory: 'live',
  camera_eyes: 'live',
  second_chance: 'live',
  personal_world: 'live',
  daily_opportunity: 'live',
  neighbourhood: 'soon',
  budget_finder: 'soon',
  sell_with_me: 'soon',
  connectors_google: 'live',
  time_capsule: 'live',
  anticipation: 'soon',
  missions: 'live',
  negotiation_coach: 'soon',
  knowledge_vault: 'soon',
  cross_district: 'soon',
  store_rescue: 'soon',
  family_circle: 'soon',
  business_insights: 'soon',
  connectors_custom: 'live',
  connects_dots: 'soon',
  opportunity_radar: 'soon',
  chain_reaction: 'soon',
  storykeeper: 'soon',
  mission_agent: 'soon',
  live_world: 'soon',
  digital_twin: 'soon',
  multi_agent: 'soon',
  life_os: 'soon',
};

/** The skills a plan adds over the one below it, in the order the plans page lists them. */
export function skillsAddedBy(plan: RoxiPlanKey): RoxiSkill[] {
  return (Object.keys(ROXI_SKILL_PLANS) as RoxiSkill[]).filter((skill) => ROXI_SKILL_PLANS[skill] === plan);
}
