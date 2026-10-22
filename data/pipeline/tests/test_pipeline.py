"""Tests for the registry pipeline, using real rows captured from the sources.

Run: python3 -m unittest discover -s data/pipeline/tests -t .
"""

from __future__ import annotations

import copy
import io
import json
import unittest
import zipfile
from pathlib import Path

from data.pipeline import build, eada, scorecard
from data.pipeline.mappings import EADA_CLASSIFICATIONS

# Raw rows for a few institutions, saved by the data-refresh workflow straight
# from the sources (EADA schools.xlsx rows for baseball and softball, and the
# College Scorecard API records the pipeline requested).
CAPTURE = json.loads((Path(__file__).parent / "fixtures" / "source_capture.json").read_text())
ALL_EADA_ROWS = CAPTURE["eada_rows"]
EADA_ROWS = sorted((r for r in ALL_EADA_ROWS if r["Sports"] == "Baseball"), key=lambda r: r["unitid"])
SCORECARD = {r["id"]: r for r in CAPTURE["scorecard_records"]}
YEARS = CAPTURE["years"]


class EadaTests(unittest.TestCase):
    def test_baseball_rows_become_programs_with_season_and_classification(self):
        programs, issues = eada.baseball_programs(ALL_EADA_ROWS, "2024-25")
        self.assertEqual(issues, [])
        self.assertEqual([p["unitid"] for p in programs], [r["unitid"] for r in EADA_ROWS])
        self.assertIn(100654, [p["unitid"] for p in programs])
        aamu = programs[0]
        self.assertEqual(aamu["name"], "Alabama A & M University")
        self.assertEqual(aamu["state"], "AL")
        self.assertEqual(aamu["control"], "public")
        self.assertEqual(aamu["baseball"], {
            "season": "2024-25", "association": "ncaa", "division": "ncaa_d1", "classification_code": 2,
            "classification_name": "NCAA Division I-FCS", "classification_other": None, "participants": 47,
        })
        uah = next(p for p in programs if p["unitid"] == 100706)
        self.assertEqual(uah["baseball"]["division"], "ncaa_d2")  # NCAA Division II without football
        self.assertTrue(any(r["Sports"] == "Softball" for r in ALL_EADA_ROWS), "fixture includes other sports")

    def test_every_classification_in_the_2024_25_release_is_mapped(self):
        # Codes present in EADA_2024-2025 instLevel.xlsx (11 is unused).
        observed = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20}
        self.assertTrue(observed <= set(EADA_CLASSIFICATIONS))

    def test_other_sports_unknown_codes_and_empty_teams_are_not_programs(self):
        rows = copy.deepcopy(EADA_ROWS[:4])
        rows[0]["Sports"] = "Softball"            # another sport's row
        rows[1]["ClassificationCode"] = 99         # a code EADA might add later
        rows[2]["SUM_PARTIC_MEN"] = 0              # a listed team with no participants
        programs, issues = eada.baseball_programs(rows, "2024-25")
        self.assertEqual([p["unitid"] for p in programs], [rows[3]["unitid"]])
        self.assertEqual(sorted(i.code for i in issues), ["no_participants", "unknown_classification"])

    def test_duplicate_rows_keep_one_program(self):
        programs, issues = eada.baseball_programs([EADA_ROWS[0], EADA_ROWS[0]], "2024-25")
        self.assertEqual(len(programs), 1)
        self.assertEqual([i.code for i in issues], ["duplicate_row"])

    def test_reads_the_per_sport_workbook_from_the_release_zip(self):
        import openpyxl
        header = list(EADA_ROWS[0].keys())
        rows_in = EADA_ROWS[:4]
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.append(header)
        for row in rows_in:
            sheet.append([row[h] for h in header])
        buffer = io.BytesIO()
        workbook.save(buffer)
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as z:
            z.writestr("schools.xlsx", buffer.getvalue())
        rows = list(eada.read_sports_rows(archive.getvalue()))
        self.assertEqual(rows[0]["institution_name"], "Alabama A & M University")
        self.assertEqual(len(rows), len(rows_in))

        sheet.delete_cols(header.index("Sports") + 1)
        buffer = io.BytesIO()
        workbook.save(buffer)
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as z:
            z.writestr("schools.xlsx", buffer.getvalue())
        with self.assertRaisesRegex(ValueError, "missing columns"):
            list(eada.read_sports_rows(archive.getvalue()))

    def test_picks_the_per_sport_release_for_a_year(self):
        listing = [
            {"FileName": "EADA_2023-2024.zip", "Year": 2024},
            {"FileName": "EADA_All_Data_Combined_2024-2025_SAS_SPSS_EXCEL.zip", "Year": 2025},
            {"FileName": "EADA_2024-2025.zip", "Year": 2025},
        ]
        self.assertEqual(eada.latest_year(listing), 2025)
        self.assertEqual(eada.pick_year_file(listing, 2025)["FileName"], "EADA_2024-2025.zip")
        with self.assertRaises(LookupError):
            eada.pick_year_file(listing, 2026)


class ScorecardTests(unittest.TestCase):
    def test_chooses_the_newest_year_with_coverage_per_group(self):
        records = list(SCORECARD.values())
        years = YEARS
        self.assertEqual(scorecard.choose_year(records, years, "admissions.admission_rate.overall"), 2024)
        self.assertEqual(scorecard.choose_year(records, years, "cost.attendance.academic_year"), 2025)
        self.assertIsNone(scorecard.choose_year([], years, "student.size"))

    def test_normalizes_institution_admissions_and_costs_with_year_labels(self):
        result, issues = scorecard.normalize(SCORECARD[100654], 2024, 2025, 2024)
        self.assertEqual(issues, [])
        facts = result["facts"]
        self.assertEqual(facts["name"], "Alabama A & M University")
        self.assertEqual(facts["aliases"], ["AAMU"])
        self.assertEqual(facts["website_url"], "https://www.aamu.edu/")
        self.assertEqual((facts["control"], facts["level"], facts["setting"]), ("public", "four_year", "city"))
        self.assertEqual(facts["undergraduate_enrollment"], {"term": "Fall 2024", "scorecard_year": 2024, "value": 6124})
        self.assertEqual(result["admissions"]["term"], "Fall 2024")
        self.assertEqual(result["admissions"]["admission_rate"], 0.5795)
        self.assertEqual(result["admissions"]["test_policy"], "considered_not_required")
        self.assertEqual(result["admissions"]["sat_math_25"], 390)
        self.assertIsNotNone(result["admissions"]["sat_math_75"])
        self.assertEqual(result["costs"]["academic_year"], "2025-26")
        self.assertEqual(result["costs"]["cost_of_attendance"], 27732)

    def test_test_blind_and_required_policies(self):
        berkeley, _ = scorecard.normalize(SCORECARD[110635], 2024, 2025, 2024)
        self.assertEqual(berkeley["admissions"]["test_policy"], "not_considered")
        harvard, _ = scorecard.normalize(SCORECARD[166027], 2024, 2025, 2024)
        self.assertEqual(harvard["admissions"]["test_policy"], "required")

    def test_open_admission_college_has_no_admissions_section(self):
        lbcc, issues = scorecard.normalize(SCORECARD[117645], 2024, 2025, 2024)
        self.assertIsNone(lbcc["admissions"])
        self.assertEqual(lbcc["costs"]["cost_of_attendance"], 11020)
        self.assertEqual(lbcc["facts"]["level"], "two_year")
        self.assertEqual(issues, [])

    def test_unmapped_codes_and_inconsistent_scores_are_reported_not_guessed(self):
        record = copy.deepcopy(SCORECARD[199120])
        record["2024.admissions.test_requirements"] = 2          # pre-2024 meaning ("recommended")
        record["2024.admissions.sat_scores.25th_percentile.math"] = 790
        record["2024.admissions.sat_scores.75th_percentile.math"] = 700
        result, issues = scorecard.normalize(record, 2024, 2025, 2024)
        self.assertIsNone(result["admissions"]["test_policy"])
        self.assertIsNone(result["admissions"]["sat_math_25"])
        self.assertIsNone(result["admissions"]["sat_math_75"])
        self.assertEqual(sorted(code for code, _ in issues), ["inconsistent_scores", "unmapped_test_policy"])

    def test_fetches_in_batches_of_one_hundred(self):
        calls = []

        def fake(url, params):
            ids = params["id"].split(",")
            calls.append(len(ids))
            return {"results": [{"id": int(i)} for i in ids]}

        results = scorecard.fetch_all(list(range(1, 251)), [2025, 2024], fake)
        self.assertEqual(calls, [100, 100, 50])
        self.assertEqual(len(results), 250)


class SnapshotFormatTests(unittest.TestCase):
    def test_dump_is_valid_json_with_one_record_per_line(self):
        snapshot = {"format": build.FORMAT, "summary": {"programs": 2}, "issues": [],
                    "records": [{"unitid": 1, "b": [1]}, {"unitid": 2}]}
        text = build.dump(snapshot)
        self.assertEqual(json.loads(text), snapshot)
        self.assertIn('\n  {"b":[1],"unitid":1},\n  {"unitid":2}\n', text)


if __name__ == "__main__":
    unittest.main()
