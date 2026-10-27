#!/usr/bin/env python3
"""Write the 9-Zone content seed into the zone-hitting migration.

Reads src/lib/assessment/zones/content-v1.json (made by extract.py from the
workbook) and replaces everything after the marker line in the migration with
a call to private.import_zone_content(). The app and the database then carry
the same content; tests/unit/zone-content-contract.test.ts checks they match.

Only run this while the migration is unreleased: migrations are append-only
once applied, and a later content version gets its own migration.

Usage: python3 -I scripts/zone-content/seed-sql.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / 'src/lib/assessment/zones/content-v1.json'
MIGRATION = ROOT / 'supabase/migrations/20261027000100_zone_hitting.sql'
MARKER = '-- @generated zone-content-seed (scripts/zone-content/seed-sql.py; do not edit below)'
SEEDED = ('zones', 'drills', 'stages', 'pairings', 'constraints')


def seed_payload(content: dict) -> str:
    head = {'version': content['version'], 'source': {'file': content['source']['file'], 'sha256': content['source']['sha256']}}
    parts = [json.dumps(head, ensure_ascii=False, sort_keys=True)[:-1]]
    for key in SEEDED:
        rows = ',\n'.join(json.dumps(row, ensure_ascii=False, sort_keys=True) for row in content[key])
        parts.append(f'"{key}": [\n{rows}\n]')
    return ',\n'.join(parts) + '}'


def main() -> int:
    content = json.loads(CONTENT.read_text(encoding='utf-8'))
    payload = seed_payload(content)
    if '$zone$' in payload:
        print('content contains the dollar-quote tag', file=sys.stderr)
        return 1
    json.loads(payload)  # must stay valid JSON
    sql = MIGRATION.read_text(encoding='utf-8')
    if MARKER in sql:
        sql = sql[: sql.index(MARKER)]
    else:
        sql = sql.rstrip('\n') + '\n'
    sql += f'{MARKER}\nselect private.import_zone_content($zone${payload}$zone$::jsonb);\n'
    MIGRATION.write_text(sql, encoding='utf-8')
    print(f'wrote {sum(len(content[k]) for k in SEEDED)} rows to {MIGRATION.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
