/**
 * Comparison groups (decision F54): the opt-in wording.
 *
 * DRAFT for counsel. Opting in stays closed (Admin → Comparison groups) until
 * counsel approves this exact wording. Any change to the wording needs a new
 * version here and in private.comparison_group_settings.consent_text_version,
 * so every opt-in records which wording the athlete agreed to.
 */

export const COMPARISON_CONSENT_VERSION = 'comparison-groups-v1';

export const COMPARISON_CONSENT_TEXT: readonly string[] = [
  'When you join, Base Recruits may use your measured results, without your name, to build comparison groups. Examples are exit velocity from a ball tracker or bat speed from a bat sensor, from your published reports.',
  'A group compares athletes in the same age band and level, measured the same way with the same kind of device (for ball trackers and bat sensors, the same make). A group is used only once it has at least 30 athletes, and it shows only a position in the group. It never shows anyone’s name or anyone else’s results.',
  'We never use pain, injury, readiness or other health information, and we never use your video. Paying for Base Recruits never changes your place in a group.',
  'You can leave at any time. Your results are then removed from every group.',
  'If you are under 18, nothing is used until a parent or legal guardian linked to your account agrees. They can also take you out at any time.',
];
