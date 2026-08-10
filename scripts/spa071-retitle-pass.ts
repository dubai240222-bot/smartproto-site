import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { getOpenRouterClient, parseJsonObject } from '../src/lib/ai/shared';

dotenv.config({ path: '.env.local', override: true, quiet: true });
dotenv.config({ path: '.env', quiet: true });

interface Row {
  slug: string;
  title: string;
  content: string;
}

async function main(): Promise<void> {
  const file = path.resolve('data/spa071-rewritten-7to15.json');
  const arts = JSON.parse(await readFile(file, 'utf8')) as Row[];
  const client = getOpenRouterClient();
  const model = process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite';

  for (const a of arts) {
    if (!/[:—]/.test(a.title)) continue;
    console.log('retitle', a.slug, '::', a.title);
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.5,
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content:
            'Придумай один русский заголовок SmartProto: curiosity-hook по факту, БЕЗ «?», БЕЗ «!», БЕЗ шаблона «Бренд: спека/польза» и без двоеточия. До 80 символов. Верни JSON {"title":string}. Точное имя модели можно вплести естественно.',
        },
        {
          role: 'user',
          content: `Старый title: ${a.title}\nLead: ${a.content.slice(0, 400)}\nНужен новый title без «:» и без вопроса.`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = parseJsonObject<{ title: string }>(raw);
    if (parsed.title?.trim() && !/[!]/.test(parsed.title) && !/[:：]/.test(parsed.title)) {
      a.title = parsed.title.trim();
      console.log('  ->', a.title);
    } else {
      console.log('  keep old');
    }
  }

  await writeFile(file, `${JSON.stringify(arts, null, 2)}\n`);
  console.log('saved');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
