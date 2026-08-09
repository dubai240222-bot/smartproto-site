/**
 * SP-A-065F control test — diversity simulation + research photo on 3 live stories.
 * Dry-run only. No publish / no mass backfill.
 *
 *   npx tsx scripts/spa065f-control-test.ts
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  focusOfArticle,
  inferEditorialFocus,
  pickDiversityWinner,
  roboticsResearchStreak,
  simulateDiversitySequence,
} from '../src/lib/newsroom/diversity-guard';
import { resolveArticlePhotos } from '../src/lib/collectors/photo-scout';

const OUT = path.resolve(process.cwd(), 'data', 'spa065f');
const MEDIA = path.resolve(OUT, 'media-test');

const CASES = [
  {
    key: 'tacta',
    title: 'TactaBot: роботизированные руки для сложных производственных задач',
    text:
      'Tacta Systems представила TactaBot — роботизированную руку с системой Skill Capture и тактильными датчиками. Dexterous Intelligence переносит навыки оператора.',
    sourceUrl:
      'https://www.therobotreport.com/tacta-systems-takes-aim-high-skilled-manufacturing-work-tactabot/',
    slug: 'spa065f-tactabot-photo-test',
  },
  {
    key: 'ieee',
    title: 'Оптическая система обновляет AI-модели роботов в реальном времени',
    text:
      'Researchers developed an optical receiver that can update a robot AI model on the fly using light signals, changing processor memory directly in the lab.',
    sourceUrl: 'https://spectrum.ieee.org/ai-in-robotics',
    slug: 'spa065f-ieee-optical-photo-test',
  },
  {
    key: 'csail',
    title: 'Система для роботов улучшает манипуляции с материалами',
    text:
      'MIT CSAIL researchers built a machine learning system giving robots a better feel for object manipulation with liquids and deformable materials.',
    sourceUrl: 'https://www.csail.mit.edu/news/giving-robots-better-feel-object-manipulation-0',
    slug: 'spa065f-csail-photo-test',
  },
] as const;

async function main() {
  console.log('SP-A-065F control test | NO PUBLISH\n');

  // --- Diversity simulation (last 3 live robotics + hypothetical next tick) ---
  const recentLive = [
    {
      title: 'Система для роботов улучшает манипуляции с материалами',
      summary: 'MIT CSAIL manipulation',
      tags: ['робототехника'],
      sourceUrl: 'https://www.csail.mit.edu/news/giving-robots-better-feel-object-manipulation-0',
    },
    {
      title: 'Оптическая система обновляет AI-модели роботов в реальном времени',
      summary: 'IEEE optical',
      tags: ['робототехника', 'AI'],
      sourceUrl: 'https://spectrum.ieee.org/ai-in-robotics',
    },
    {
      title: 'TactaBot: роботизированные руки для сложных производственных задач',
      summary: 'TactaBot',
      tags: ['робототехника'],
      sourceUrl: 'https://www.therobotreport.com/tacta-systems-takes-aim-high-skilled-manufacturing-work-tactabot/',
    },
  ];

  const beforeFocus = recentLive.slice(0, 5).map((a) => focusOfArticle(a));
  console.log('DIVERSITY BEFORE:');
  console.log(`  streak2=${roboticsResearchStreak(recentLive, 2)}`);
  console.log(`  recent focus: ${beforeFocus.join(' → ')}`);

  const nextTickPassers = [
    {
      title: 'Meta gesture wristband expands handwriting control',
      text: 'Meta neuromuscular wristband unusual invention wearable',
      sourceName: 'New Atlas Wearables',
      score: 82,
    },
    {
      title: 'Giving robots an even better foam manipulation upgrade',
      text: 'MIT CSAIL robotics research lab prototype',
      sourceName: 'MIT CSAIL',
      score: 86,
    },
    {
      title: 'Optical Tech Would Update a Robot’s AI on the Fly (redux)',
      text: 'IEEE robotics research optical',
      sourceName: 'IEEE Spectrum Robotics',
      score: 85,
    },
  ];

  const sim = simulateDiversitySequence(recentLive, nextTickPassers, 10);
  const decision = pickDiversityWinner({
    passers: nextTickPassers.map((c) => ({
      item: c,
      score: c.score,
      focus: inferEditorialFocus(c),
    })),
    recent: recentLive,
  });

  console.log('\nDIVERSITY AFTER (simulated next tick):');
  console.log(`  decision: ${decision.reason}`);
  console.log(
    `  pick: ${decision.winner ? `${decision.winner.focus} ${decision.winner.score} — ${decision.winner.item.title}` : 'none'}`,
  );
  console.log(
    `  would avoid 4th robotics consecutive: ${
      decision.winner && decision.winner.focus !== 'robotics_research' ? 'YES' : 'NO (outstanding or only robotics)'
    }`,
  );

  // Outstanding robotics (+10) still allowed
  const outstanding = pickDiversityWinner({
    passers: [
      { item: nextTickPassers[0], score: 72, focus: inferEditorialFocus(nextTickPassers[0]) },
      { item: nextTickPassers[1], score: 88, focus: inferEditorialFocus(nextTickPassers[1]) },
    ],
    recent: recentLive,
  });
  console.log(`  outstanding robotics check: ${outstanding.reason}`);

  // --- Photo control ---
  fs.mkdirSync(MEDIA, { recursive: true });
  process.env.SMARTPROTO_MEDIA_DIR = MEDIA;

  const photoResults: Record<string, unknown> = {};
  for (const c of CASES) {
    console.log(`\nPhoto test: ${c.key}`);
    const report = await resolveArticlePhotos({
      slug: c.slug,
      title: c.title,
      text: c.text,
      sourceUrl: c.sourceUrl,
      maxResearchPages: 2,
    });
    const row = {
      candidates: report.candidatesFound,
      selected: report.selected.length,
      matchLevel: report.imageMatchLevel || (report.selected.length ? 'unknown' : 'none'),
      label: report.imageLabel || null,
      researchMode: report.researchMode || false,
      entity: {
        brand: report.entity.brand,
        model: report.entity.model,
        object: report.entity.object,
        status: report.entity.status,
      },
      notes: report.notes.slice(0, 8),
      hero: report.selected[0]?.url || null,
      heroSource: report.selected[0]?.sourceUrl || null,
    };
    photoResults[c.key] = row;
    console.log(
      `  candidates=${row.candidates} selected=${row.selected} matchLevel=${row.matchLevel}`,
    );
    console.log(`  notes: ${row.notes.join(' | ')}`);
    if (row.heroSource) console.log(`  heroSource: ${row.heroSource}`);
  }

  console.log('\n=== PHOTO SUMMARY ===');
  console.log(
    `Tacta: candidates=${(photoResults.tacta as any).candidates} → selected=${(photoResults.tacta as any).selected} → matchLevel=${(photoResults.tacta as any).matchLevel}`,
  );
  console.log(
    `IEEE: candidates=${(photoResults.ieee as any).candidates} → selected=${(photoResults.ieee as any).selected} → matchLevel=${(photoResults.ieee as any).matchLevel}`,
  );
  console.log(
    `CSAIL: candidates=${(photoResults.csail as any).candidates} → selected=${(photoResults.csail as any).selected} → matchLevel=${(photoResults.csail as any).matchLevel}`,
  );

  const report = {
    id: 'SP-A-065F-R1',
    diversity: {
      before: beforeFocus,
      streak2: roboticsResearchStreak(recentLive, 2),
      afterDecision: decision.reason,
      afterPick: decision.winner
        ? { focus: decision.winner.focus, score: decision.winner.score, title: decision.winner.item.title }
        : null,
      outstandingCheck: outstanding.reason,
      simulation: sim,
    },
    photos: photoResults,
  };

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'spa065f-r1.json'), JSON.stringify(report, null, 2));
  console.log(`\nWrote ${path.join(OUT, 'spa065f-r1.json')}`);
  console.log('STOP — no publish / no backfill.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
