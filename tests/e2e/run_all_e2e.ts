/**
 * 4Rent Master E2E Test Runner
 *
 * Discovers and executes all E2E test suites across:
 * - tests/e2e/tier1_features/
 * - tests/e2e/tier2_boundaries/
 * - tests/e2e/tier3_pairwise/
 * - tests/e2e/tier4_scenarios/
 * - tests/e2e/harness/
 *
 * Produces a structured summary report table and enforces zero-failure exit codes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import nodeTest, { afterEach } from 'node:test';
import { resetBrowserEnv } from './harness/browser_env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

interface TierInfo {
  id: string;
  name: string;
  dir: string;
  files: string[];
  tests: number;
  passed: number;
  failed: number;
}

const tiers: Record<string, TierInfo> = {
  tier1: {
    id: 'tier1',
    name: 'Tier 1 — Feature Tests (F1–F20)',
    dir: path.join(__dirname, 'tier1_features'),
    files: [],
    tests: 0,
    passed: 0,
    failed: 0,
  },
  tier2: {
    id: 'tier2',
    name: 'Tier 2 — Boundary & Stress Tests',
    dir: path.join(__dirname, 'tier2_boundaries'),
    files: [],
    tests: 0,
    passed: 0,
    failed: 0,
  },
  tier3: {
    id: 'tier3',
    name: 'Tier 3 — Combinatorial Pairwise',
    dir: path.join(__dirname, 'tier3_pairwise'),
    files: [],
    tests: 0,
    passed: 0,
    failed: 0,
  },
  tier4: {
    id: 'tier4',
    name: 'Tier 4 — Realistic Landlord Workflows',
    dir: path.join(__dirname, 'tier4_scenarios'),
    files: [],
    tests: 0,
    passed: 0,
    failed: 0,
  },
  harness: {
    id: 'harness',
    name: 'Harness & Infrastructure Verification',
    dir: path.join(__dirname, 'harness'),
    files: [],
    tests: 0,
    passed: 0,
    failed: 0,
  },
  root: {
    id: 'root',
    name: 'Root E2E Integration Suites',
    dir: __dirname,
    files: [],
    tests: 0,
    passed: 0,
    failed: 0,
  },
};

const suiteToTierMap = new Map<string, TierInfo>();
let currentImportingTier: TierInfo = tiers.harness;

function indexSuitesInFile(filePath: string, tier: TierInfo): void {
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const regex = /(?:describe|test|it|suite)\(\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = regex.exec(code)) !== null) {
      suiteToTierMap.set(match[1].trim(), tier);
    }
  } catch {
    // ignore read errors
  }
}

// Track individual test executions via node:test afterEach hook
afterEach((t: any) => {
  const fullName: string = (t.fullName || t.name || '').trim();
  const parts = fullName.split(' > ').map((p) => p.trim());

  let matchedTier: TierInfo | undefined;

  // Try matching any suite name in the breadcrumb hierarchy
  for (const part of parts) {
    if (suiteToTierMap.has(part)) {
      matchedTier = suiteToTierMap.get(part);
      break;
    }
  }

  // Fallback to pattern matching
  if (!matchedTier) {
    const lower = fullName.toLowerCase();
    if (lower.includes('tier 1') || lower.includes('tier1')) matchedTier = tiers.tier1;
    else if (lower.includes('tier 2') || lower.includes('tier2')) matchedTier = tiers.tier2;
    else if (lower.includes('tier 3') || lower.includes('tier3')) matchedTier = tiers.tier3;
    else if (lower.includes('tier 4') || lower.includes('tier4')) matchedTier = tiers.tier4;
    else if (lower.includes('harness')) matchedTier = tiers.harness;
    else matchedTier = tiers.root;
  }

  matchedTier.tests++;
  if (t.error) {
    matchedTier.failed++;
  } else {
    matchedTier.passed++;
  }
});

function discoverTestFiles(dir: string, recursive: boolean = false): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...discoverTestFiles(fullPath, recursive));
    } else if (entry.isFile()) {
      const isTestFile =
        (entry.name.endsWith('.test.ts') ||
          entry.name.endsWith('.spec.ts') ||
          entry.name.endsWith('.test.js') ||
          entry.name.endsWith('.spec.js')) &&
        !entry.name.endsWith('.d.ts');

      // Also include any .ts files inside tier directories if they are suites
      const isTierSuite =
        dir.includes('tier') &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.d.ts');

      if (isTestFile || isTierSuite) {
        results.push(fullPath);
      }
    }
  }

  return results.sort();
}

async function main() {
  const startTime = Date.now();

  console.log('='.repeat(80));
  console.log('4Rent Property & Sub-Meter Billing System — E2E Master Test Runner');
  console.log('='.repeat(80));
  console.log(`Node Runtime: ${process.version}`);
  console.log(`Project Root: ${projectRoot}`);
  console.log(`Timestamp:    ${new Date().toISOString()}`);
  console.log('-'.repeat(80));

  // 1. Discover test files in each tier
  tiers.tier1.files = discoverTestFiles(tiers.tier1.dir, true);
  tiers.tier2.files = discoverTestFiles(tiers.tier2.dir, true);
  tiers.tier3.files = discoverTestFiles(tiers.tier3.dir, true);
  tiers.tier4.files = discoverTestFiles(tiers.tier4.dir, true);
  tiers.harness.files = discoverTestFiles(tiers.harness.dir, false);
  tiers.root.files = discoverTestFiles(__dirname, false).filter(
    (f) => path.dirname(f) === __dirname && path.basename(f) !== 'run_all_e2e.ts'
  );

  let totalFilesCount = 0;
  for (const tier of Object.values(tiers)) {
    totalFilesCount += tier.files.length;
    for (const file of tier.files) {
      indexSuitesInFile(file, tier);
    }
    console.log(
      `• ${tier.name.padEnd(42)}: ${tier.files.length.toString().padStart(3)} file(s)`
    );
  }
  console.log('-'.repeat(80));
  console.log(`Total discovered test files: ${totalFilesCount}`);
  console.log('='.repeat(80));
  console.log('Executing test suites...\n');

  // 2. Sequential in-process execution with clean isolation
  for (const tier of Object.values(tiers)) {
    if (tier.files.length === 0) continue;

    for (const file of tier.files) {
      const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
      console.log(`\n▶ [${tier.id.toUpperCase()}] Running: ${relPath}`);
      resetBrowserEnv();

      try {
        const fileUrl = pathToFileURL(file).href;
        await import(fileUrl);
      } catch (err: any) {
        console.error(`✖ Failed to load test suite ${relPath}:`, err);
        tier.tests++;
        tier.failed++;
      }
    }
  }

  // 3. Register exit reporter to print structured summary table
  process.on('exit', () => {
    const elapsed = Date.now() - startTime;
    printSummaryTable(elapsed);
  });
}

function printSummaryTable(durationMs: number): void {
  console.log('\n' + '='.repeat(84));
  console.log('                        4RENT E2E TEST EXECUTION SUMMARY                            ');
  console.log('='.repeat(84));
  console.log(
    'Tier / Test Category'.padEnd(40) +
      ' | Files | Tests | Passed | Failed | Status'
  );
  console.log('-'.repeat(84));

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const tier of Object.values(tiers)) {
    totalTests += tier.tests;
    totalPassed += tier.passed;
    totalFailed += tier.failed;

    let status = 'PASS';
    if (tier.failed > 0) {
      status = 'FAIL';
    } else if (tier.tests === 0 && tier.files.length === 0) {
      status = 'PENDING';
    }

    const row =
      tier.name.padEnd(40) +
      ' | ' +
      tier.files.length.toString().padStart(5) +
      ' | ' +
      tier.tests.toString().padStart(5) +
      ' | ' +
      tier.passed.toString().padStart(6) +
      ' | ' +
      tier.failed.toString().padStart(6) +
      ' | ' +
      status.padEnd(7);

    console.log(row);
  }

  console.log('='.repeat(84));
  console.log(
    `TOTALS: ${totalTests} tests across ${
      tiers.tier1.files.length +
      tiers.tier2.files.length +
      tiers.tier3.files.length +
      tiers.tier4.files.length +
      tiers.harness.files.length +
      tiers.root.files.length
    } files | ${totalPassed} PASSED | ${totalFailed} FAILED | Duration: ${durationMs}ms`
  );
  console.log('='.repeat(84));

  if (totalFailed > 0) {
    console.error('\n✖ OVERALL VERDICT: FAIL (One or more E2E tests failed)');
    process.exitCode = 1;
  } else {
    console.log('\n✔ OVERALL VERDICT: PASS (All executed E2E tests passed cleanly)');
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error('Fatal unhandled error in E2E master test runner:', err);
  process.exit(1);
});
