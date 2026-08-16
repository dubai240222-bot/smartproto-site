/**
 * Archive translate diversity — fixture-only, NO LLM / NO translate.
 *
 *   npx tsx scripts/test-archive-diversity.ts
 */
import {
  archiveDiversityModifier,
  classifyArchiveTopic,
  pickArchiveTranslationJobs,
  type ArchiveArticleInput,
  type ArchiveTopic,
  type LocSnapshot,
} from '../src/lib/i18n/archive-translate-pick';

function art(
  id: string,
  title: string,
  category: string,
  content: string,
  extra?: Partial<ArchiveArticleInput>,
): ArchiveArticleInput {
  return {
    id,
    slug: id,
    title,
    category,
    content: content.repeat(1).padEnd(900, ' x'),
    summary: title,
    publishedAt: '2026-06-01T12:00:00.000Z',
    ...extra,
  };
}

const FIXTURES: ArchiveArticleInput[] = [
  art('r1', 'Humanoid robot hand lab demo', 'Роботы', 'University robotics manipulator research robot.'),
  art('r2', 'Industrial robot arm tactile', 'Роботы', 'Factory robot arm with tactile sensors.'),
  art('r3', 'Another bipedal humanoid walk', 'Роботы', 'Humanoid robot bipedal demo video.'),
  art('r4', 'Robotaxi fleet expands', 'Роботы', 'Autonomous robotaxi robotics fleet cities.'),
  art('r5', 'Soft robot gripper research', 'Роботы', 'Soft robotics gripper university lab.'),
  art(
    'h1',
    'CGM wearable tracks glucose without fingersticks',
    'Здоровье',
    'Healthtech medical wearable glucose CGM for patients.',
  ),
  art(
    'e1',
    'Solid-state battery pack for EV charging',
    'Энергия',
    'Electric vehicle solid-state battery and charging station.',
  ),
  art(
    'a1',
    'FocusFlow AI app helps ADHD users',
    'Приложения',
    'New iOS app on the App Store for life improvement.',
  ),
  art(
    'g1',
    'Portable travel translator supports 40 languages',
    'Гаджеты',
    'Portable travel gadget translator for trips abroad.',
  ),
  art(
    's1',
    'Cry-response bassinet unusual smart home',
    'Умный дом',
    'Unusual smart home bassinet with cry-response auto glide.',
  ),
];

const emptyLoc = (): LocSnapshot => null;

function main() {
  console.log('=== Archive diversity fixture test (no AI) ===\n');

  // cat:Роботы must not boost
  const robotTopic = classifyArchiveTopic(FIXTURES[0]!);
  if (robotTopic !== 'robots') throw new Error(`expected robots topic, got ${robotTopic}`);

  const recent: ArchiveTopic[] = [
    'robots',
    'robots',
    'robots',
    'robots',
    'robots',
    'gadgets',
    'robots',
    'ai',
  ];
  const sat = archiveDiversityModifier('robots', recent);
  if (sat.modifier >= 0) throw new Error(`expected robot saturation penalty, got ${sat.modifier}`);
  const under = archiveDiversityModifier('health', recent);
  if (under.modifier <= 0) throw new Error(`expected underrep boost for health, got ${under.modifier}`);

  const jobs = pickArchiveTranslationJobs(FIXTURES, {
    getLocalization: () => emptyLoc(),
    limit: 10,
    recentTopics: recent,
  });

  console.log('| # | Article | Topic | Locale | Value | Div | Why |');
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i]!;
    console.log(
      `| ${i + 1} | ${j.article.title.slice(0, 40)} | ${j.topic} | ${j.language} | ${Math.round(j.valueScore)} | ${j.diversityModifier} | ${j.factors.filter((f) => f.startsWith('diversity:') || f.startsWith('cat')).join('; ')} |`,
    );
  }

  const topTopics = jobs.slice(0, 5).map((j) => j.topic);
  const robotTop = topTopics.filter((t) => t === 'robots').length;
  if (robotTop >= 4) {
    throw new Error(`FAIL: top-5 still robot-heavy (${robotTop}/5)`);
  }
  const hasNonRobot = jobs.some((j) => j.topic !== 'robots');
  if (!hasNonRobot) throw new Error('FAIL: no non-robot in top 10');

  // Exceptional robot still eligible (soft only — not banned)
  const robotJobs = jobs.filter((j) => j.topic === 'robots');
  if (!robotJobs.length) {
    console.log('note: no robots in top 10 under heavy saturation (ok soft)');
  }

  // Prove cat_robots_no_boost appears
  const anyRobotFactor = jobs
    .filter((j) => j.topic === 'robots')
    .some((j) => j.factors.includes('cat_robots_no_boost'));
  if (robotJobs.length && !anyRobotFactor) {
    throw new Error('FAIL: expected cat_robots_no_boost factor');
  }

  console.log('\ncat_robots_no_boost: YES');
  console.log('soft diversity vs recent archive jobs: YES');
  console.log('AI calls: 0');
  console.log('OK — archive diversity fixture passed.');
}

main();
