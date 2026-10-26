/**
 * Starter drill library, version 1. Original Base Recruits content: written
 * instructions only (no demonstration video exists yet, and none is linked).
 * Mirrors public.assessment_drills (key, version, discipline, pillars); a
 * contract test keeps them identical.
 *
 * Pitching drills never raise throwing volume or intensity on their own:
 * every pitching dosage defers to the pitcher's existing throwing plan.
 */

import type { Discipline, PillarKey } from '@/lib/assessment/types';

export const DRILL_REQUIREMENTS = ['partner', 'radar', 'video'] as const;
export type DrillRequirement = (typeof DRILL_REQUIREMENTS)[number];

export const DRILL_REQUIREMENT_LABELS: Readonly<Record<DrillRequirement, string>> = {
  partner: 'A partner to toss or catch',
  radar: 'A radar or tracking device',
  video: 'A phone or camera to film',
};

export interface DrillDefinition {
  readonly key: string;
  readonly version: number;
  readonly discipline: Discipline;
  readonly name: string;
  readonly pillars: readonly PillarKey[];
  /** Metrics whose findings this drill addresses. */
  readonly findings: readonly string[];
  readonly purpose: string;
  /** Equipment needed; "none" means nothing beyond the usual bat, balls or glove. */
  readonly equipment: readonly string[];
  /** Requirements a suggestion checks against what the athlete has available. */
  readonly requires: readonly DrillRequirement[];
  readonly setup: string;
  readonly steps: readonly string[];
  readonly cues: readonly string[];
  /** Suggested starting dosage; a coach or the athlete can edit it in a plan. */
  readonly dosage: string;
  readonly regression: string;
  readonly progression: string;
  readonly completion: string;
  /** What the next assessment checks. */
  readonly reassessment: string;
}

const PITCHING_LOAD_NOTE = 'Count these throws inside your current throwing plan; do not add throws or raise intensity for this drill.';

const DRILL_LIST: readonly DrillDefinition[] = [
  // ---------------------------------------------------------------- Hitting
  {
    key: 'hit-rhythm-load-tee',
    version: 1,
    discipline: 'hitting',
    name: 'Rhythm-and-load tee series',
    pillars: ['load_timing'],
    findings: ['hit_load_repeatability', 'hit_drill_preparation'],
    purpose: 'Build one repeatable load by starting every swing from the same rhythm and pausing briefly when loaded.',
    equipment: ['tee', 'balls', 'phone for video (optional)'],
    requires: [],
    setup: 'Tee at a middle-height strike. Stand where you normally would. If you can, film from the side facing your chest.',
    steps: [
      'Start each rep with the same short rhythm move you use in games.',
      'Load and pause for a silent count of one when you feel loaded.',
      'Swing from the paused position, then reset fully before the next rep.',
      'After every five swings, watch one swing on video and compare it with the first.',
    ],
    cues: ['Same start, same finish to the load', 'Feel loaded before you swing', 'Reset completely between swings'],
    dosage: '3 sets of 8 swings, 3 days a week',
    regression: 'Do the load and pause without swinging (dry), then add the swing back once the pause looks the same each time.',
    progression: 'Remove the pause and keep the same load; then move to front toss with a varied feed.',
    completion: 'Eight swings in a row whose loads look the same to you or your coach at normal speed.',
    reassessment: 'Load repeatability is rated again from the same camera view and drill.',
  },
  {
    key: 'hit-front-toss-tempo',
    version: 1,
    discipline: 'hitting',
    name: 'Front-toss tempo changes',
    pillars: ['load_timing'],
    findings: ['hit_drill_preparation', 'hit_fc_to_contact_ms', 'hit_timing_variation_ms'],
    purpose: 'Practise being loaded and ready on time when the feed tempo changes.',
    equipment: ['L-screen', 'balls', 'a partner to toss', 'phone for video (optional)'],
    requires: ['partner'],
    setup: 'Partner tosses from behind a screen at a safe distance. Agree on three tempos: quick, normal and slow.',
    steps: [
      'Partner mixes the three tempos in a random order without announcing them.',
      'Get loaded early and wait; start the swing only when the ball is on its way to the zone.',
      'After each set, note which tempo made you late or early.',
    ],
    cues: ['Load early, wait late', 'Be ready before the ball is released', 'Let the ball come to the contact point'],
    dosage: '4 sets of 6 swings, 2–3 days a week',
    regression: 'Use two tempos only, announced before each toss.',
    progression: 'Add slight changes in toss location as well as tempo.',
    completion: 'Most swings in a set are on time across all three tempos, as judged by your partner or on video.',
    reassessment: 'Ready-on-time is rated again, and timing estimates are compared only within the same drill type.',
  },
  {
    key: 'hit-contact-point-map',
    version: 1,
    discipline: 'hitting',
    name: 'Contact-point tee map',
    pillars: ['barrel_delivery'],
    findings: ['hit_contact_location_consistency'],
    purpose: 'Learn where contact should happen for inside, middle and outside pitches, and hit those points on purpose.',
    equipment: ['tee', 'balls', 'three cones or tape marks'],
    requires: [],
    setup: 'Mark three tee positions: inside (further out in front), middle, and outside (deeper). Write the intended contact point for each in your notes.',
    steps: [
      'Hit five balls from the middle position.',
      'Move the tee to inside and hit five, then outside and hit five.',
      'For each swing, say out loud whether contact was at the intended point, in front of it, or behind it.',
    ],
    cues: ['Inside: catch it out front', 'Outside: let it travel', 'Same swing, different contact point'],
    dosage: '2 rounds of 15 swings (5 per position), 3 days a week',
    regression: 'Use only the middle position until contact is at the intended point on most swings.',
    progression: 'Have a partner call the position just before you set up, so you adjust without practice swings.',
    completion: 'At least 8 of 10 swings at each position meet the ball at the intended point.',
    reassessment: 'Contact-point consistency is rated again with the same intended contact points written down.',
  },
  {
    key: 'hit-barrel-gate',
    version: 1,
    discipline: 'hitting',
    name: 'Barrel gate tee work',
    pillars: ['barrel_delivery'],
    findings: ['hit_barrel_delivery_consistency', 'hit_attack_angle_deg', 'hit_bat_speed_mph'],
    purpose: 'Give the barrel a clear, repeatable route into the hitting zone using a soft visual guide.',
    equipment: ['tee', 'balls', 'two soft objects such as pool noodles or foam cones'],
    requires: [],
    setup: 'Place two soft objects to form a wide gate in front of the plate that the barrel should pass through on the way to contact. Use only soft objects that cannot hurt you if you clip them.',
    steps: [
      'Take slow practice swings through the gate without a ball.',
      'Hit off the tee at normal effort, keeping the barrel through the gate.',
      'If you clip the gate, take one slow swing before the next hit.',
    ],
    cues: ['Same route every time', 'Barrel through the gate, then the ball', 'Smooth before fast'],
    dosage: '3 sets of 8 swings, 2–3 days a week',
    regression: 'Widen the gate and hit at reduced effort.',
    progression: 'Narrow the gate slightly, then move to front toss with the gate still in place.',
    completion: 'Eight swings in a row through the gate at normal effort without clipping it.',
    reassessment: 'Barrel delivery consistency is rated again; if a bat sensor was used, the same device is used again.',
  },
  {
    key: 'hit-stride-line',
    version: 1,
    discipline: 'hitting',
    name: 'Stride line',
    pillars: ['lower_body_contribution'],
    findings: ['hit_stride_direction_repeatability'],
    purpose: 'Make the front foot land in the same direction and spot from swing to swing.',
    equipment: ['tape or chalk', 'tee or partner', 'balls'],
    requires: [],
    setup: 'Put a line on the ground pointing toward the pitcher from your front foot. Mark where your front foot usually lands.',
    steps: [
      'Take five strides without swinging, landing on the mark.',
      'Hit off a tee, checking the landing spot after each swing.',
      'Move to front toss once the landing is consistent on the tee.',
    ],
    cues: ['Land on the mark', 'Toe direction stays the same', 'Stride the same length every time'],
    dosage: '3 sets of 8 swings, 3 days a week',
    regression: 'Strides without a swing until the foot lands on the mark ten times in a row.',
    progression: 'Front toss with changing locations while keeping the same landing.',
    completion: 'The foot lands within a shoe’s width of the mark on 9 of 10 swings.',
    reassessment: 'Stride-direction repeatability is rated again from a front or rear view with the feet in frame.',
  },
  {
    key: 'hit-hold-the-finish',
    version: 1,
    discipline: 'hitting',
    name: 'Hold-the-finish swings',
    pillars: ['lower_body_contribution'],
    findings: ['hit_balance_through_swing', 'hit_lower_body_consistency'],
    purpose: 'Swing at full effort while staying in control through the finish.',
    equipment: ['tee or partner', 'balls'],
    requires: [],
    setup: 'Normal tee or front-toss setup with room to finish safely.',
    steps: [
      'Swing at normal effort and hold your finish for a slow count of three.',
      'If you have to step or wobble, take the next swing at reduced effort.',
      'Return to normal effort once you can hold the finish again.',
    ],
    cues: ['Finish tall and still', 'Head steady through contact', 'Effort you can control'],
    dosage: '3 sets of 6 swings, 3 days a week',
    regression: 'Half-effort swings with a three-second hold.',
    progression: 'Front toss and then live batting practice, holding the finish on every swing.',
    completion: 'Hold the finish without a recovery step on 9 of 10 normal-effort swings.',
    reassessment: 'Balance and lower-body consistency are rated again with the whole body in frame.',
  },
  {
    key: 'hit-same-move-sets',
    version: 1,
    discipline: 'hitting',
    name: 'Same-move video sets',
    pillars: ['lower_body_contribution', 'load_timing'],
    findings: ['hit_lower_body_consistency', 'hit_load_repeatability'],
    purpose: 'Use short filmed sets to notice and reduce swing-to-swing differences in how the lower body moves.',
    equipment: ['phone on a tripod or stand', 'tee or partner', 'balls'],
    requires: ['video'],
    setup: 'Film from the front or the side facing the chest at the same spot every session.',
    steps: [
      'Take five swings, then watch them back to back.',
      'Pick the one difference you notice most (for example, the back leg or when the hips open).',
      'Take five more swings focused only on that difference, then watch again.',
    ],
    cues: ['One thing at a time', 'Same move, swing after swing'],
    dosage: '4 sets of 5 swings with review, 2 days a week',
    regression: 'Review two swings at a time instead of five.',
    progression: 'Review without slow motion, at normal speed.',
    completion: 'The difference you chose is no longer visible in most swings of a set.',
    reassessment: 'Lower-body consistency is rated again from the same camera view.',
  },
  {
    key: 'hit-line-drive-rounds',
    version: 1,
    discipline: 'hitting',
    name: 'Line-drive target rounds',
    pillars: ['impact_output'],
    findings: ['hit_solid_contact', 'hit_launch_angle_deg', 'hit_output_consistency_pct'],
    purpose: 'Chart solid contact honestly and aim batted balls at a defined target zone.',
    equipment: ['net or field', 'balls', 'tee or partner', 'a way to mark a target zone'],
    requires: [],
    setup: 'Mark a line-drive target zone on the net or field. Use the solid-contact definition from your assessment.',
    steps: [
      'Hit rounds of six. After each swing, mark it solid or not using the definition.',
      'Keep a simple tally for each round.',
      'Between rounds, rest and note any pattern in the misses (topped, under, off the end).',
    ],
    cues: ['Hard and through the middle', 'Chart honestly, every swing'],
    dosage: '4 rounds of 6 swings, 2–3 days a week',
    regression: 'Use a tee at a comfortable height until most swings are solid.',
    progression: 'Front toss, then live batting practice, with the same target and definition.',
    completion: 'Your tally reaches the solid-contact rate you and your coach set for this block.',
    reassessment: 'Solid-contact rate is charted again with the same definition and drill type.',
  },
  {
    key: 'hit-radar-intent-rounds',
    version: 1,
    discipline: 'hitting',
    name: 'Measured intent rounds',
    pillars: ['impact_output'],
    findings: ['hit_exit_velocity_mph', 'hit_output_consistency_pct', 'hit_bat_speed_mph'],
    purpose: 'Hit with full, controlled intent while measuring ball speed with the same device each time.',
    equipment: ['radar or ball-tracking device', 'tee or partner', 'balls', 'net'],
    requires: ['radar'],
    setup: 'Set the device up the same way every session and write down where it was placed.',
    steps: [
      'Warm up fully before measured swings.',
      'Take rounds of five measured swings with full rest between rounds.',
      'Record every reading, including mishits, so the median stays honest.',
    ],
    cues: ['Fast and on time, not fast and early', 'Same setup, same device'],
    dosage: '3 rounds of 5 measured swings, 2 days a week',
    regression: 'Fewer measured swings with longer rest.',
    progression: 'Measured front toss with the same device setup.',
    completion: 'Readings are recorded for every swing in each round with the same device setup.',
    reassessment: 'Exit velocity is measured again with the same device and drill type; readings from other devices are not compared.',
  },
  // ---------------------------------------------------------------- Pitching
  {
    key: 'pit-stride-line',
    version: 1,
    discipline: 'pitching',
    name: 'Stride-line landing work',
    pillars: ['lower_body_delivery'],
    findings: ['pit_stride_direction_repeatability', 'pit_landing_consistency'],
    purpose: 'Land in the same direction and spot on every delivery.',
    equipment: ['tape or chalk', 'phone for video (optional)'],
    requires: [],
    setup: 'Flat ground or mound. Mark a line toward the target and your usual landing spot.',
    steps: [
      'Do five dry deliveries (no ball), landing on the mark.',
      'Make easy throws at reduced intensity, checking the landing after each one.',
      'Film from the front once a session and compare landings.',
    ],
    cues: ['Land on the mark', 'Toe and knee point the same way each time'],
    dosage: `10 dry reps and up to 10 easy throws, 2–3 days a week. ${PITCHING_LOAD_NOTE}`,
    regression: 'Dry reps only until the landing is consistent.',
    progression: 'The same landing check during your normal bullpen, with no added pitches.',
    completion: 'Landing within a shoe’s width of the mark on 9 of 10 deliveries.',
    reassessment: 'Stride-direction and landing consistency are rated again from the same camera view.',
  },
  {
    key: 'pit-balance-hold',
    version: 1,
    discipline: 'pitching',
    name: 'Leg-lift balance holds',
    pillars: ['lower_body_delivery'],
    findings: ['pit_delivery_balance'],
    purpose: 'Control the body at leg lift and through the finish.',
    equipment: ['none'],
    requires: [],
    setup: 'Flat ground with room to finish.',
    steps: [
      'Lift to your normal leg-lift height and hold for two seconds.',
      'Continue into a slow, dry delivery and hold the finish for two seconds.',
      'Add easy throws at reduced intensity only when both holds are steady.',
    ],
    cues: ['Tall and still at the top', 'Finish under control'],
    dosage: `2 sets of 8 dry reps, 3 days a week; any throws count toward your plan. ${PITCHING_LOAD_NOTE}`,
    regression: 'Hold leg lift only, without continuing the delivery.',
    progression: 'Shorter holds, then normal tempo with a controlled finish.',
    completion: 'Both holds steady on 8 of 8 reps in a set.',
    reassessment: 'Delivery balance is rated again with the whole body in frame.',
  },
  {
    key: 'pit-tempo-count',
    version: 1,
    discipline: 'pitching',
    name: 'Rhythm count deliveries',
    pillars: ['movement_timing'],
    findings: ['pit_delivery_event_repeatability', 'pit_fc_to_release_ms', 'pit_timing_consistency_ms'],
    purpose: 'Move through the delivery’s checkpoints with the same rhythm every time.',
    equipment: ['phone for video (optional)'],
    requires: [],
    setup: 'Choose a simple spoken count for your delivery, such as “and-one-two”, matched to your first move, leg lift and landing.',
    steps: [
      'Do dry deliveries saying the count out loud.',
      'Make easy throws with the count said silently.',
      'Film a few throws and check that the checkpoints line up with the count.',
    ],
    cues: ['Same count every time', 'Don’t rush the last part'],
    dosage: `10 dry reps plus your planned throws, 2–3 days a week. ${PITCHING_LOAD_NOTE}`,
    regression: 'Dry reps only, with the count out loud.',
    progression: 'Use the count from the stretch as well as the windup.',
    completion: 'Filmed deliveries match the count on most reps.',
    reassessment: 'Rhythm repeatability is rated again; timing estimates are compared only within similar clips.',
  },
  {
    key: 'pit-checkpoint-freeze',
    version: 1,
    discipline: 'pitching',
    name: 'Checkpoint freeze',
    pillars: ['movement_timing', 'arm_delivery'],
    findings: ['pit_delivery_event_repeatability', 'pit_event_position_repeatability'],
    purpose: 'Feel the positions at foot landing and release by pausing there in dry work.',
    equipment: ['towel (optional)', 'mirror or phone'],
    requires: [],
    setup: 'Dry work with no ball. A towel held in the throwing hand is optional.',
    steps: [
      'Deliver slowly and freeze for two seconds at front-foot landing.',
      'Check the position in a mirror or on video.',
      'Repeat, then freeze at the point where you would release.',
    ],
    cues: ['Same landing picture', 'Same release picture'],
    dosage: '2 sets of 6 slow reps per checkpoint, 3 days a week (dry, no throwing)',
    regression: 'Freeze at landing only.',
    progression: 'Freeze briefly, then finish the delivery at normal tempo without a ball.',
    completion: 'The frozen positions look the same on 6 of 6 reps.',
    reassessment: 'Positions at landing and release are rated again from the same camera view.',
  },
  {
    key: 'pit-mirror-arm-path',
    version: 1,
    discipline: 'pitching',
    name: 'Mirror arm-path work',
    pillars: ['arm_delivery'],
    findings: ['pit_arm_path_consistency'],
    purpose: 'See and repeat the same arm route without the demands of throwing.',
    equipment: ['mirror or phone', 'towel (optional)'],
    requires: [],
    setup: 'Stand side-on to a mirror or camera.',
    steps: [
      'Make slow arm actions from hand break to the release point.',
      'Watch the route and keep it the same each time.',
      'Increase to a comfortable tempo only when the route stays the same.',
    ],
    cues: ['Same route, slow then smooth'],
    dosage: '2 sets of 10 slow reps, 3–4 days a week (dry, no throwing)',
    regression: 'Even slower reps, stopping halfway to check the position.',
    progression: 'Compare the dry route with filmed easy throws.',
    completion: 'The route looks the same on 10 of 10 slow reps.',
    reassessment: 'Arm-path consistency is rated again from the same camera view. This drill makes no claim about arm health.',
  },
  {
    key: 'pit-release-window',
    version: 1,
    discipline: 'pitching',
    name: 'Release-window target throws',
    pillars: ['arm_delivery', 'pitch_performance'],
    findings: ['pit_release_consistency', 'pit_target_hit'],
    purpose: 'Repeat the release while aiming at a small target at reduced intensity.',
    equipment: ['target (net, towel on a fence, or a catcher)', 'balls'],
    requires: [],
    setup: 'Choose a target at your normal throwing distance for this phase of your plan.',
    steps: [
      'Pick the exact spot before each throw.',
      'Throw at reduced intensity and chart hit or miss.',
      'After misses, take a dry rep before the next throw.',
    ],
    cues: ['Pick a small spot', 'Same release, every throw'],
    dosage: `Within your planned throws for the day, 2 days a week. ${PITCHING_LOAD_NOTE}`,
    regression: 'Larger target at a shorter distance within your plan.',
    progression: 'Smaller target, then the same work during a bullpen with no added pitches.',
    completion: 'Hit rate on the chart rises to the level you and your coach set for this block.',
    reassessment: 'Release consistency is rated again and target-hit rate is charted with the same definition.',
  },
  {
    key: 'pit-quadrant-charting',
    version: 1,
    discipline: 'pitching',
    name: 'Quadrant-charted bullpen',
    pillars: ['pitch_performance'],
    findings: ['pit_target_hit', 'pit_strike'],
    purpose: 'Chart targets and strikes separately for each pitch type during a planned bullpen.',
    equipment: ['catcher or target', 'chart (paper or phone)'],
    requires: [],
    setup: 'Use your normal planned bullpen. Before each pitch, the catcher or coach announces the target quadrant.',
    steps: [
      'Throw your planned pitches only; do not add pitches for charting.',
      'Chart each pitch: pitch type, strike yes/no, target hit yes/no.',
      'At the end, total strikes and targets separately for each pitch type.',
    ],
    cues: ['Announce the target first', 'Chart every pitch honestly'],
    dosage: 'One charted bullpen a week, inside the pitch count your coach already planned; no added pitches',
    regression: 'Chart halves of the zone instead of quadrants.',
    progression: 'Add a hitter standing in (no swing) for realism, with no added pitches.',
    completion: 'A complete chart exists for each bullpen in the block.',
    reassessment: 'Strike rate and target-hit rate are charted again with the same definitions.',
  },
  {
    key: 'pit-pitch-pairing',
    version: 1,
    discipline: 'pitching',
    name: 'Pitch-pairing sequences',
    pillars: ['pitch_performance', 'arm_delivery'],
    findings: ['pit_target_hit', 'pit_strike', 'pit_arm_path_consistency'],
    purpose: 'Keep the same delivery and arm route when alternating pitch types.',
    equipment: ['catcher or target'],
    requires: [],
    setup: 'Pick two pitch types from your plan, for example a fastball and a changeup.',
    steps: [
      'Alternate the two pitch types within your planned bullpen.',
      'Chart strikes and targets for each pitch type separately.',
      'Film a few of each and compare the arm route between the two pitches.',
    ],
    cues: ['Same arm, different grip'],
    dosage: 'Within one planned bullpen a week; no added pitches',
    regression: 'Throw three of one pitch, then three of the other.',
    progression: 'Random order called by the catcher.',
    completion: 'Both pitch types charted in each bullpen of the block.',
    reassessment: 'Pitch-type summaries are compared only with the same pitch types and definitions.',
  },
  {
    key: 'pit-measured-bullpen',
    version: 1,
    discipline: 'pitching',
    name: 'Measured bullpen check-in',
    pillars: ['pitch_performance'],
    findings: ['pit_velocity_mph', 'pit_spin_rate_rpm', 'pit_horizontal_break_in', 'pit_vertical_break_in'],
    purpose: 'Record pitch data with the same device and setup, without changing the bullpen to chase numbers.',
    equipment: ['radar or pitch-tracking device'],
    requires: ['radar'],
    setup: 'Set the device up the same way each time and write down where it was placed.',
    steps: [
      'Throw your normal planned bullpen.',
      'Record readings for every pitch, keeping pitch types separate.',
      'Note anything unusual (cold weather, a different mound, fatigue).',
    ],
    cues: ['Same device, same setup', 'Throw your plan, not the number'],
    dosage: 'Once every two weeks, inside a bullpen already in your throwing plan; no added pitches',
    regression: 'Measure only one pitch type.',
    progression: 'Measure every pitch type in the plan.',
    completion: 'Readings recorded for each planned pitch with the same device setup.',
    reassessment: 'Velocity, spin and movement are compared only with readings from the same device and pitch type.',
  },
];

export const DRILLS: readonly DrillDefinition[] = DRILL_LIST;

export function drill(key: string, version?: number): DrillDefinition | undefined {
  return DRILL_LIST.find((item) => item.key === key && (version === undefined || item.version === version));
}

export function drillsFor(discipline: Discipline): readonly DrillDefinition[] {
  return DRILL_LIST.filter((item) => item.discipline === discipline);
}
