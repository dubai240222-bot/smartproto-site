/**
 * SP-A-078 v1 — dry Control-5 (no publish).
 */
import 'dotenv/config';
import fs from 'node:fs';

type Row = {
  slug: string;
  title: string;
  sourceUrl: string;
  content: string;
  author?: string;
  agentId?: string;
};

function strongestFactGuess(text: string): string {
  const m =
    text.match(/\b\d[\d\s.,]{0,12}\s*(?:мАч|Вт|Гц|кГц|литр|миль|км|%|нит|OLED|ГБ|ТБ)/i) ||
    text.match(/(?:\d[\d\s]{0,8}(?:тысяч|млн)?[^.!?\n]{0,80})/);
  return (m?.[0] || text.split(/[.!?]/)[0] || '').trim().slice(0, 160);
}

function endingStyle(text: string): string {
  const paras = text.trim().split(/\n+/).filter(Boolean);
  const last = paras[paras.length - 1] || '';
  if (/[?？]\s*$/.test(last) || /кофе|крыш|окн|двор|усмеш|впрочем|кто знает|возможно, скоро/i.test(last)) {
    return 'wry/observational';
  }
  if (/независим|пока нет|ограничен/i.test(last)) return 'cooling-caveat';
  return 'straight-close';
}

async function main() {
  const rows = JSON.parse(fs.readFileSync('/tmp/spa078-auto-full.json', 'utf8')) as Row[];
  const { writeDraft } = await import('../src/lib/ai/editor');
  const { stampAuthorForPipeline } = await import('../src/lib/authors');

  process.env.ARTICLES_STORE = process.env.ARTICLES_STORE || 'sqlite';

  const out: unknown[] = [];
  const usedAuthors: string[] = [];

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
    const reviewData = { technicalVerdict: 'PASS: control rewrite only (no publish)' };

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

    const stamp = stampAuthorForPipeline(row.agentId || 'china-qwen', {
      sourceUrl: row.sourceUrl,
      slug: `${row.slug}-control-${usedAuthors.length}`,
    });
    usedAuthors.push(stamp.author);

    const newLead = draft.text.trim().split(/\n+/).filter(Boolean)[0] || '';
    const companyFirst = /^компани|представлен|появилась информация|на рынок выходит|анонсир|на платформе/i.test(
      oldLead,
    );
    const newCompanyFirst = /^компани|представлен|появилась информация|на рынок выходит|анонсир/i.test(newLead);

    out.push({
      sourceTitle: row.title,
      oldTitle: row.title,
      newTitle: draft.title,
      oldLead: oldLead.slice(0, 260),
      newLead: newLead.slice(0, 260),
      humanAngle: newCompanyFirst
        ? 'still announcement-leaning'
        : 'opens on capability / human meaning',
      strongestFact: strongestFactGuess(`${draft.title}\n${draft.text}`),
      endingStyle: endingStyle(draft.text),
      editorName: stamp.author,
      oldAuthor: row.author || null,
      whyBetter: companyFirst && !newCompanyFirst
        ? 'Fact/human lead instead of company announcement; varied byline'
        : 'Compare title/lead/ending vs catalog style',
    });
  }

  console.log(JSON.stringify({ authorPoolSample: usedAuthors, items: out }, null, 2));
  fs.writeFileSync('/tmp/spa078-control5-v1.json', JSON.stringify({ authorPoolSample: usedAuthors, items: out }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
