/**
 * SP-A-097F1 seed — fixtures cleared; this now purges leftover [TEST] rows in SQLite.
 * Prefer: npx tsx scripts/spa098-purge-test-fixtures.ts
 */
async function main() {
  console.log('SP-A-097F1 fixtures retired — running purge helper');
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(
    'npx',
    ['tsx', 'scripts/spa098-purge-test-fixtures.ts'],
    { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' },
  );
  process.exit(r.status ?? 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
