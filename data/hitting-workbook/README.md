# Hitting Development Workbook

`Baseball_Hitting_Development_Workbook.xlsx` is Base Recruits' hitting workbook (27 sheets, written by Base Recruits; drills and targets reviewed by Base Recruits
hitting coaches, 2026-10-28), stored as the content
source for the Assessment drill library, swing-flaw guide, session templates and home-practice guide (decisions F38 and
F39, `docs/assessment.md` section 11).

- This copy has the founder's requested changes (2026-10-28): every drill has a new generic name, and every outside
  organisation's name and web link was removed. The "Sources" sheet is now "Basis & Limits".
- It contains no player data; the player and log sheets are blank templates.
- SHA-256: `7f88703f904b819462de23fefd2cdbf54998f3cd19bf76b2fad0c0ba993ecc75`

To refresh the site content after a new revision of the workbook:

```bash
python3 -I scripts/hitting-workbook/extract.py data/hitting-workbook/Baseball_Hitting_Development_Workbook.xlsx
```

A changed drill name or new drill also needs a migration for `public.assessment_drills`; the contract test
(`tests/contract/assessment-catalog.test.ts`) fails until the database and the TypeScript catalog agree.

## Hitting Master Workbook

`Baseball_Hitting_Master_Workbook.xlsx` (7 sheets, compiled 2026-11-01) is the founder's master hitting workbook: 69
drills by body area, six coach stage cards, the paired practice plan, video-review notes and blank training logs. It
is the content source for the Master Workbook drills (`hit-mw01` … `hit-mw69`) and the six-stage progression (decision
F56, `docs/assessment.md` section 11b).

- This copy has the founder's requested changes (2026-11-02): every drill has a generic name in place of its branded
  name, and every outside organisation's name, link and source reference was removed. The "Sources" sheet is now
  "Basis & Limits".
- It contains no player data; the training logs are blank templates.
- SHA-256: `3eef391b549e791d9ad745a44830e9d3656be0ab87e4e57c1539bb3de180eb31`

To refresh the site content after a new revision of the workbook:

```bash
python3 -I scripts/hitting-workbook/extract_master.py data/hitting-workbook/Baseball_Hitting_Master_Workbook.xlsx
```

A changed drill name or new drill also needs a migration for `public.assessment_drills`.
