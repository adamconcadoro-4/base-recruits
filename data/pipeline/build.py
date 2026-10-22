"""Build a registry snapshot from the official sources.

    COLLEGE_SCORECARD_API_KEY=… python3 -m data.pipeline.build --out data/snapshots/registry.json

The snapshot records where every section came from (source, dataset, year,
retrieval time, file checksum) so the app can label each figure and an
administrator can review exactly what would change before publishing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from . import eada, scorecard

FORMAT = "base-recruits.registry-snapshot/1"
USER_AGENT = "BaseRecruitsRegistryPipeline/1 (+https://github.com/adamconcadoro-4/base-recruits)"


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _get(url: str, params: dict[str, str] | None = None, attempts: int = 4) -> bytes:
    full = url + ("?" + urllib.parse.urlencode(params, safe=",.") if params else "")
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(full, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=300) as response:
                return response.read()
        except Exception as error:  # network errors are retried, then raised without the URL (it may hold a key)
            if attempt == attempts:
                raise RuntimeError(f"request to {url} failed after {attempts} attempts: {type(error).__name__}") from None
            time.sleep(5 * attempt)
    raise AssertionError("unreachable")


def build(api_key: str, eada_year: int | None = None, capture: set[int] | None = None) -> dict[str, Any]:
    file_list = json.loads(_get(eada.API + "dataFiles/fileList"))
    year = eada_year or eada.latest_year(file_list)
    entry = eada.pick_year_file(file_list, year)
    eada_retrieved = _now()
    zip_bytes = _get(eada.file_url(entry["FileName"]))
    season = f"{year - 1}-{str(year)[-2:]}"
    all_rows = list(eada.read_sports_rows(zip_bytes))
    programs, eada_issues = eada.baseball_programs(all_rows, season)

    unitids = [p["unitid"] for p in programs]
    candidate_years = [year + 1, year, year - 1, year - 2]
    scorecard_retrieved = _now()
    records = scorecard.fetch_all(
        unitids, candidate_years,
        lambda url, params: json.loads(_get(url, {**params, "api_key": api_key})),
    )
    by_id = {r["id"]: r for r in records if isinstance(r.get("id"), int)}
    found = list(by_id.values())
    admissions_year = scorecard.choose_year(found, candidate_years, "admissions.admission_rate.overall")
    cost_year = scorecard.choose_year(found, candidate_years, "cost.tuition.in_state")
    enrollment_year = scorecard.choose_year(found, candidate_years, "student.size")

    out_records: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = [
        {"unitid": i.unitid, "source": "eada", "code": i.code, "detail": i.detail} for i in eada_issues
    ]
    for program in programs:
        unitid = program["unitid"]
        record: dict[str, Any] = {
            "unitid": unitid,
            "baseball": program["baseball"],
        }
        source_record = by_id.get(unitid)
        if source_record is None:
            issues.append({"unitid": unitid, "source": "college_scorecard", "code": "not_in_scorecard",
                           "detail": "no College Scorecard record; institution facts come from EADA"})
            record["institution_source"] = "eada"
            record["facts"] = {
                "name": program["name"], "aliases": [], "city": program["city"], "state": program["state"],
                "zip": program["zip"], "ope8_id": program["ope8_id"], "website_url": None,
                "price_calculator_url": None, "control": program["control"], "level": program["level"],
                "predominant_degree": None, "setting": None, "latitude": None, "longitude": None,
                "undergraduate_enrollment": None,
            }
            record["admissions"] = None
            record["costs"] = None
        else:
            normalized, record_issues = scorecard.normalize(source_record, admissions_year, cost_year, enrollment_year)
            record["institution_source"] = "college_scorecard"
            record.update(normalized)
            if not record["facts"].get("name"):
                record["facts"]["name"] = program["name"]
            issues.extend({"unitid": unitid, "source": "college_scorecard", "code": c, "detail": d} for c, d in record_issues)
        out_records.append(record)

    captured = None
    if capture:
        captured = {
            "eada_rows": [r for r in all_rows if r.get("unitid") in capture and r.get("Sports") in ("Baseball", "Softball")],
            "scorecard_records": [by_id[u] for u in sorted(capture) if u in by_id],
            "years": candidate_years,
        }

    records_json = json.dumps(out_records, sort_keys=True, separators=(",", ":")).encode()
    return {
        "format": FORMAT,
        "generated_at": _now(),
        "content_sha256": hashlib.sha256(records_json).hexdigest(),
        "sources": [
            {
                "id": "eada",
                "dataset": entry["FileName"],
                "label": entry.get("LinkName"),
                "season": season,
                "url": eada.file_url(entry["FileName"]),
                "homepage": eada.HOMEPAGE,
                "retrieved_at": eada_retrieved,
                "sha256": hashlib.sha256(zip_bytes).hexdigest(),
                "bytes": len(zip_bytes),
            },
            {
                "id": "college_scorecard",
                "dataset": "College Scorecard API v1, institution data",
                "url": scorecard.API,
                "homepage": scorecard.HOMEPAGE,
                "retrieved_at": scorecard_retrieved,
                "years": {"admissions": admissions_year, "costs": cost_year, "enrollment": enrollment_year},
            },
        ],
        "summary": {
            "programs": len(out_records),
            "with_scorecard_record": sum(1 for r in out_records if r["institution_source"] == "college_scorecard"),
            "with_admissions": sum(1 for r in out_records if r.get("admissions")),
            "with_admission_rate": sum(1 for r in out_records if (r.get("admissions") or {}).get("admission_rate") is not None),
            "with_sat": sum(1 for r in out_records if (r.get("admissions") or {}).get("sat_math_25") is not None),
            "with_act": sum(1 for r in out_records if (r.get("admissions") or {}).get("act_composite_25") is not None),
            "with_costs": sum(1 for r in out_records if r.get("costs")),
            "by_association": _count(r["baseball"]["association"] for r in out_records),
            "by_division": _count(r["baseball"]["division"] for r in out_records),
            "test_policy": _count((r.get("admissions") or {}).get("test_policy") or "none" for r in out_records),
            "issues": _count(i["code"] for i in issues),
        },
        "issues": issues,
        "records": out_records,
        **({"_captured": captured} if captured else {}),
    }


def dump(snapshot: dict[str, Any]) -> str:
    """Readable header, then one record per line so refreshes diff cleanly."""
    head = {k: v for k, v in snapshot.items() if k not in ("issues", "records", "_captured")}
    lines = [json.dumps(head, indent=1, ensure_ascii=False)[:-2] + ","]
    for key in ("issues", "records"):
        items = snapshot[key]
        lines.append(f' "{key}": [')
        for index, item in enumerate(items):
            comma = "," if index < len(items) - 1 else ""
            lines.append("  " + json.dumps(item, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + comma)
        lines.append(" ]" + ("," if key == "issues" else ""))
    lines.append("}")
    return "\n".join(lines) + "\n"


def _count(values) -> dict[str, int]:
    counts: dict[str, int] = {}
    for value in values:
        counts[str(value)] = counts.get(str(value), 0) + 1
    return dict(sorted(counts.items()))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True)
    parser.add_argument("--eada-year", type=int, help="academic year ending (2025 = 2024-25); default: newest")
    parser.add_argument("--capture", help="comma-separated unit ids whose raw source rows are saved as test fixtures")
    parser.add_argument("--capture-out", help="file for the captured raw rows (JSON)")
    args = parser.parse_args(argv)
    api_key = os.environ.get("COLLEGE_SCORECARD_API_KEY", "").strip()
    if not api_key:
        print("COLLEGE_SCORECARD_API_KEY is not set", file=sys.stderr)
        return 2
    capture = {int(u) for u in args.capture.split(",")} if args.capture else None
    snapshot = build(api_key, args.eada_year, capture)
    captured = snapshot.pop("_captured", None)
    text = dump(snapshot)
    if api_key in text:
        raise RuntimeError("refusing to write a snapshot that contains the API key")
    with open(args.out, "w", encoding="utf-8") as handle:
        handle.write(text)
    if captured and args.capture_out:
        source_note = {
            "eada": snapshot["sources"][0]["url"],
            "college_scorecard": snapshot["sources"][1]["url"],
            "retrieved_at": snapshot["generated_at"],
        }
        captured_text = json.dumps({"_source": source_note, **captured}, indent=1, ensure_ascii=False, default=str) + "\n"
        if api_key in captured_text:
            raise RuntimeError("refusing to write fixtures that contain the API key")
        os.makedirs(os.path.dirname(os.path.abspath(args.capture_out)), exist_ok=True)
        with open(args.capture_out, "w", encoding="utf-8") as handle:
            handle.write(captured_text)
    print(json.dumps(snapshot["summary"], indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
