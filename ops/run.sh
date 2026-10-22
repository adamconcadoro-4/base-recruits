#!/usr/bin/env bash
# Discovery 2: EADA file list + structure of the latest data file; Scorecard year labels.
set -uo pipefail
out=ops-output
rm -f $out/*.json $out/*.txt 2>/dev/null

echo "== EADA API base =="
curl -sSL --max-time 60 https://ope.ed.gov/athletics/public/js/app.min.8f396f2e.js -o /tmp/app.js
grep -oE 'webApiUrl:"[^"]*"' /tmp/app.js | sort -u | tee $out/eada-webapi.txt
base=$(grep -oE 'webApiUrl:"[^"]*"' /tmp/app.js | head -1 | sed -E 's/webApiUrl:"([^"]*)"/\1/')
case "$base" in http*) ;; /*) base="https://ope.ed.gov$base" ;; *) base="https://ope.ed.gov/athletics/$base" ;; esac
echo "base=$base"
for p in dataFiles/years dataFiles/fileTypes dataFiles/fileList; do
  curl -sSL --max-time 60 "${base}${p}" -o "$out/eada-$(basename $p).json"; echo "$p: $(head -c 600 $out/eada-$(basename $p).json)"; echo
done

echo "== Download latest combined data file =="
python3 - "$out/eada-fileList.json" > /tmp/pick.txt <<'PY'
import json, sys
files = json.load(open(sys.argv[1]))
print(json.dumps(files[:40], indent=1)[:4000], file=sys.stderr)
names = [f.get('fileName') or f.get('FileName') or f.get('name') or str(f) for f in files] if isinstance(files, list) else []
print("\n".join(names))
PY
cat /tmp/pick.txt | head -60
latest=$(grep -iE '\.zip$' /tmp/pick.txt | sort | tail -n 1)
echo "latest zip: $latest"
if [ -n "$latest" ]; then
  curl -sSL --max-time 300 "${base}dataFiles/file?fileName=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$latest")" -o /tmp/eada.zip
  echo "zip bytes: $(wc -c < /tmp/eada.zip)"; mkdir -p /tmp/eada && cd /tmp/eada && unzip -o -q /tmp/eada.zip && cd - >/dev/null
  find /tmp/eada -type f -printf '%p %s\n' | tee $out/eada-zip-contents.txt
  pip install --quiet --break-system-packages openpyxl xlrd==2.0.1 2>&1 | tail -1
  python3 - /tmp/eada > $out/eada-structure.txt <<'PY'
import os, sys, openpyxl, csv
root = sys.argv[1]
for dirpath, _, files in os.walk(root):
    for name in files:
        path = os.path.join(dirpath, name)
        low = name.lower()
        if low.endswith('.xlsx'):
            wb = openpyxl.load_workbook(path, read_only=True)
            for ws in wb.worksheets:
                rows = ws.iter_rows(values_only=True)
                header = next(rows, None)
                print(f"### {name} / {ws.title} max_row={ws.max_row}")
                print("COLUMNS:", list(header) if header else None)
                for i, row in enumerate(rows):
                    if i >= 3: break
                    print("ROW:", list(row))
                # baseball rows in sport-level sheets
                if header and any(str(h).lower() in ('sports', 'sport', 'sportscode') for h in header if h):
                    idx = [i for i, h in enumerate(header) if h and str(h).lower() in ('sports', 'sport', 'sportscode')]
                    seen = {}
                    for row in ws.iter_rows(min_row=2, values_only=True):
                        for j in idx:
                            seen[row[j]] = seen.get(row[j], 0) + 1
                    print("SPORT VALUES:", sorted(seen.items(), key=lambda kv: -kv[1])[:60])
        elif low.endswith('.csv'):
            with open(path, newline='', encoding='latin-1') as fh:
                reader = csv.reader(fh)
                print(f"### {name}")
                print("COLUMNS:", next(reader, None))
                for i, row in enumerate(reader):
                    if i >= 3: break
                    print("ROW:", row)
        elif low.endswith(('.doc', '.docx', '.pdf', '.txt')):
            print(f"### {name} (documentation, {os.path.getsize(path)} bytes)")
PY
  head -c 20000 $out/eada-structure.txt
fi

echo "== Scorecard year labels =="
if [ -n "${COLLEGE_SCORECARD_API_KEY:-}" ]; then
  fields="id,school.name"
  for y in 2020 2021 2022 2023 2024 2025; do
    fields="$fields,$y.admissions.admission_rate.overall,$y.admissions.sat_scores.25th_percentile.math,$y.admissions.act_scores.25th_percentile.cumulative,$y.admissions.test_requirements,$y.cost.attendance.academic_year,$y.cost.tuition.in_state"
  done
  curl -sS --max-time 60 "https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${COLLEGE_SCORECARD_API_KEY}&id=100654,166027,199120&fields=${fields}" -o $out/scorecard-years.json
  python3 -m json.tool $out/scorecard-years.json | head -120
fi
