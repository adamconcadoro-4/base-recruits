#!/usr/bin/env python3
"""
Extract the Hitting Development Workbook into versioned content for Base
Recruits Assessment (src/lib/assessment/hitting-workbook/content-v1.json).

    python3 -I scripts/hitting-workbook/extract.py data/hitting-workbook/Baseball_Hitting_Development_Workbook.xlsx

The workbook is read, never modified. Only the hitting drills (H01-H40), the
rehearsals (R01-R07) and the swing-flaw guide (T01-T18) are imported; the
medicine-ball, youth-game, warm-up and log sheets are not. Every record keeps
its source sheet and row. Counts are checked against what the workbook is
expected to contain, and the script stops if they differ or if any outside
organisation's name or a web link appears anywhere in the workbook (decision
F38). Requires openpyxl (developer tool only; the app and CI read the JSON).
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import openpyxl

EXPECTED = {'sheets': 27, 'drills': 40, 'rehearsals': 7, 'flaws': 18, 'workflow': 5}
VERSION = 'hitting-wb-v1'
HEADER_ROW = 5

# Names and links the founder asked to keep out of the workbook and the site.
FORBIDDEN = re.compile(
    r'driveline|cressey|little league|littleleague|nsca|\baap\b|nocsae|microsoft|https?://|www\.',
    re.IGNORECASE,
)


def text(value):
    return None if value is None else str(value).strip()


def table(ws, first_col='B'):
    """Rows under the header row whose first column holds an id."""
    header = [text(c.value) for c in ws[HEADER_ROW]]
    start = openpyxl.utils.column_index_from_string(first_col) - 1
    for row in ws.iter_rows(min_row=HEADER_ROW + 1):
        values = [text(c.value) for c in row]
        if not values[start]:
            continue
        yield row[start].row, {h: v for h, v in zip(header, values) if h}


def numbered(value):
    """'1) Do this. 2) Then that.' -> ['Do this.', 'Then that.']"""
    parts = [p.strip() for p in re.split(r'(?:^|\s)\d\)\s*', value or '') if p.strip()]
    return parts or ([value] if value else [])


def ids(value, prefix):
    return re.findall(prefix + r'\d{2}', value or '')


def main(path):
    data = Path(path).read_bytes()
    wb = openpyxl.load_workbook(path, data_only=False)
    names = [ws.title for ws in wb.worksheets]

    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                if isinstance(cell.value, str) and FORBIDDEN.search(cell.value):
                    sys.exit(f'Outside name or link in {ws.title}!{cell.coordinate}: {cell.value[:80]}')
        if any(link.target for link in getattr(ws, '_hyperlinks', []) if getattr(link, 'target', None)):
            sys.exit(f'External hyperlink in {ws.title}')

    out = {
        'version': VERSION,
        'source': {'file': Path(path).name, 'sha256': hashlib.sha256(data).hexdigest(), 'sheets': names},
    }

    out['drills'] = [{
        'sourceId': r['ID'], 'section': r['Section'], 'name': r['Drill'], 'level': r['Level'], 'purpose': r['Purpose'],
        'equipment': r['Equipment'], 'setup': r['Setup'], 'steps': numbered(r['Execution steps']), 'cue': r['Primary cue'],
        'suggestedRound': r['Suggested round'], 'mistake': r['Common mistake'], 'correction': r['Correction'],
        'easier': r['Easier version'], 'progression': r['Progression'], 'success': r['Success criteria / scoring'],
        'safety': r['Safety'], 'sourceSheet': 'Hitting Drills', 'sourceRow': n,
    } for n, r in table(wb['Hitting Drills'])]

    out['rehearsals'] = [{
        'sourceId': r['ID'], 'name': r['Activity'], 'purpose': r['Purpose'], 'equipment': r['Equipment'], 'how': r['How'],
        'cue': r['Cue'], 'feedsInto': ids(r['Feeds into'], 'H'), 'sourceSheet': 'Rehearsals', 'sourceRow': n,
    } for n, r in table(wb['Rehearsals']) if re.fullmatch(r'R\d{2}', r['ID'] or '')]

    out['flaws'] = [{
        'sourceId': r['ID'], 'issue': r['Issue'], 'whatYouSee': r['What you see'], 'checks': r['Checks to distinguish causes'],
        'contributors': r['Possible contributors'], 'drills': re.findall(r'[HR]\d{2}', r['Recommended drills'] or ''),
        'cue': r['Cue'], 'avoid': r['Avoid'], 'progressMarker': r['Progress marker'], 'retest': r['Retest'],
        'sourceSheet': 'Troubleshooting', 'sourceRow': n,
    } for n, r in table(wb['Troubleshooting']) if re.fullmatch(r'T\d{2}', r['ID'] or '')]

    ws = wb['Troubleshooting']
    workflow = []
    for row in ws.iter_rows(min_row=1):
        step, action = text(row[2].value), text(row[3].value)
        if step and action and re.match(r'^\d ', step):
            number, label = step.split(' ', 1)
            workflow.append({'step': int(number), 'label': label, 'action': action, 'sourceRow': row[0].row})
    out['workflow'] = workflow

    out['limitations'] = [text(c.value).lstrip('• ').strip() for c in wb['Basis & Limits']['B']
                          if isinstance(c.value, str) and c.value.startswith('•')]

    found = {'sheets': len(names), 'drills': len(out['drills']), 'rehearsals': len(out['rehearsals']),
             'flaws': len(out['flaws']), 'workflow': len(out['workflow'])}
    if found != EXPECTED:
        sys.exit(f'Unexpected workbook contents: {found} (expected {EXPECTED})')
    known = {d['sourceId'] for d in out['drills']} | {r['sourceId'] for r in out['rehearsals']}
    for flaw in out['flaws']:
        missing = [i for i in flaw['drills'] if i not in known]
        if missing:
            sys.exit(f'{flaw["sourceId"]} names unknown drills {missing}')
    for kind in ('drills', 'rehearsals', 'flaws'):
        keys = [item['sourceId'] for item in out[kind]]
        if len(keys) != len(set(keys)):
            sys.exit(f'Duplicate {kind} ids')
    if any(sum(1 for _ in table(wb[s])) for s in ('Players', 'Practice Log', 'Power Log', 'Readiness Log', 'Video Log')):
        sys.exit('The player and log sheets must be blank templates; this script imports content only.')

    target = Path('src/lib/assessment/hitting-workbook/content-v1.json')
    target.write_text(json.dumps(out, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(found))


if __name__ == '__main__':
    main(sys.argv[1])
