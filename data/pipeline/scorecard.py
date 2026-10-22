"""College Scorecard adapter.

Source: the College Scorecard API (https://collegescorecard.ed.gov/data/api/),
served through api.data.gov with a key. Year-keyed fields follow IPEDS
collection years, which were checked against the published IPEDS survey
materials and known institutional figures before use:

* admissions.* for key Y describe applicants for the fall Y entering class
  (IPEDS Admissions; SAT/ACT percentiles are of enrolled first-time,
  degree-seeking students whose scores were used in the admission decision);
* cost.* for key Y describe the Y–(Y+1) academic year's published prices;
* student.size for key Y is fall Y undergraduate degree-seeking enrollment.

For each group the newest key with real coverage is chosen once for every
institution, so a page never mixes years inside one group.
"""

from __future__ import annotations

from typing import Any, Callable, Iterable

from .mappings import FIRST_TEST_POLICY_YEAR, LEVEL, OWNERSHIP, PREDOMINANT_DEGREE, TEST_POLICY_SINCE_2024, locale_setting

API = "https://api.data.gov/ed/collegescorecard/v1/schools"
HOMEPAGE = "https://collegescorecard.ed.gov/"
BATCH_SIZE = 100

STATIC_FIELDS = [
    "id", "ope8_id", "school.name", "school.alias", "school.city", "school.state", "school.zip",
    "school.school_url", "school.price_calculator_url", "school.ownership",
    "school.institutional_characteristics.level", "school.degrees_awarded.predominant", "school.locale",
    "location.lat", "location.lon",
]
ADMISSIONS_FIELDS = {
    "admission_rate": "admissions.admission_rate.overall",
    "sat_erw_25": "admissions.sat_scores.25th_percentile.critical_reading",
    "sat_erw_75": "admissions.sat_scores.75th_percentile.critical_reading",
    "sat_math_25": "admissions.sat_scores.25th_percentile.math",
    "sat_math_75": "admissions.sat_scores.75th_percentile.math",
    "act_composite_25": "admissions.act_scores.25th_percentile.cumulative",
    "act_composite_75": "admissions.act_scores.75th_percentile.cumulative",
    "test_policy_code": "admissions.test_requirements",
}
COST_FIELDS = {
    "cost_of_attendance": "cost.attendance.academic_year",
    "tuition_in_state": "cost.tuition.in_state",
    "tuition_out_of_state": "cost.tuition.out_of_state",
}
ENROLLMENT_FIELDS = {"undergraduate_enrollment": "student.size"}


def fields_for(years: Iterable[int]) -> list[str]:
    fields = list(STATIC_FIELDS)
    for year in years:
        for group in (ADMISSIONS_FIELDS, COST_FIELDS, ENROLLMENT_FIELDS):
            fields.extend(f"{year}.{path}" for path in group.values())
    return fields


def fetch_all(unitids: list[int], years: list[int], get_json: Callable[[str, dict[str, str]], dict[str, Any]]) -> list[dict[str, Any]]:
    """Every Scorecard record for the given IPEDS unit ids, in batches of 100."""
    results: list[dict[str, Any]] = []
    fields = ",".join(fields_for(years))
    for start in range(0, len(unitids), BATCH_SIZE):
        batch = unitids[start:start + BATCH_SIZE]
        page = get_json(API, {"id": ",".join(str(u) for u in batch), "fields": fields, "per_page": str(BATCH_SIZE)})
        results.extend(page.get("results", []))
    return results


def choose_year(records: list[dict[str, Any]], years: list[int], key_path: str, minimum_share: float = 0.25) -> int | None:
    """Newest year whose key field is present for at least `minimum_share` of records."""
    if not records:
        return None
    for year in sorted(years, reverse=True):
        present = sum(1 for r in records if r.get(f"{year}.{key_path}") is not None)
        if present / len(records) >= minimum_share:
            return year
    return None


def _url(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if not text.lower().startswith(("http://", "https://")):
        text = "https://" + text
    return text if " " not in text and "@" not in text.split("/")[2] else None


def _aliases(value: Any) -> list[str]:
    if not isinstance(value, str):
        return []
    seen: list[str] = []
    for part in value.replace("|", ",").split(","):
        alias = part.strip()
        if 2 <= len(alias) <= 120 and alias not in seen:
            seen.append(alias)
    return seen[:12]


def _int(value: Any) -> int | None:
    return int(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _rate(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 1:
        return round(float(value), 4)
    return None


def normalize(record: dict[str, Any], admissions_year: int | None, cost_year: int | None, enrollment_year: int | None) -> tuple[dict[str, Any], list[tuple[str, str]]]:
    """One Scorecard record -> institution facts, admissions and costs, plus issues."""
    issues: list[tuple[str, str]] = []
    facts: dict[str, Any] = {
        "name": record.get("school.name"),
        "aliases": _aliases(record.get("school.alias")),
        "city": record.get("school.city"),
        "state": record.get("school.state"),
        "zip": record.get("school.zip"),
        "ope8_id": record.get("ope8_id"),
        "website_url": _url(record.get("school.school_url")),
        "price_calculator_url": _url(record.get("school.price_calculator_url")),
        "control": OWNERSHIP.get(record.get("school.ownership")),
        "level": LEVEL.get(record.get("school.institutional_characteristics.level")),
        "predominant_degree": PREDOMINANT_DEGREE.get(record.get("school.degrees_awarded.predominant")),
        "setting": locale_setting(_int(record.get("school.locale"))),
        "latitude": record.get("location.lat") if isinstance(record.get("location.lat"), (int, float)) else None,
        "longitude": record.get("location.lon") if isinstance(record.get("location.lon"), (int, float)) else None,
    }

    enrollment = None
    if enrollment_year is not None:
        size = _int(record.get(f"{enrollment_year}.student.size"))
        if size is not None and size >= 0:
            enrollment = {"term": f"Fall {enrollment_year}", "scorecard_year": enrollment_year, "value": size}
    facts["undergraduate_enrollment"] = enrollment

    admissions = None
    if admissions_year is not None:
        raw = {name: record.get(f"{admissions_year}.{path}") for name, path in ADMISSIONS_FIELDS.items()}
        if any(v is not None for v in raw.values()):
            code = raw.pop("test_policy_code")
            policy = None
            if code is not None:
                if admissions_year >= FIRST_TEST_POLICY_YEAR and code in TEST_POLICY_SINCE_2024:
                    policy = TEST_POLICY_SINCE_2024[code]
                else:
                    issues.append(("unmapped_test_policy", f"test requirement code {code!r} for {admissions_year} is not mapped; left blank"))
            scores = {k: _int(v) for k, v in raw.items() if k != "admission_rate"}
            # Out-of-range values first, then pairs: a percentile without its
            # partner is dropped too, so the record always stays publishable.
            for key in ("sat_erw_25", "sat_erw_75", "sat_math_25", "sat_math_75"):
                if scores[key] is not None and not 200 <= scores[key] <= 800:
                    issues.append(("score_out_of_range", f"{key} = {scores[key]}; dropped"))
                    scores[key] = None
            for key in ("act_composite_25", "act_composite_75"):
                if scores[key] is not None and not 1 <= scores[key] <= 36:
                    issues.append(("score_out_of_range", f"{key} = {scores[key]}; dropped"))
                    scores[key] = None
            for low, high in (("sat_erw_25", "sat_erw_75"), ("sat_math_25", "sat_math_75"), ("act_composite_25", "act_composite_75")):
                if (scores[low] is None) != (scores[high] is None) or (scores[low] is not None and scores[low] > scores[high]):
                    issues.append(("inconsistent_scores", f"{low}/{high} = {scores[low]}/{scores[high]}; both dropped"))
                    scores[low] = scores[high] = None
            admissions = {
                "term": f"Fall {admissions_year}",
                "scorecard_year": admissions_year,
                "admission_rate": _rate(raw["admission_rate"]),
                "test_policy": policy,
                **scores,
            }
            if admissions["admission_rate"] is None and policy is None and all(v is None for v in scores.values()):
                admissions = None

    costs = None
    if cost_year is not None:
        values = {name: _int(record.get(f"{cost_year}.{path}")) for name, path in COST_FIELDS.items()}
        if any(v is not None for v in values.values()):
            costs = {"academic_year": f"{cost_year}-{str(cost_year + 1)[-2:]}", "scorecard_year": cost_year, **values}

    return {"facts": facts, "admissions": admissions, "costs": costs}, issues
