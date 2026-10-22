#!/usr/bin/env bash
# Discovery: where are the official files, and does the Scorecard key work?
set -uo pipefail
out=ops-output

echo "== EADA (ope.ed.gov/athletics) =="
curl -sSL --max-time 60 https://ope.ed.gov/athletics/ -o $out/eada-index.html; echo "index: $(wc -c < $out/eada-index.html) bytes"
grep -oE '(src|href)="[^"]+\.(js|css)"' $out/eada-index.html | tee $out/eada-assets.txt
for asset in $(grep -oE 'src="[^"]+\.js"' $out/eada-index.html | sed -E 's/src="([^"]+)"/\1/'); do
  url="$asset"; case "$asset" in http*) ;; /*) url="https://ope.ed.gov$asset" ;; *) url="https://ope.ed.gov/athletics/$asset" ;; esac
  curl -sSL --max-time 60 "$url" -o $out/bundle.js || continue
  echo "-- $url ($(wc -c < $out/bundle.js) bytes)"
  grep -oE '"[^"]*(api|Api|API)[^"]{0,80}"' $out/bundle.js | sort -u | head -80
  grep -oE '"[^"]*(dataFile|datafile|DataFile|\.zip|\.xlsx)[^"]{0,80}"' $out/bundle.js | sort -u | head -60
done > $out/eada-endpoints.txt
rm -f $out/bundle.js
wc -l $out/eada-endpoints.txt

echo "== College Scorecard =="
if [ -z "${COLLEGE_SCORECARD_API_KEY:-}" ]; then
  echo "COLLEGE_SCORECARD_API_KEY secret: NOT SET"
else
  echo "COLLEGE_SCORECARD_API_KEY secret: set"
  status=$(curl -sS -o $out/scorecard-sample.json -w '%{http_code}' --max-time 60 \
    "https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${COLLEGE_SCORECARD_API_KEY}&per_page=2&fields=id,ope8_id,school.name,school.city,school.state,school.school_url,school.ownership,latest.admissions.admission_rate.overall,latest.admissions.sat_scores.25th_percentile.critical_reading,latest.admissions.test_requirements")
  echo "HTTP $status"; head -c 1500 $out/scorecard-sample.json; echo
fi
curl -sSL --max-time 60 https://collegescorecard.ed.gov/data/ | grep -oE 'href="[^"]+\.(zip|csv|xlsx)"' | sort -u > $out/scorecard-bulk-links.txt
echo "bulk links:"; cat $out/scorecard-bulk-links.txt
