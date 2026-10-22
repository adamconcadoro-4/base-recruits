#!/usr/bin/env bash
# Discovery 3: EADA per-sport file + codebook; Scorecard data dictionary + year semantics.
set -uo pipefail
out=ops-output
find $out -type f ! -name log.txt -delete 2>/dev/null
api=https://ope.ed.gov/athletics/api/
sudo apt-get install -y -qq catdoc >/dev/null 2>&1 || echo "catdoc install failed"
pip install --quiet --break-system-packages openpyxl 2>&1 | tail -1

echo "== EADA per-sport zip =="
mkdir -p /tmp/eada && cd /tmp/eada
curl -sSL --max-time 300 "${api}dataFiles/file?fileName=EADA_2024-2025.zip" -o eada.zip; echo "bytes $(wc -c < eada.zip) sha256 $(sha256sum eada.zip | cut -d' ' -f1)"
unzip -o -q eada.zip -d x && find x -type f -printf '%p %s\n'
cd - >/dev/null
for d in /tmp/eada/x/*.doc /tmp/eada/x/*/*.doc; do [ -f "$d" ] && { echo "### codebook $d"; catdoc -w "$d" > "$out/codebook-$(basename "$d" .doc).txt" 2>/dev/null; wc -c "$out/codebook-$(basename "$d" .doc).txt"; }; done
python3 - /tmp/eada/x > $out/eada-sports.txt <<'PY'
import os, sys, collections, openpyxl
for dirpath, _, files in os.walk(sys.argv[1]):
    for name in files:
        if not name.lower().endswith('.xlsx'): continue
        wb = openpyxl.load_workbook(os.path.join(dirpath, name), read_only=True)
        for ws in wb.worksheets:
            rows = ws.iter_rows(values_only=True)
            header = [str(h) for h in next(rows)]
            print(f"### {name} / {ws.title}")
            print("COLUMNS:", header)
            data = list(rows)
            print("ROWS:", len(data))
            col = {h: i for i, h in enumerate(header)}
            sport_col = next((h for h in header if h.lower() in ('sports', 'sport')), None)
            if sport_col:
                sports = collections.Counter(r[col[sport_col]] for r in data)
                print("SPORTS:", sports.most_common())
                base = [r for r in data if str(r[col[sport_col]]).strip().lower() == 'baseball']
                print("BASEBALL ROWS:", len(base))
                for r in base[:4]: print("BASEBALL ROW:", dict(zip(header, r)))
                cls = collections.Counter((r[col.get('ClassificationCode', 0)], r[col.get('classification_name', 0)]) for r in base)
                print("BASEBALL CLASSIFICATIONS:", sorted(cls.items(), key=lambda kv: -kv[1]))
                for h in header:
                    if 'PARTIC' in h.upper() or 'SUM' in h.upper():
                        vals = [r[col[h]] for r in base]
                        nz = sum(1 for v in vals if v not in (None, 0, '', '0'))
                        print(f"  {h}: nonzero {nz}/{len(vals)} sample {vals[:6]}")
            else:
                if 'PARTIC_MEN_Baseball' in col:
                    base = [r for r in data if (r[col['PARTIC_MEN_Baseball']] or 0) > 0]
                    print("INSTITUTIONS WITH MEN'S BASEBALL PARTICIPANTS:", len(base))
                    cls = collections.Counter((r[col['ClassificationCode']], r[col['classification_name']]) for r in base)
                    print("CLASSIFICATIONS:", sorted(cls.items(), key=lambda kv: -kv[1]))
                    women = sum(1 for r in data if (r[col.get('PARTIC_WOMEN_Baseball')] or 0) > 0)
                    print("institutions with women's baseball participants:", women)
                    sectors = collections.Counter(r[col['sector_name']] for r in base)
                    print("SECTORS:", sectors.most_common())
                allcls = collections.Counter((r[col['ClassificationCode']], r[col['classification_name']]) for r in data) if 'ClassificationCode' in col else {}
                print("ALL CLASSIFICATIONS:", sorted(allcls.items()) if allcls else None)
PY
head -c 30000 $out/eada-sports.txt
for f in $out/codebook-*.txt; do echo "### $f"; grep -n -i -E 'classification|baseball|partic|reporting year|unitid' "$f" | head -60; done

echo "== Scorecard documentation =="
for u in https://collegescorecard.ed.gov/files/CollegeScorecardDataDictionary.xlsx https://collegescorecard.ed.gov/files/InstitutionDataDocumentation.pdf https://collegescorecard.ed.gov/data/documentation/; do
  code=$(curl -sSL --max-time 120 -o /tmp/$(basename "$u").bin -w '%{http_code}' "$u"); echo "$u -> $code $(wc -c < /tmp/$(basename "$u").bin)"
done
python3 - /tmp/CollegeScorecardDataDictionary.xlsx > $out/scorecard-dictionary.txt <<'PY'
import sys, openpyxl
want = {'ADM_RATE','ADM_RATE_ALL','SATVR25','SATVR75','SATMT25','SATMT75','ACTCM25','ACTCM75','ADMCON7','COSTT4_A','COSTT4_P','TUITIONFEE_IN','TUITIONFEE_OUT','NPT4_PUB','NPT4_PRIV','UGDS','LOCALE','CONTROL','ICLEVEL','PREDDEG','HIGHDEG','INSTURL','ALIAS','LATITUDE','LONGITUDE','CITY','STABBR','ZIP','INSTNM','OPEID8','UNITID','NPCURL','ST_FIPS','CCSIZSET','SAT_AVG','TEST_REQUIREMENTS'}
try:
    wb = openpyxl.load_workbook(sys.argv[1], read_only=True)
except Exception as e:
    print("cannot open dictionary:", e); sys.exit()
for ws in wb.worksheets:
    rows = list(ws.iter_rows(values_only=True))
    print(f"### sheet {ws.title} rows={len(rows)} header={rows[0] if rows else None}")
    if ws.title.lower().startswith(('data_dictionary', 'institution_data_dictionary')) or 'dictionary' in ws.title.lower():
        current = None
        for r in rows[1:]:
            if r is None: continue
            vals = [v for v in r]
            var = next((v for v in vals if isinstance(v, str) and v.strip().upper() in want), None)
            if var: current = var.strip().upper()
            if current and (var or any(isinstance(v,(int,float)) for v in vals[:8])):
                print(current, '|', ' | '.join('' if v is None else str(v) for v in vals[:12]))
                if var is None and not any(vals): current = None
    if 'notes' in ws.title.lower() or 'readme' in ws.title.lower() or 'year' in ws.title.lower():
        for r in rows[:80]: print('NOTE:', r)
PY
head -c 25000 $out/scorecard-dictionary.txt
pdftotext -layout /tmp/InstitutionDataDocumentation.pdf.bin $out/scorecard-doc.txt 2>/dev/null && grep -n -i -E 'academic year|fall [0-9]{4}|data year|year of|ADMCON7|test requirement|cohort|enrolled|COSTT4|net price' $out/scorecard-doc.txt | head -80

echo "== Scorecard latest vs year keys =="
if [ -n "${COLLEGE_SCORECARD_API_KEY:-}" ]; then
  f="id,school.name,latest.admissions.admission_rate.overall,2024.admissions.admission_rate.overall,2023.admissions.admission_rate.overall,latest.cost.attendance.academic_year,2025.cost.attendance.academic_year,2024.cost.attendance.academic_year,latest.cost.avg_net_price.overall,2024.cost.avg_net_price.overall,2023.cost.avg_net_price.overall,latest.student.size,2024.student.size,2023.student.size,school.alias,school.school_url,school.price_calculator_url,school.locale,school.ownership,school.institutional_characteristics.level,school.degrees_awarded.predominant,location.lat,location.lon,latest.admissions.sat_scores.25th_percentile.critical_reading,latest.admissions.sat_scores.75th_percentile.math,latest.admissions.act_scores.75th_percentile.cumulative,latest.admissions.test_requirements,latest.cost.tuition.in_state,latest.cost.tuition.out_of_state,latest.cost.attendance.program_year"
  curl -sS --max-time 60 "https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${COLLEGE_SCORECARD_API_KEY}&id=100654,243744,110635,117645&fields=${f}" | python3 -m json.tool > $out/scorecard-latest.json
  cat $out/scorecard-latest.json | head -150
fi
