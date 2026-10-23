"""EADA (Equity in Athletics Data Analysis) adapter.

Source: https://ope.ed.gov/athletics/ — the U.S. Department of Education's
public download of the athletics data institutions report each year. The site
lists its files at {API}dataFiles/fileList and serves each one at
{API}dataFiles/file?fileName=…; the per-sport workbook (schools.xlsx) has one
row per sport per institution.
"""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass
from typing import Any, Iterable, Iterator

from .mappings import EADA_CLASSIFICATIONS, EADA_SECTORS

API = "https://ope.ed.gov/athletics/api/"
HOMEPAGE = "https://ope.ed.gov/athletics/"


def file_url(file_name: str) -> str:
    from urllib.parse import quote
    return f"{API}dataFiles/file?fileName={quote(file_name)}"


def pick_year_file(file_list: list[dict[str, Any]], year: int) -> dict[str, Any]:
    """The per-sport release for the academic year ending in `year` (2025 -> 2024-25)."""
    wanted = f"EADA_{year - 1}-{year}.zip"
    for entry in file_list:
        if entry.get("FileName") == wanted:
            return entry
    raise LookupError(f"EADA has no file named {wanted}")


def latest_year(file_list: list[dict[str, Any]]) -> int:
    years = [int(e["Year"]) for e in file_list if str(e.get("FileName", "")).startswith("EADA_") and "Combined" not in e["FileName"]]
    if not years:
        raise LookupError("EADA file list has no per-sport releases")
    return max(years)


def read_sports_rows(zip_bytes: bytes) -> Iterator[dict[str, Any]]:
    """Rows of schools.xlsx inside the release zip, as dicts keyed by column name."""
    import openpyxl  # imported here so the pure functions below need no dependency

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        names = [n for n in archive.namelist() if n.lower().endswith("schools.xlsx")]
        if len(names) != 1:
            raise ValueError(f"expected exactly one schools.xlsx in the EADA zip, found {names}")
        workbook = openpyxl.load_workbook(io.BytesIO(archive.read(names[0])), read_only=True)
        sheet = workbook.worksheets[0]
        rows = sheet.iter_rows(values_only=True)
        header = [str(h).strip() for h in next(rows)]
        required = {"unitid", "OPEID", "institution_name", "city_txt", "state_cd", "zip_text",
                    "ClassificationCode", "classification_name", "ClassificationOther",
                    "sector_cd", "Sports", "PARTIC_MEN", "SUM_PARTIC_MEN"}
        missing = required - set(header)
        if missing:
            raise ValueError(f"EADA schools.xlsx is missing columns: {sorted(missing)}")
        for row in rows:
            yield dict(zip(header, row))


@dataclass(frozen=True)
class Issue:
    unitid: int | None
    code: str
    detail: str


def _clean(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def baseball_programs(rows: Iterable[dict[str, Any]], season: str) -> tuple[list[dict[str, Any]], list[Issue]]:
    """Men's baseball teams reported to EADA, one per institution.

    A team counts only when the institution reported at least one men's
    participant for baseball; a row with no participants is not a program.
    """
    programs: dict[int, dict[str, Any]] = {}
    issues: list[Issue] = []
    for row in rows:
        if _clean(row.get("Sports")) != "Baseball":
            continue
        unitid = row.get("unitid")
        if not isinstance(unitid, int):
            issues.append(Issue(None, "invalid_unitid", f"baseball row without a numeric unitid: {unitid!r}"))
            continue
        participants = row.get("SUM_PARTIC_MEN") or 0
        if not isinstance(participants, int) or participants <= 0:
            issues.append(Issue(unitid, "no_participants", "baseball row reports no men's participants; not listed as a program"))
            continue
        code = row.get("ClassificationCode")
        mapped = EADA_CLASSIFICATIONS.get(code) if isinstance(code, int) else None
        if mapped is None:
            issues.append(Issue(unitid, "unknown_classification", f"classification code {code!r} is not mapped"))
            continue
        if unitid in programs:
            issues.append(Issue(unitid, "duplicate_row", "more than one baseball row; kept the first"))
            continue
        association, division = mapped
        sector = row.get("sector_cd")
        control, level = EADA_SECTORS.get(sector, (None, None)) if isinstance(sector, int) else (None, None)
        programs[unitid] = {
            "unitid": unitid,
            "ope8_id": _clean(row.get("OPEID")),
            "name": _clean(row.get("institution_name")),
            "city": _clean(row.get("city_txt")),
            "state": _clean(row.get("state_cd")),
            "zip": _clean(row.get("zip_text")),
            "control": control,
            "level": level,
            "baseball": {
                "season": season,
                "association": association,
                "division": division,
                "classification_code": code,
                "classification_name": _clean(row.get("classification_name")),
                "classification_other": _clean(row.get("ClassificationOther")),
                "participants": participants,
            },
        }
    return [programs[k] for k in sorted(programs)], issues
