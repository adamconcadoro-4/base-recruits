#!/usr/bin/env python3
"""
Extract the 9-Zone Hitting workbook into versioned content for Base Recruits
Assessment (src/lib/assessment/zones/content-v1.json).

    python3 -I scripts/zone-content/extract.py data/zone-hitting/9_Zone_Hitting_Drills_and_Tracking.xlsx

The workbook is read, never modified. Every record keeps its source sheet and
row. Counts are checked against what the workbook is expected to contain, and
the script stops if they differ. Requires openpyxl (developer tool only; the
app and CI read the JSON).
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import openpyxl

EXPECTED = {
    'sheets': 15, 'zones': 9, 'drills': 39, 'stages': 9, 'pairings': 5, 'constraints': 49,
}
VERSION = 'zone-v1'


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def rows(ws):
    header = [c.value for c in ws[1]]
    for row in ws.iter_rows(min_row=2):
        values = [c.value for c in row]
        if all(v is None or str(v).strip() == '' for v in values):
            continue
        yield row[0].row, {h: (None if v is None else str(v).strip()) for h, v in zip(header, values)}


def main(path):
    data = Path(path).read_bytes()
    wb = openpyxl.load_workbook(path, data_only=False)
    names = [ws.title for ws in wb.worksheets]
    out = {
        'version': VERSION,
        'source': {'file': Path(path).name, 'sha256': hashlib.sha256(data).hexdigest(), 'sheets': names},
    }

    out['startHere'] = [{'topic': r['Topic'], 'text': r['Instructions'], 'sourceRow': n} for n, r in rows(wb['Start Here'])]

    out['zones'] = [{
        'zone': int(r['Zone']), 'location': r['Location'], 'placement': r['Pitch placement'],
        'depthCue': r['Contact-depth cue'], 'targetLane': r['Target lane'], 'cue': r['One cue'],
        'desiredResult': r['Desired result'], 'commonMisses': r['Common misses'], 'sourceRow': n,
    } for n, r in rows(wb['9-Zone Map'])]

    out['drills'] = [{
        'sourceId': r['Drill ID'], 'key': r['Drill ID'].lower(), 'version': 1, 'zone': int(r['Zone']),
        'name': r['Drill'], 'level': r['Level'], 'setup': r['Setup'], 'suggestedVolume': r['Suggested volume'],
        'execution': r['Execution'], 'depthCue': r['Depth cue'], 'targetLane': r['Target lane'], 'cue': r['One cue'],
        'track': r['Track'], 'watchFor': r['Watch for'], 'sourceSheet': 'Zone Drill Library', 'sourceRow': n,
    } for n, r in rows(wb['Zone Drill Library'])]

    out['stages'] = [{
        'stage': int(r['Level']), 'name': r['Drill stage'], 'source': r['Source'], 'newDemand': r['New demand'],
        'suggestedVolume': r['Suggested volume'], 'instructions': r['Instructions'], 'measures': r['Measures'],
        'nextStep': r['Next step'], 'sourceRow': n,
    } for n, r in rows(wb['Progression'])]

    pairings = []
    for n, r in rows(wb['Zone Pairings']):
        zones = [int(z) for z in re.findall(r'\d', r['Zones'])]
        pairings.append({'key': 'pair-' + '-'.join(str(z) for z in zones), 'zones': zones, 'name': r['Pairing'],
                         'purpose': r['Purpose'], 'sourceRow': n})
    out['pairings'] = pairings

    out['constraints'] = [{
        'key': slug(r['Category']) + '-' + slug(r['Constraint']), 'category': r['Category'], 'name': r['Constraint'],
        'deliverySetup': r['Pitcher plan / setup'], 'hitterAssignment': r['Hitter assignment'], 'measure': r['Measure'],
        'volumeNote': r['Volume note'], 'sourceRow': n,
    } for n, r in rows(wb['Live BP Constraints'])]

    out['baselineTests'] = [{'block': r['Block'], 'setup': r['Setup'], 'volume': r['Volume'], 'measure': r['Measure'],
                             'notes': r['Notes'], 'sourceRow': n} for n, r in rows(wb['Baseline Tests'])]
    out['sessionPlan'] = [{'segment': r['Segment'], 'time': r['Suggested time'], 'volume': r['Volume'],
                           'task': r['Pitch plan / task'], 'review': r['Review'], 'sourceRow': n}
                          for n, r in rows(wb['Session Plan'])]
    out['codingGuide'] = [{'field': r['Field'], 'rule': r['Rule'], 'sourceRow': n} for n, r in rows(wb['Log Coding Guide'])]
    out['dashboard'] = [{'metric': r['Metric'], 'formula': r['Result'], 'definition': r['Definition'], 'sourceRow': n}
                        for n, r in rows(wb['Session Dashboard'])]
    out['roundReview'] = [{'step': r['Step'], 'prompt': r['Checklist / prompt'], 'sourceRow': n}
                          for n, r in rows(wb['Round Review'])]
    out['postSessionEval'] = [{'field': r['Field'], 'sourceRow': n} for n, r in rows(wb['Post Session Eval'])]
    out['deliveryPlan'] = [{'finding': r['Evaluation finding'], 'plan': r['Next delivery plan'], 'guardrail': r['Guardrail'],
                            'sourceRow': n} for n, r in rows(wb['Pitcher Plan'])]
    out['pitchLogColumns'] = [c.value for c in wb['Pitch Log'][1]]
    out['dailyLogColumns'] = [c.value for c in wb['Daily Log'][1]]

    found = {'sheets': len(names), 'zones': len(out['zones']), 'drills': len(out['drills']), 'stages': len(out['stages']),
             'pairings': len(out['pairings']), 'constraints': len(out['constraints'])}
    if found != EXPECTED:
        sys.exit(f'Unexpected workbook contents: {found} (expected {EXPECTED})')
    for kind in ('drills', 'constraints', 'pairings'):
        keys = [item['key'] for item in out[kind]]
        if len(keys) != len(set(keys)):
            sys.exit(f'Duplicate {kind} keys')
    pitch_rows = sum(1 for _ in rows(wb['Pitch Log']))
    daily_rows = sum(1 for _ in rows(wb['Daily Log']))
    if pitch_rows or daily_rows:
        sys.exit('The pitch log and daily log must be blank templates; this script imports content only.')

    target = Path('src/lib/assessment/zones/content-v1.json')
    target.write_text(json.dumps(out, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(found))


if __name__ == '__main__':
    main(sys.argv[1])
