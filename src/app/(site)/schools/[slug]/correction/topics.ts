/** What a correction report can be about (public.correction_topic). */
export const CORRECTION_TOPICS = {
  division: 'Baseball division or association',
  conference: 'Conference',
  baseball_links: 'Team, roster or recruiting questionnaire links',
  admissions: 'Admissions figures',
  test_policy: 'Testing policy',
  cost: 'Cost',
  school_details: 'School details (name, location, type)',
  other: 'Something else',
} as const;

export type CorrectionTopic = keyof typeof CORRECTION_TOPICS;
