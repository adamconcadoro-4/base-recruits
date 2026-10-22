// Turns a Playwright JSON report into a GitHub Actions notice and fails when
// any test failed or nothing passed.
//
//   node scripts/ci/report-playwright.mjs <report.json> "<label>"

import { existsSync, readFileSync } from 'node:fs';

const [file, label = 'End-to-end tests'] = process.argv.slice(2);

if (!file || !existsSync(file)) {
  console.log(`::error title=${label}::No report was written, so the tests did not run.`);
  process.exit(1);
}

const stats = JSON.parse(readFileSync(file, 'utf8')).stats ?? {};
const passed = stats.expected ?? 0;
const failed = stats.unexpected ?? 0;
const flaky = stats.flaky ?? 0;
const skipped = stats.skipped ?? 0;
const summary = `${passed} passed, ${failed} failed, ${flaky} flaky, ${skipped} skipped`;

if (failed > 0 || flaky > 0 || passed === 0) {
  console.log(`::error title=${label}::${summary}`);
  process.exit(1);
}
console.log(`::notice title=${label}::${summary}`);
