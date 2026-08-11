/**
 * SP-A-088 — ONE editorial voice control (dry).
 * Takes 5 live AUTO articles, re-runs writeDraft on their source pack,
 * compares vs current pub + one Chief sample.
 *
 *   ARTICLES_STORE=sqlite npx tsx scripts/spa088-one-voice-control.ts
 */
import 'dotenv/config';
import { writeDraft } from '../src/lib/ai/editor';
import { getAllArticlesFromDb } from '../src/lib/data-store/articles-repo';

function wc(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isChief(a: { agentId?: string; slug?: string }): boolean {
  const aid = a.agentId || '';
  const s = a.slug || '';
  return aid.startsWith('chief') || s.startsWith('chief-');
}

function finishThought(text: string): boolean {
  const vague =
    /мириться с (его |её |их )?габарит|довольно тяж|больш(ой|ая)\s+(аккумулятор|запас)|очень быстр|долго работ|компактн\w*(?![\s\S]{0,40}\d)/i.test(
      text,
    );
  if (!vague) return true;
  return /\d[\d\s.,]*\s*(г|кг|мм|см|мА·?ч|mAh|Вт|час|ч\.|мин|км|%)/i.test(text);
}

function hasLiveEnding(text: string): 'YES' | 'NO' | 'NOT APPROPRIATE' {
  if (/рак|смерт|болезн|трагед/i.test(text)) return 'NOT APPROPRIATE';
  const last = text.trim().split(/\n+/).filter(Boolean).slice(-1)[0] || '';
  if (/независим\w+\s+испытан|цена не объявл|купить здесь/i.test(last)) return 'NO';
  if (last.length > 20 && last.length < 280) return 'YES';
  return 'NO';
}

async function main() {
  if (process.env.ARTICLES_STORE !== 'sqlite') {
    console.error('Need ARTICLES_STORE=sqlite');
    process.exit(1);
  }

  const all = getAllArticlesFromDb().sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  const autos = all.filter((a) => !isChief(a)).slice(0, 5);
  const chief = all.find((a) => isChief(a));

  console.log('SP-A-088 ONE EDITORIAL VOICE CONTROL\n');

  for (const a of autos) {
    console.log('='.repeat(72));
    console.log('SLUG', a.slug);
    console.log('AGENT', a.agentId || 'none');
    console.log('\nRAW SOURCE / PARSER EXTRACT (stored summary+content head):');
    console.log(clamp(`${a.summary}\n\n${a.content}`, 900));
    console.log('\nCURRENT AUTO ARTICLE:');
    console.log('TITLE', a.title);
    console.log(clamp(a.content, 900));
    console.log('CURRENT WC', wc(a.content));

    const draft = await writeDraft(
      {
        format: 'article',
        mode: /robot|ai|ии|llm|gpt|исследован/i.test(`${a.title}\n${a.content}`)
          ? 'ai_radar'
          : 'gadget',
        title: a.title,
        sourceName: a.sourceUrl || 'source',
        text: [
          'SOURCE PACK (parser extract — Editor пишет самостоятельный обзор):',
          a.title,
          a.summary,
          a.content,
          a.sourceUrl ? `Source URL (internal): ${a.sourceUrl}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
      { technicalVerdict: 'PASS: SP-A-088 one-voice control rewrite' },
    );

    console.log('\nNEW EDITOR RESULT:');
    console.log('TITLE', draft.title);
    console.log(draft.text);
    console.log('\nSTRONGEST FACT (lead):', draft.text.split(/(?<=[.!?…])\s+/)[0] || '');
    console.log('HUMAN ANGLE:', /человек|жизн|быт|работ|дом|пациент|водител|читател/i.test(draft.text) ? 'present' : 'weak');
    console.log('WORD COUNT:', wc(draft.text));
    console.log('FINISH THE THOUGHT:', finishThought(draft.text) ? 'YES' : 'NO');
    console.log('IRONY / LIVE ENDING:', hasLiveEnding(draft.text));
    console.log();
  }

  if (chief) {
    console.log('='.repeat(72));
    console.log('CHIEF SAMPLE:', chief.slug);
    console.log('TITLE', chief.title);
    console.log(clamp(chief.content, 700));
    console.log('WC', wc(chief.content));
  }

  const lastAuto = autos[0];
  console.log('\n' + '='.repeat(72));
  console.log('COMPARE: 1 Chief vs 1 AUTO (current live)');
  console.log('CHIEF:', chief?.title);
  console.log('AUTO:', lastAuto?.title);
  console.log(
    'DO THEY FEEL LIKE THE SAME NEWSROOM?',
    chief && lastAuto && wc(chief.content) >= 150 && wc(lastAuto.content) >= 150
      ? 'CHECK MANUALLY — control rewrites above show target voice'
      : 'NO (thin AUTO or missing Chief)',
  );
}

function clamp(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
