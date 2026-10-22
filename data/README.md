# Registry data

Base Recruits lists a college baseball program only when an official source
says it exists. This folder holds the pipeline that reads those sources and the
snapshots it produces.

| Source | Publisher | What it supplies | Access |
| --- | --- | --- | --- |
| [EADA](https://ope.ed.gov/athletics/) — Equity in Athletics Data Analysis | U.S. Department of Education, Office of Postsecondary Education | Institutions that reported a men's baseball team for an academic year, the number of participants, and the institution's athletics classification (NCAA/NAIA/NJCAA/CCCAA/NWAC/…) | Public data file download (`EADA_YYYY-YYYY.zip`, per-sport workbook) |
| [College Scorecard](https://collegescorecard.ed.gov/) | U.S. Department of Education | Institution facts, admissions from IPEDS (fall entering class), published prices (academic year), undergraduate enrollment (fall) | Official API at api.data.gov with a key (`COLLEGE_SCORECARD_API_KEY`, stored only as a GitHub secret) |

## How a refresh works

1. Push a branch named `data/<anything>` (or run the **data-refresh** workflow on
   such a branch). GitHub's runners fetch the sources, build
   `snapshots/registry-<season>.json`, run the pipeline tests against the raw
   rows they just captured, and commit the result back to that branch.
2. Review the snapshot in a pull request (one record per line, so changes read
   as a normal diff) and merge it.
3. In the app, an administrator opens **Admin → School data**, stages the
   snapshot, reviews every new, changed and missing record, and publishes. A
   later restage of an earlier import is how a publish is rolled back.

Nothing in the pipeline writes to a database, and no step publishes without an
administrator's review.

## What each snapshot records

* `sources[]` — dataset name, URL, retrieval time, checksum of the EADA file, and
  the College Scorecard data year chosen for each group of fields.
* `records[]` — one per institution with a reported men's baseball team:
  `baseball` (season, association, division, EADA classification, participants),
  `facts`, `admissions` (fall term) and `costs` (academic year), each `null` when
  the source does not report it.
* `issues[]` — anything the pipeline could not map or that looked wrong; these
  values are left blank, never guessed.

## Year labels

* EADA data is labelled by academic year (2024-25).
* College Scorecard admissions for data year *Y* describe the fall *Y* entering
  class; SAT/ACT percentiles are of enrolled first-time, degree-seeking students
  whose scores were used in the admission decision (IPEDS Admissions survey).
* College Scorecard prices for data year *Y* are for the *Y*–*Y+1* academic year.
* Average net price is not imported yet because its reference year could not be
  confirmed; the school's own net price calculator is linked instead.

## Running the tests

```bash
python3 -m unittest discover -s data/pipeline/tests -t .
```

The tests use `pipeline/tests/fixtures/source_capture.json`, raw rows saved by
the refresh workflow directly from the sources.
