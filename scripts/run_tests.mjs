import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createJiti } from 'jiti';

const testsDir = resolve('tests');
const testFiles = readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.ts'))
  .sort();

if (testFiles.length === 0) {
  console.error('No test files found in tests/.');
  process.exit(1);
}

const jiti = createJiti(import.meta.url, { jsx: true });
for (const file of testFiles) {
  await jiti.import(join(testsDir, file));
}
