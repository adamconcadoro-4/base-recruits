// Turns a Vitest JSON report into a GitHub Actions notice (visible in the run
// summary and through the checks API) and fails the step when nothing ran,
// anything failed, or — with --no-skips — anything was skipped.
//
//   node scripts/ci/report-vitest.mjs <report.json> "<label>" [--no-skips]

import { readFileSync } from 'node:fs';

const [file, label = 'Vitest', flag] = process.argv.slice(2);
if (!file) {
  console.error('usage: report-vitest.mjs <report.json> <label> [--no-skips]');
  process.exit(2);
}

const report = JSON.parse(readFileSync(file, 'utf8'));
const passed = report.numPassedTests ?? 0;
const failed = report.numFailedTests ?? 0;
const skipped = (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0);
const files = Array.isArray(report.testResults) ? report.testResults.length : 0;
const summary = `${passed} passed, ${failed} failed, ${skipped} skipped, in ${files} files`;

const problems = [];
if (passed === 0) problems.push('no tests passed');
if (failed > 0) problems.push('tests failed');
if (flag === '--no-skips' && skipped > 0) problems.push('tests were skipped');

if (problems.length > 0) {
  console.log(`::error title=${label}::${summary} (${problems.join('; ')})`);
  process.exit(1);
}
console.log(`::notice title=${label}::${summary}`);
