/**
 * Shapes returned by the registry's public read functions (see the Stage 2
 * migrations). Every figure travels with the term or academic year it
 * describes; a missing figure is null, never zero.
 */

export const DIVISION_CODES = [
  'ncaa_d1',
  'ncaa_d2',
  'ncaa_d3',
  'naia',
  'njcaa_d1',
  'njcaa_d2',
  'njcaa_d3',
  'cccaa',
  'nwac',
  'uscaa',
  'nccaa_d1',
  'nccaa_d2',
  'independent',
  'other',
] as const;
export type DivisionCode = (typeof DIVISION_CODES)[number];

export const CONTROLS = ['public', 'private_nonprofit', 'private_for_profit'] as const;
export type InstitutionControl = (typeof CONTROLS)[number];

export const LEVELS = ['four_year', 'two_year', 'less_than_two_year'] as const;
export type InstitutionLevel = (typeof LEVELS)[number];

export const SETTINGS = ['city', 'suburb', 'town', 'rural'] as const;
export type CampusSetting = (typeof SETTINGS)[number];

export const TEST_POLICIES = ['required', 'considered_not_required', 'not_considered'] as const;
export type TestPolicy = (typeof TEST_POLICIES)[number];

export const PROGRAM_STATUSES = ['active', 'not_reported', 'inactive', 'suspended'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const VERIFICATIONS = ['federal_report', 'association_directory', 'official_athletics_site'] as const;
export type ProgramVerification = (typeof VERIFICATIONS)[number];

export const SORTS = ['relevance', 'name', 'admission_rate', 'cost', 'enrollment'] as const;
export type SchoolSort = (typeof SORTS)[number];

/** One row of public.search_schools. */
export interface SchoolSummary {
  readonly slug: string;
  readonly name: string;
  readonly city: string | null;
  readonly state: string | null;
  readonly control: InstitutionControl | null;
  readonly level: InstitutionLevel | null;
  readonly setting: CampusSetting | null;
  readonly undergraduate_enrollment: number | null;
  readonly enrollment_term: string | null;
  readonly association_code: string;
  readonly association_short_name: string;
  readonly division_code: DivisionCode;
  readonly division_name: string;
  readonly two_year_association: boolean;
  readonly conference: string | null;
  readonly program_season: string;
  readonly verification: ProgramVerification;
  readonly admissions_term: string | null;
  readonly admission_rate: number | null;
  readonly sat_erw_25: number | null;
  readonly sat_erw_75: number | null;
  readonly sat_math_25: number | null;
  readonly sat_math_75: number | null;
  readonly act_composite_25: number | null;
  readonly act_composite_75: number | null;
  readonly test_policy: TestPolicy | null;
  readonly cost_year: string | null;
  readonly cost_of_attendance: number | null;
  readonly tuition_in_state: number | null;
  readonly tuition_out_of_state: number | null;
  readonly relevance: number;
  readonly total_count: number;
}

export interface SourceRef {
  readonly id: string;
  readonly name: string;
  readonly publisher: string;
  readonly attribution: string;
  readonly homepage_url: string | null;
  readonly dataset: string;
  readonly url: string;
  readonly retrieved_at: string;
}

/** public.get_school */
export interface SchoolRecord {
  readonly institution: {
    readonly slug: string;
    readonly unitid: number;
    readonly name: string;
    readonly city: string | null;
    readonly state: string | null;
    readonly zip: string | null;
    readonly website_url: string | null;
    readonly price_calculator_url: string | null;
    readonly control: InstitutionControl | null;
    readonly level: InstitutionLevel | null;
    readonly predominant_degree: string | null;
    readonly setting: CampusSetting | null;
    readonly undergraduate_enrollment: number | null;
    readonly enrollment_term: string | null;
    readonly aliases: readonly string[];
    readonly source: SourceRef;
  };
  readonly program: {
    readonly status: ProgramStatus;
    readonly status_note: string | null;
    readonly season: string;
    readonly association: { readonly code: string; readonly name: string; readonly short_name: string; readonly two_year: boolean };
    readonly division: { readonly code: DivisionCode; readonly name: string };
    readonly classification_label: string | null;
    readonly classification_other: string | null;
    readonly reported_participants: number | null;
    readonly conference: string | null;
    readonly athletics_url: string | null;
    readonly roster_url: string | null;
    readonly questionnaire_url: string | null;
    readonly verification: ProgramVerification;
    readonly verification_source_url: string | null;
    readonly verified_at: string;
    readonly source: SourceRef;
  } | null;
  readonly admissions: {
    readonly term: string;
    readonly admission_rate: number | null;
    readonly test_policy: TestPolicy | null;
    readonly sat_erw_25: number | null;
    readonly sat_erw_75: number | null;
    readonly sat_math_25: number | null;
    readonly sat_math_75: number | null;
    readonly act_composite_25: number | null;
    readonly act_composite_75: number | null;
    readonly score_cohort: string;
    readonly source: SourceRef;
  } | null;
  readonly costs: {
    readonly academic_year: string;
    readonly cost_of_attendance: number | null;
    readonly tuition_in_state: number | null;
    readonly tuition_out_of_state: number | null;
    readonly source: SourceRef;
  } | null;
}

export const APPLICANT_TYPES = ['first_year', 'transfer'] as const;
export type ApplicantType = (typeof APPLICANT_TYPES)[number];

/**
 * One row of public.current_admissions_policies: a testing policy checked by
 * an administrator against the school's official admissions page, for one
 * applicant type and entry year. Separate from the historical IPEDS policy in
 * SchoolSummary.test_policy, which describes a past entering class.
 */
export interface CurrentPolicy {
  readonly slug: string;
  readonly applicant_type: ApplicantType;
  /** The fall the applicant would enroll (2027 = entering fall 2027). */
  readonly entry_year: number;
  readonly test_policy: TestPolicy;
  readonly exceptions: string | null;
  readonly source_url: string;
  readonly source_title: string | null;
  readonly verified_at: string;
}

/** public.registry_coverage */
export interface RegistryCoverage {
  readonly active_programs: number;
  readonly programs_by_status: Readonly<Record<string, number>>;
  readonly by_division: readonly { readonly code: DivisionCode; readonly name: string; readonly association: string; readonly count: number }[];
  readonly seasons: readonly string[];
  readonly with_admission_rate: number;
  readonly with_test_scores: number;
  readonly with_test_policy: number;
  /** Schools with a first-year testing policy checked against an official page. */
  readonly with_current_test_policy?: number;
  readonly with_cost_of_attendance: number;
  readonly with_gpa: number;
  readonly four_year_without_admissions: number;
  readonly stale_admissions: number;
  readonly latest_admissions_term: string | null;
  readonly latest_cost_year: string | null;
  readonly association_or_school_verified: number;
  readonly federal_report_only: number;
  readonly reported_as_other?: number;
  readonly with_conference: number;
  readonly last_retrieved_at: string | null;
}
