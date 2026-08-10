/**
 * SP-A-074 — Retention / night cleanup CLI.
 *
 *   npx tsx scripts/run-retention-cleanup.ts --dry-run
 *   npx tsx scripts/run-retention-cleanup.ts --execute
 *
 * Env:
 *   SMARTPROTO_DB_PATH, SMARTPROTO_MEDIA_DIR, SMARTPROTO_DATA_DIR
 *   SMARTPROTO_RETENTION_DAYS=10
 *   SMARTPROTO_MIN_ARTICLES=100
 *   SMARTPROTO_MAX_DELETE_PER_RUN=25
 *   SMARTPROTO_ALLOW_LOCAL_RETENTION=1   # required for non-prod paths
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildRetentionPlan,
  executeRetentionPlan,
  formatRetentionReport,
  loadRetentionConfig,
} from '../src/lib/retention/cleanup';
import {
  resolveDataDir,
  resolveDbPath,
  resolveMediaRoot,
} from '../src/lib/retention/paths';

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run') || !argv.includes('--execute');
  const execute = argv.includes('--execute');
  return { dryRun: dryRun && !execute, execute };
}

async function main() {
  const { dryRun, execute } = parseArgs(process.argv.slice(2));
  const dbPath = resolveDbPath();
  const mediaRoot = resolveMediaRoot();
  const dataDir = resolveDataDir();
  const config = loadRetentionConfig();

  // Force sqlite store for repo reads
  process.env.ARTICLES_STORE = 'sqlite';
  process.env.SMARTPROTO_DB_PATH = dbPath;

  if (!fs.existsSync(dbPath) && !fs.existsSync(`${dbPath}-wal`)) {
    console.error(`DB not found: ${dbPath}`);
    process.exit(2);
  }

  const { getAllArticlesFromDb, deleteArticleBySlug, countArticles } = await import(
    '../src/lib/data-store/articles-repo'
  );

  const before = countArticles();
  const articles = getAllArticlesFromDb();

  const plan = buildRetentionPlan({
    articles,
    dryRun: !execute,
    config,
    dbPath,
    mediaRoot,
    dataDir,
  });

  console.log(formatRetentionReport(plan));
  console.log(`COUNT CHECK: repo=${before} loaded=${articles.length}`);

  // Persist dry-run / execute report under data dir (allowed)
  try {
    const reportDir = path.join(dataDir, 'retention');
    if (
      dataDir.startsWith('/opt/apps/smartproto') ||
      dataDir.startsWith('/app/data') ||
      process.env.SMARTPROTO_ALLOW_LOCAL_RETENTION === '1'
    ) {
      fs.mkdirSync(reportDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const out = path.join(reportDir, `${stamp}-${execute ? 'execute' : 'dry-run'}.json`);
      fs.writeFileSync(out, JSON.stringify(plan, null, 2) + '\n');
      console.log(`REPORT FILE: ${out}`);
    }
  } catch (err) {
    console.warn(
      `Could not write report file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!execute) {
    console.log('DRY-RUN complete — no deletes performed.');
    return;
  }

  // Live safety: never delete if remaining would drop below min
  if (plan.articlesRemaining < plan.config.minArticles) {
    console.error('ABORT: articlesRemaining would fall below MIN_ARTICLES');
    process.exit(3);
  }

  const result = executeRetentionPlan(plan, (slug) => {
    const live = countArticles();
    if (live <= plan.config.minArticles) {
      throw new Error(`Refusing delete ${slug}: live count ${live} <= MIN ${plan.config.minArticles}`);
    }
    deleteArticleBySlug(slug);
    const after = countArticles();
    if (after < plan.config.minArticles) {
      throw new Error(`Post-delete count ${after} below MIN — unexpected`);
    }
  });

  console.log('\n' + formatRetentionReport(result));
  console.log(`LIVE COUNT AFTER: ${countArticles()}`);
  if (result.errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
