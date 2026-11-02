/**
 * Program areas (two-digit CIP families), as College Scorecard names them, in
 * catalog order. Must match public.program_areas exactly (contract test in
 * tests/contract/catalog-sync.test.ts). Used by the "Majors offered" filter
 * and the school page. Pure data; safe on the client.
 */

export const PROGRAM_AREAS = [
  ['agriculture', 'Agriculture'],
  ['resources', 'Natural resources and conservation'],
  ['architecture', 'Architecture'],
  ['ethnic_cultural_gender', 'Area, ethnic, cultural and gender studies'],
  ['communication', 'Communication and journalism'],
  ['communications_technology', 'Communications technologies'],
  ['computer', 'Computer and information sciences'],
  ['personal_culinary', 'Personal and culinary services'],
  ['education', 'Education'],
  ['engineering', 'Engineering'],
  ['engineering_technology', 'Engineering technologies'],
  ['language', 'Foreign languages and linguistics'],
  ['family_consumer_science', 'Family and consumer sciences'],
  ['legal', 'Legal studies'],
  ['english', 'English language and literature'],
  ['humanities', 'Liberal arts and humanities'],
  ['library', 'Library science'],
  ['biological', 'Biological and biomedical sciences'],
  ['mathematics', 'Mathematics and statistics'],
  ['military', 'Military technologies'],
  ['multidiscipline', 'Multi- and interdisciplinary studies'],
  ['parks_recreation_fitness', 'Parks, recreation, leisure, fitness and kinesiology'],
  ['philosophy_religious', 'Philosophy and religious studies'],
  ['theology_religious_vocation', 'Theology and religious vocations'],
  ['physical_science', 'Physical sciences'],
  ['science_technology', 'Science technologies'],
  ['psychology', 'Psychology'],
  ['security_law_enforcement', 'Homeland security, law enforcement and firefighting'],
  ['public_administration_social_service', 'Public administration and social services'],
  ['social_science', 'Social sciences'],
  ['construction', 'Construction trades'],
  ['mechanic_repair_technology', 'Mechanic and repair technologies'],
  ['precision_production', 'Precision production'],
  ['transportation', 'Transportation and materials moving'],
  ['visual_performing', 'Visual and performing arts'],
  ['health', 'Health professions'],
  ['business_marketing', 'Business, management and marketing'],
  ['history', 'History'],
] as const;

export type ProgramArea = (typeof PROGRAM_AREAS)[number][0];
export const PROGRAM_AREA_CODES: readonly ProgramArea[] = PROGRAM_AREAS.map(([code]) => code);

/** Choices for the filter, alphabetical by name. */
export const PROGRAM_AREA_CHOICES: readonly (readonly [ProgramArea, string])[] = [...PROGRAM_AREAS].sort((a, b) => a[1].localeCompare(b[1], 'en'));

export function isProgramArea(value: string): value is ProgramArea {
  return (PROGRAM_AREA_CODES as readonly string[]).includes(value);
}

export function programAreaName(code: ProgramArea): string {
  return PROGRAM_AREAS.find(([c]) => c === code)?.[1] ?? code;
}
