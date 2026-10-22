"""Code lists used to normalise source values. Every mapping is explicit; an
unknown code is reported, never guessed."""

from __future__ import annotations

# EADA "ClassificationCode" -> (association, division). The classification is
# the institution's athletics classification as reported to EADA; for NCAA
# Division I the FBS/FCS/no-football split is a football designation, so all
# three map to Division I for baseball. NAIA's legacy "Division I/II" labels
# and single-championship associations map to the association alone.
EADA_CLASSIFICATIONS: dict[int, tuple[str, str]] = {
    1: ("ncaa", "ncaa_d1"),   # NCAA Division I-FBS
    2: ("ncaa", "ncaa_d1"),   # NCAA Division I-FCS
    3: ("ncaa", "ncaa_d1"),   # NCAA Division I without football
    4: ("ncaa", "ncaa_d2"),   # NCAA Division II with football
    5: ("ncaa", "ncaa_d2"),   # NCAA Division II without football
    6: ("ncaa", "ncaa_d3"),   # NCAA Division III with football
    7: ("ncaa", "ncaa_d3"),   # NCAA Division III without football
    8: ("other", "other"),    # Other (see ClassificationOther)
    9: ("naia", "naia"),      # NAIA Division I
    10: ("naia", "naia"),     # NAIA Division II
    12: ("njcaa", "njcaa_d1"),
    13: ("njcaa", "njcaa_d2"),
    14: ("njcaa", "njcaa_d3"),
    15: ("nccaa", "nccaa_d1"),
    16: ("nccaa", "nccaa_d2"),
    17: ("cccaa", "cccaa"),
    18: ("independent", "independent"),
    19: ("nwac", "nwac"),
    20: ("uscaa", "uscaa"),
}

# College Scorecard school.ownership (IPEDS CONTROL).
OWNERSHIP = {1: "public", 2: "private_nonprofit", 3: "private_for_profit"}

# College Scorecard school.institutional_characteristics.level (IPEDS ICLEVEL).
LEVEL = {1: "four_year", 2: "two_year", 3: "less_than_two_year"}

# College Scorecard school.degrees_awarded.predominant (PREDDEG).
PREDOMINANT_DEGREE = {0: None, 1: "certificate", 2: "associate", 3: "bachelors", 4: "graduate"}

# NCES urban-centric locale codes (school.locale), grouped to the four settings.
def locale_setting(code: int | None) -> str | None:
    if code is None:
        return None
    return {1: "city", 2: "suburb", 3: "town", 4: "rural"}.get(code // 10)

# EADA "sector_cd" -> (control, level), used only when Scorecard has no record.
EADA_SECTORS = {
    1: ("public", "four_year"),
    2: ("private_nonprofit", "four_year"),
    3: ("private_for_profit", "four_year"),
    4: ("public", "two_year"),
    5: ("private_nonprofit", "two_year"),
    6: ("private_for_profit", "two_year"),
}

# College Scorecard admissions.test_requirements (IPEDS ADMCON7). The fall 2024
# IPEDS Admissions survey offers three answers: "Required to be considered for
# admission" (1), "Not required for admission, but considered if submitted"
# (5) and "Not considered for admission, even if submitted" (3). Codes from
# earlier collections meant different things, so only data years from 2024 on
# are mapped; anything else is reported as an issue, never guessed.
TEST_POLICY_SINCE_2024 = {
    1: "required",
    5: "considered_not_required",
    3: "not_considered",
}
FIRST_TEST_POLICY_YEAR = 2024
