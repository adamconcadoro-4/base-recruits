#!/usr/bin/env python3
"""
Extract the Hitting Master Workbook into versioned content for Base Recruits
Assessment (src/lib/assessment/hitting-workbook/master-v1.json).

    python3 -I scripts/hitting-workbook/extract_master.py data/hitting-workbook/Baseball_Hitting_Master_Workbook.xlsx

The workbook is read, never modified. Imported: the 69-drill library (with its
filming and video-review notes), the six coach stage cards, and the practice
plan's session structure, how-to-use notes, advancement rules, workload
adjustments, pairing substitutions, focus alternatives and medicine-ball rules.
Not imported: the training logs (blank templates) and the "What to record"
column, which asks for readiness and restrictions (health data, decision F39).
Every record keeps its source sheet and row. Counts are checked, and the script
stops if any outside organisation's name, a web link, a source reference or a
discarded drill name appears anywhere in the workbook (decision F55). Requires
openpyxl (developer tool only; the app and CI read the JSON).
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import openpyxl

EXPECTED = {
    'sheets': 7, 'drills': 69, 'categories': 6, 'stages': 6, 'quickKey': 10, 'structure': 7, 'howToUse': 8, 'equipment': 5,
    'advancement': 8, 'adjustments': 4, 'substitutions': 6, 'focusAlternatives': 7, 'medicineBall': 12, 'limitations': 6,
}
VERSION = 'hitting-master-v1'

# Names and links the founder asked to keep out of the workbook and the site (decisions F38 and F55), plus the
# drill names this workbook arrived with, which were replaced by generic names.
FORBIDDEN = re.compile(
    r'driveline|prospectus|google|mediapipe|baseball academy|red sox|pro speed|pinkman|o[\'’]leary|coach steve|'
    r'\bobtv\b|o[\'’]brien|performance lab|grip boost|tc thunder|sklz|hitting vault|rooney|epic sports|baseball nsw|'
    r'ultimate baseball|hitting done right|bb sports|oregon state|championship productions|ritend|coaches insider|'
    r'full count baseball|yougopro|overtime athletes|yahoo|baseball sask|baseballswing3d|vhcbs|bravara|bruce bolt|'
    r'better coaches|baseball tutorials|swingvantage|figure it out|softball spot|kershaw|gilmore|lone ranger|jugs|'
    r'little ?league|cressey|\bnsca\b|nocsae|microsoft|youtube|gamerun|maven|https?://|www\.|'
    r'palm-up punch|slot machine|dead hand whip|split decision|fence line|elbow roadblock|oppo laser|push-pull power|'
    r'brake check|pause & pounce|flamingo finish|sky tee block|lockdown line|front porch|limbo lunge|reload & fire|'
    r'hip pocket reload|coil & capture|step-back spark|rock & rocket|launchpad|hook, hold|open-stance anchor|backside turntable|'
    r'power pass|no-spin zone|rise & ride|shuffle-to-strike|posture passport|tilt & turn|ball blueprint|set & sweep|'
    r'zone laser|zone hold|posture ladder|away-stay|compact contact|stance compass|stay-in-the-turn|read, adjust|count it calm|'
    r'tap & track|step into control|float & flow|photo finish|finish-line flow|contact-spot calm|read the reveal|'
    r'quiet window|track, don.t attack|call the color|see, decide|pocket-to-pop|plant & launch|slingshot|step-in strike|'
    r'shuffle & send|crossover cannon|kneeling coil|helix|turn & punch|kneel & drive|slam & settle|brake & place|'
    r'marketing name',
    re.IGNORECASE,
)
SOURCE_REF = re.compile(r'\[S\d{3}|\bS0\d\d\b|\bSTACK\b|\bCBT\b|\bHLP\b|\bAFH\b')

CATEGORIES = ['Top hand / back arm', 'Front leg', 'Rear leg', 'Posture', 'Balance / head control', 'Medicine ball']
SLOTS = {'Rear': 'rear', 'Front': 'front', 'Upper': 'upper'}


def text(value):
    return None if value is None else str(value).strip()


def mw(number):
    return f'MW{int(number):02d}'


def bullets(value):
    """'• Do this.\n• Then that.' -> ['Do this.', 'Then that.']"""
    return [line.strip().lstrip('•').strip() for line in (value or '').split('\n') if line.strip().lstrip('•').strip()]


def column(ws, letter='B'):
    """(row, text) for every non-empty cell in one column."""
    for cell in ws[letter]:
        value = text(cell.value)
        if value:
            yield cell.row, value


def section(ws, start, stop):
    """Bulleted rows in column B after the heading `start` and before the heading `stop`: [{label, text, sourceRow}]."""
    out, inside = [], False
    for row, value in column(ws):
        if value == start:
            inside = True
        elif value == stop:
            break
        elif inside and value.startswith('•'):
            label, _, rest = value.lstrip('• ').partition(': ')
            out.append({'label': label.strip(), 'text': rest.strip(), 'sourceRow': row})
    if not out:
        sys.exit(f'No bullets between "{start}" and "{stop}" in {ws.title}')
    return out


def table(ws, header_row, columns, stop_blank=True):
    """Rows under a header row; columns maps key -> letter."""
    out = []
    for row in range(header_row + 1, ws.max_row + 1):
        values = {key: text(ws[f'{letter}{row}'].value) for key, letter in columns.items()}
        if not any(values.values()):
            if stop_blank:
                break
            continue
        out.append(values | {'sourceRow': row})
    return out


def find(ws, pattern):
    for row, value in column(ws):
        if re.fullmatch(pattern, value):
            return row
    sys.exit(f'Heading "{pattern}" not found in {ws.title}')


def drill_ref(value):
    """'#22 Rear-Hip Hinge Pause: 4 + 4' -> ('MW22', '4 + 4')."""
    match = re.match(r'^#(\d+) [^:]+: (.+)$', value)
    if not match:
        sys.exit(f'Unreadable drill reference: {value}')
    return mw(match.group(1)), match.group(2)


def stages(ws):
    out = []
    starts = [row for row, value in column(ws) if re.match(r'^Stage \d Card: ', value)]
    if len(starts) != 6:
        sys.exit(f'Expected six stage cards, found {len(starts)}')
    ends = starts[1:] + [find(ws, 'Coach Decision Strip')]
    for start, end in zip(starts, ends):
        title = text(ws[f'B{start}'].value)
        number, name = re.match(r'^Stage (\d) Card: (.+)$', title).groups()
        card = {'id': f'ST{number}', 'number': int(number), 'name': name, 'blocks': [], 'focus': [], 'sourceSheet': ws.title,
                'sourceRow': start}
        for row in range(start + 1, end):
            b = text(ws[f'B{row}'].value)
            if not b or b == 'Order' or b.startswith('Optional focus') or b.startswith('Record:'):
                continue
            if b in SLOTS:
                drill, dose = drill_ref(text(ws[f'D{row}'].value))
                card['blocks'].append({'slot': SLOTS[b], 'drill': drill, 'dose': dose, 'run': text(ws[f'F{row}'].value),
                                       'watch': text(ws[f'I{row}'].value), 'sourceRow': row})
            elif b.startswith('Goal:'):
                goal, _, say = b[len('Goal:'):].partition(' Say: ')
                card['goal'], card['cue'] = goal.strip(), say.strip().strip('“”')
            elif b.startswith('Kit:'):
                kit, _, rest = b[len('Kit:'):].partition(' Normal swings: ')
                if not rest:
                    kit, _, rest = kit.partition(' Start: ')
                    rest = f'Start: {rest}' if rest else ''
                card['kit'], card['normalSwings'] = kit.strip(), rest.strip()
            elif b.startswith('• '):
                slot, _, rest = b[2:].partition(': ')
                ref, _, run = rest.partition(': ')
                drill, dose = drill_ref(f'{ref}: x')[0], ref.rpartition(', ')[2]
                card['focus'].append({'slot': slot, 'drill': drill, 'dose': dose, 'run': run, 'sourceRow': row})
            elif b.startswith('Exit:'):
                card['exit'] = b[len('Exit:'):].strip()
            elif b.startswith('If not ready:') or b.startswith('If ready:'):
                card['next'] = b
            else:
                sys.exit(f'Unexpected line on {title}: {b[:60]}')
        if len(card['blocks']) != 3 or [f['slot'] for f in card['focus']] != ['P', 'B', 'M']:
            sys.exit(f'{title} needs rear, front and upper blocks and P, B and M focus options')
        out.append(card)
    return out


def main(path):
    data = Path(path).read_bytes()
    wb = openpyxl.load_workbook(path, data_only=False)
    names = [ws.title for ws in wb.worksheets]

    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                if isinstance(cell.value, str) and (FORBIDDEN.search(cell.value) or SOURCE_REF.search(cell.value)):
                    sys.exit(f'Outside name, source reference or discarded drill name in {ws.title}!{cell.coordinate}: {cell.value[:80]}')
                if cell.hyperlink is not None and cell.hyperlink.target:
                    sys.exit(f'External hyperlink in {ws.title}!{cell.coordinate}')

    out = {
        'version': VERSION,
        'source': {'file': Path(path).name, 'sha256': hashlib.sha256(data).hexdigest(), 'sheets': names},
    }

    lib = wb['Drill Library']
    header = {text(c.value): c.column_letter for c in lib[5] if c.value}
    rows = table(lib, 5, header)
    out['drills'] = [{
        'sourceId': mw(r['Drill ID']), 'number': int(r['Drill ID']), 'category': r['Category'], 'name': r['Drill name'],
        'related': r['Related drill'], 'objective': r['Objective'], 'equipment': r['Equipment'],
        'steps': bullets(r['Step-by-step instructions']),
        'filming': {
            'views': r['AI: views & landmarks'], 'phase': r['AI: movement phase'], 'review': r['AI: candidate flaw analysis'],
            'feedback': (r['AI: example feedback'] or '').strip('“”'), 'limits': r['AI: limits / uncertainty'],
        },
        'sourceSheet': lib.title, 'sourceRow': r['sourceRow'],
    } for r in rows]

    cards = wb['Coach Cards']
    key_start, key_end = find(cards, 'Quick Key'), find(cards, r'Stage 1 Card: .+')
    out['quickKey'] = [item for item in section(cards, 'Quick Key', text(cards[f'B{key_end}'].value))
                       if key_start < item['sourceRow'] < key_end]
    out['stages'] = stages(cards)
    strip_row = find(cards, 'Coach Decision Strip')
    out['decisions'] = [{'text': text(cards[f'B{row}'].value), 'sourceRow': row}
                        for row in range(strip_row + 1, cards.max_row + 1)
                        if text(cards[f'B{row}'].value) and not text(cards[f'B{row}'].value).startswith('M add-on log')]

    plan = wb['Practice Plan']
    out['howToUse'] = section(plan, 'How to Use the Progression', 'Equipment and recording')
    out['equipment'] = section(plan, 'Equipment and recording', 'Standard Session Structure')
    structure = table(plan, find(plan, 'Block'), {'block': 'B', 'dose': 'D', 'task': 'F'})
    out['structure'] = structure
    out['advancement'] = section(plan, 'Advance, Repeat, Simplify, or Fix the Recording', 'Proposed workload adjustments')
    out['adjustments'] = table(plan, find(plan, 'Situation'), {'situation': 'B', 'adjustment': 'D', 'check': 'H'})
    out['substitutions'] = table(plan, find(plan, 'Observed pattern'), {'pattern': 'B', 'rear': 'D', 'front': 'F', 'upper': 'H', 'caution': 'K'})
    out['focusAlternatives'] = section(plan, 'Optional alternatives and simplifications', 'Module-specific advancement and logging')
    out['medicineBall'] = (section(plan, 'Setup and dose', 'Pairings by stage')
                           + section(plan, 'Alternatives, progression, and recording', 'Advance, Repeat, Simplify, or Fix the Recording'))
    out['limitations'] = [text(c.value).lstrip('• ').strip() for c in wb['Basis & Limits']['B']
                          if isinstance(c.value, str) and c.value.startswith('•')]

    found = {
        'sheets': len(names), 'drills': len(out['drills']), 'categories': len({d['category'] for d in out['drills']}),
        'stages': len(out['stages']), 'quickKey': len(out['quickKey']), 'structure': len(structure),
        'howToUse': len(out['howToUse']), 'equipment': len(out['equipment']), 'advancement': len(out['advancement']),
        'adjustments': len(out['adjustments']), 'substitutions': len(out['substitutions']),
        'focusAlternatives': len(out['focusAlternatives']), 'medicineBall': len(out['medicineBall']),
        'limitations': len(out['limitations']),
    }
    if found != EXPECTED:
        sys.exit(f'Unexpected workbook contents: {found} (expected {EXPECTED})')
    if [d['number'] for d in out['drills']] != list(range(1, 70)):
        sys.exit('Drills must be numbered 1-69 in order')
    if sorted({d['category'] for d in out['drills']}, key=CATEGORIES.index) != CATEGORIES:
        sys.exit('Unexpected drill categories')
    known = {d['sourceId'] for d in out['drills']}
    names_seen = [d['name'] for d in out['drills']]
    if len(set(n.lower() for n in names_seen)) != len(names_seen):
        sys.exit('Duplicate drill names')
    for d in out['drills']:
        missing = [k for k in ('category', 'name', 'objective', 'equipment') if not d[k]]
        if missing or not d['steps'] or not all(d['filming'].values()):
            sys.exit(f'{d["sourceId"]} is missing {missing or "steps or filming notes"}')
    for stage in out['stages']:
        for item in stage['blocks'] + stage['focus']:
            if item['drill'] not in known:
                sys.exit(f'{stage["id"]} names unknown drill {item["drill"]}')
        for field in ('goal', 'cue', 'kit', 'exit', 'next'):
            if not stage.get(field):
                sys.exit(f'{stage["id"]} has no {field}')
    for item in out['substitutions']:
        for ref in re.findall(r'#(\d+)', ' '.join(item[k] or '' for k in ('rear', 'front', 'upper'))):
            if mw(ref) not in known:
                sys.exit(f'Substitution names unknown drill #{ref}')
    logs = wb['Training Logs']
    for table_name, ref in logs.tables.items():
        for row in logs[ref][1:]:
            for cell in row:
                if cell.value is not None and not (isinstance(cell.value, str) and cell.value.startswith('=')):
                    sys.exit(f'Training log {table_name} must be a blank template; {cell.coordinate} holds data')

    target = Path('src/lib/assessment/hitting-workbook/master-v1.json')
    target.write_text(json.dumps(out, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(found))


if __name__ == '__main__':
    main(sys.argv[1])
