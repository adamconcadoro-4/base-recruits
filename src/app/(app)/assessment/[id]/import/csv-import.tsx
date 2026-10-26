'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { importMeasurementsAction, type ImportOutcome } from '@/app/(app)/assessment/actions';
import { ScrollTable } from '@/components/assessment/scroll-table';
import { Button } from '@/components/ui/button';
import {
  CSV_FIELDS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  REQUIRED_CSV_FIELDS,
  missingRequiredFields,
  parseCsv,
  suggestMapping,
  validateRows,
  type CsvField,
} from '@/lib/assessment/csv';
import { requireMetric } from '@/lib/assessment/catalog/metrics';
import { PITCH_TYPE_LABELS } from '@/lib/assessment/catalog/context';
import type { Discipline } from '@/lib/assessment/types';

interface Loaded {
  readonly name: string;
  readonly sha256: string;
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const FIELD_HELP: Readonly<Record<CsvField, string>> = {
  assessment_ref: 'Optional. Must match this assessment if present.',
  rep: 'Required. Repetition number in this assessment.',
  discipline: 'Optional. Must match this assessment.',
  pitch_type: 'Needed for per-pitch metrics such as velocity, spin and strikes.',
  metric: 'Required. A metric key, e.g. hit_exit_velocity_mph.',
  value: 'Required. A number, or yes/no for charted outcomes.',
  unit: 'Required. e.g. mph, km/h, ms, deg, rpm, in, yes_no.',
  acquisition: 'Required. sensor_measurement, video_estimate or observation.',
  device_kind: 'Needed for sensor values. radar, ball_tracking, bat_sensor, other.',
  device: 'Needed for sensor values. The device’s name or model.',
  recorded_at: 'Optional. ISO 8601 date and time from the device.',
};

/**
 * CSV import with a preview: map columns, see every row that will be
 * imported or rejected and why, then import. The database checks each row
 * again and skips exact duplicates of earlier imports.
 */
export function CsvImport({
  assessmentId,
  discipline,
  metricKeys,
  example,
}: {
  readonly assessmentId: string;
  readonly discipline: Discipline;
  readonly metricKeys: readonly string[];
  readonly example: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<CsvField, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const validation = useMemo(
    () => (file ? validateRows(file.rows, mapping, { assessmentId, discipline, metricKeys }) : null),
    [file, mapping, assessmentId, discipline, metricKeys],
  );
  const missing = missingRequiredFields(mapping);

  async function choose(input: HTMLInputElement) {
    setError(null);
    setOutcome(null);
    const chosen = input.files?.[0];
    if (!chosen) return;
    if (chosen.size > MAX_IMPORT_BYTES) {
      setError('The file is larger than 2 MB. Split it into smaller files.');
      return;
    }
    const text = await chosen.text();
    const parsed = parseCsv(text);
    const [header, ...rows] = parsed;
    if (!header || rows.length === 0) {
      setError('The file has no data rows. The first row must be the column names.');
      return;
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      setError(`The file has more than ${MAX_IMPORT_ROWS.toLocaleString()} rows. Split it into smaller files.`);
      return;
    }
    setFile({ name: chosen.name, sha256: await sha256(text), header, rows });
    setMapping(suggestMapping(header));
  }

  async function submit() {
    if (!file || !validation || validation.accepted.length === 0) return;
    setBusy(true);
    setError(null);
    const rows = validation.accepted.map((row) => ({
      row: row.row,
      rep: row.rep,
      pitch_type: row.pitch_type,
      metric_key: row.metric_key,
      value: row.value,
      unit: row.unit,
      acquisition: row.acquisition,
      device_kind: row.device_kind,
      device_label: row.device_label,
      recorded_at: row.recorded_at,
    }));
    const result = await importMeasurementsAction({ assessmentId, fileName: file.name, sha256: file.sha256, rows });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOutcome(result.outcome);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label htmlFor="csv-file" className="block font-semibold">
            CSV file
          </label>
          <p id="csv-hint" className="text-sm text-slate">
            One measurement per row, up to {MAX_IMPORT_ROWS.toLocaleString()} rows and 2 MB. Ratings are entered in the app, not imported.
          </p>
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            aria-describedby="csv-hint"
            onChange={(event) => void choose(event.currentTarget)}
            className="block text-base file:mr-4 file:min-h-11 file:rounded-md file:border-2 file:border-navy file:bg-white file:px-4 file:font-semibold file:text-navy"
          />
        </div>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(example)}`}
          download={`base-recruits-${discipline}-example.csv`}
          className="font-semibold text-royal-ink underline"
        >
          Download an example file
        </a>
      </div>

      {error ? (
        <p role="alert" className="font-semibold text-danger">
          {error}
        </p>
      ) : null}

      {file ? (
        <section aria-labelledby="mapping-heading" className="space-y-4">
          <h2 id="mapping-heading" className="text-2xl text-navy">
            Match the columns
          </h2>
          <p className="text-sm text-slate">
            {file.name} · {file.rows.length} data rows. Columns were matched by name; change any that are wrong.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CSV_FIELDS.map((name) => (
              <div key={name} className="space-y-1">
                <label htmlFor={`map-${name}`} className="block font-semibold">
                  {name}
                  {REQUIRED_CSV_FIELDS.includes(name) ? ' (required)' : ''}
                </label>
                <p className="text-xs text-slate">{FIELD_HELP[name]}</p>
                <select
                  id={`map-${name}`}
                  value={mapping[name] ?? ''}
                  onChange={(event) =>
                    setMapping((current) => {
                      const next = { ...current };
                      if (event.target.value === '') delete next[name];
                      else next[name] = Number(event.target.value);
                      return next;
                    })
                  }
                  className="block min-h-10 w-full rounded-md border-2 border-field bg-white px-2"
                >
                  <option value="">Not in this file</option>
                  {file.header.map((column, index) => (
                    <option key={`${column}-${index}`} value={index}>
                      {column || `(column ${index + 1})`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {missing.length > 0 ? (
            <p role="alert" className="font-semibold text-danger">
              Match these required columns: {missing.join(', ')}.
            </p>
          ) : null}
        </section>
      ) : null}

      {file && validation && missing.length === 0 ? (
        <section aria-labelledby="preview-heading" className="space-y-4">
          <h2 id="preview-heading" className="text-2xl text-navy">
            Preview
          </h2>
          <p>
            <span className="font-semibold">{validation.accepted.length}</span> rows ready to import ·{' '}
            <span className="font-semibold">{validation.rejected.length}</span> rows with problems
            {validation.duplicateRows > 0 ? ` (${validation.duplicateRows} duplicates within the file)` : ''}.
          </p>
          {validation.accepted.length > 0 ? (
            <ScrollTable label="Rows to import">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="py-2 text-left font-semibold">
                  Rows to import{validation.accepted.length > 25 ? ' (first 25)' : ''}
                </caption>
                <thead>
                  <tr className="border-b-2 border-rule text-slate">
                    <th scope="col" className="py-2 pr-3">Row</th>
                    <th scope="col" className="py-2 pr-3">Rep</th>
                    <th scope="col" className="py-2 pr-3">Metric</th>
                    <th scope="col" className="py-2 pr-3">Value</th>
                    <th scope="col" className="py-2 pr-3">Stored as</th>
                    <th scope="col" className="py-2">Evidence and device</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {validation.accepted.slice(0, 25).map((row) => {
                    const metric = requireMetric(row.metric_key);
                    return (
                      <tr key={row.row}>
                        <td className="py-2 pr-3">{row.row}</td>
                        <td className="py-2 pr-3">
                          {row.rep}
                          {row.pitch_type ? ` · ${PITCH_TYPE_LABELS[row.pitch_type]}` : ''}
                        </td>
                        <td className="py-2 pr-3">{metric.name}</td>
                        <td className="py-2 pr-3">
                          {metric.valueKind === 'boolean' ? (row.value === 1 ? 'yes' : 'no') : `${row.value} ${row.unit}`}
                        </td>
                        <td className="py-2 pr-3">
                          {metric.valueKind === 'boolean' ? '—' : `${Math.round(row.canonical_value * 1000) / 1000} ${metric.unit}`}
                        </td>
                        <td className="py-2">
                          {row.acquisition.replace('_', ' ')}
                          {row.device_label ? ` · ${row.device_label}` : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollTable>
          ) : null}
          {validation.rejected.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">Rows that will not be imported</h3>
              <ul className="max-h-80 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
                {validation.rejected.map((row) => (
                  <li key={row.row}>
                    Row {row.row}: {row.reasons.join(' ')}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button onClick={() => void submit()} disabled={busy || validation.accepted.length === 0}>
            {busy ? 'Importing…' : `Import ${validation.accepted.length} ${validation.accepted.length === 1 ? 'row' : 'rows'}`}
          </Button>
        </section>
      ) : null}

      {outcome ? (
        <div role="status" className="space-y-2 border-l-4 border-success bg-success-soft px-4 py-3">
          <p className="font-semibold">
            Imported {outcome.accepted}. {outcome.duplicates > 0 ? `${outcome.duplicates} were already imported and skipped. ` : ''}
            {outcome.rejected_count > 0 ? `${outcome.rejected_count} were rejected by the database:` : ''}
          </p>
          {outcome.rejected.length > 0 ? (
            <ul className="list-disc pl-5 text-sm">
              {outcome.rejected.map((row) => (
                <li key={`${row.row}-${row.reason}`}>
                  Row {row.row}: {row.reason}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-sm">Imported values are labelled “imported from a file” and wait for review like any other entry.</p>
        </div>
      ) : null}
    </div>
  );
}
