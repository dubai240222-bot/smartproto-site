/**
 * SP-A-078 — dry Control-5: rewrite 5 recent AUTO articles with new Editor DNA.
 * Does NOT publish.
 */
import 'dotenv/config';
import fs from 'node:fs';

type Row = {
  slug: string;
  title: string;
  sourceUrl: string;
  content: string;
  summary?: string;
  agentId?: string;
};

function strongestFactGuess(text: string): string {
  const m =
    text.match(/\b\d[\d\s.,]{0,12}\s*(?:мАч|Вт|Гц|литр|миль|км|%|мач|OLED|ГБ|ТБ)/i) ||
    text.match(/(?:\d[\d\s]{0,8}(?:тысяч|млн)?[^.!?\n]{0,80})/);
  return (m?.[0] || text.split(/[.!?]/)[0] || '').trim().slice(0, 160);
}

async function main() {
  const rows = JSON.parse(fs.readFileSync('/tmp/spa078-auto-full.json', 'utf8')) as Row[];
  const { writeDraft } = await import('../src/lib/ai/editor');

  const out: unknown[] = [];
  for (const row of rows.slice(0, 5)) {
    const oldLead = (row.content || '').trim().split(/\n+/).filter(Boolean)[0] || '';
    const articleData = {
      format: 'article' as const,
      title: row.title,
      text: row.content,
      sourceUrl: row.sourceUrl,
      sourceName: 'auto-control',
      mode: 'gadget' as const,
    };
    const reviewData = {
      technicalVerdict: 'PASS: control rewrite only (no publish)',
    };
    let draft;
    try {
      draft = await writeDraft(articleData, reviewData);
    } catch (err) {
      out.push({
        sourceTitle: row.title,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    const newLead = draft.text.trim().split(/\n+/).filter(Boolean)[0] || '';
    out.push({
      sourceTitle: row.title,
      oldStyleTitle: row.title,
      newStyleTitle: draft.title,
      strongestFact: strongestFactGuess(`${row.title}\n${row.content}`),
      oldLead: oldLead.slice(0, 280),
      newLead: newLead.slice(0, 280),
      whyNewIsMoreInteresting:
        /^компани|представлен|появилась информация|на рынок выходит|анонсир/i.test(oldLead) &&
        !/^компани|представлен|появилась информация|на рынок выходит|анонсир/i.test(newLead)
          ? 'NEW opens with fact/human meaning instead of company announcement'
          : 'Compare lead strength vs company-first old style',
    });
  }

  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync('/tmp/spa078-control5.json', JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
