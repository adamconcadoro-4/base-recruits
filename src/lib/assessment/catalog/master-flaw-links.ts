/**
 * Master Workbook drills that can help with each swing flaw in the
 * swing-flaw guide (T01–T18), most direct first (decision F56).
 *
 * The Master Workbook has its own flaw-to-drill sheet with different labels
 * (for example "candidate bat drag" or "front-leg collapse"). This table maps
 * those labels and each drill's purpose onto the site's 18 flaws. It is a
 * Base Recruits mapping for a coach to review, not part of either workbook.
 *
 * These drills are added after the Development Workbook's own drills for each
 * flaw, so suggestions keep preferring the coach-reviewed drills; the new ones
 * come up when those are already chosen or need something the athlete lacks.
 */

import type { FlawId } from '@/lib/assessment/catalog/flaws';

export const MASTER_FLAW_DRILLS: Readonly<Record<FlawId, readonly string[]>> = {
  // Front foot or hips pull away: landing control and a torso path that stays on line.
  T01: ['MW13', 'MW18', 'MW44'],
  // Diving: plateward head/torso movement and reaching away.
  T02: ['MW44', 'MW41', 'MW36'],
  // Casting / early reaching.
  T03: ['MW09', 'MW01', 'MW05'],
  // Hands and elbow drop with a barrel-path change.
  T04: ['MW03', 'MW08'],
  // Dip-and-lift: elbow drop plus posture dip-and-rise.
  T05: ['MW08', 'MW03', 'MW34'],
  // Pulling away early.
  T06: ['MW11', 'MW07', 'MW04'],
  // Lunging and stride-length control.
  T07: ['MW20', 'MW14', 'MW13'],
  // Staying back: moving into the front side with control.
  T08: ['MW25', 'MW15', 'MW33'],
  // Late: being loaded and ready on time.
  T09: ['MW47', 'MW46'],
  // Rolling over before contact.
  T10: ['MW11', 'MW02', 'MW06'],
  // Outer-half contact.
  T11: ['MW11', 'MW41'],
  // Rising early and pitch-height posture (high pitches).
  T12: ['MW39', 'MW17', 'MW36'],
  // Pitch-height posture (low pitches) and rolling over.
  T13: ['MW38', 'MW40', 'MW02'],
  // Disruptive head and posture movement before contact.
  T14: ['MW54', 'MW46', 'MW37', 'MW52'],
  // Pitch recognition and swing/take decisions.
  T15: ['MW57', 'MW55', 'MW56'],
  T16: ['MW57', 'MW55'],
  // Control that holds on the tee but not on a moving ball.
  T17: ['MW45', 'MW02', 'MW25'],
  // Control and balance at easy-to-moderate effort.
  T18: ['MW50', 'MW51', 'MW46'],
};
