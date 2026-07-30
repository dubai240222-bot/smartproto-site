import { getOpenRouterClient, parseJsonObject, clampText } from './shared';

export interface ScoutResult {
  interesting: boolean;
  score: number;
  reason: string;
}

const SCOUT_MODEL = process.env.OPENROUTER_SCOUT_MODEL ?? 'deepseek/deepseek-chat';
const SCOUT_SYSTEM_PROMPT = 'Ты разведчик. Оцени новость от 0 до 100 по критериям: глубина технологии, open-source, инженерная ценность. Игнорируй кликбейт и обычные IT-новости.';

export async function scoutArticle(title: string, text: string): Promise<ScoutResult> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: SCOUT_MODEL,
    temperature: 0.1,
    max_tokens: 150,
    messages: [
      { role: 'system', content: SCOUT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `Заголовок: ${title}`,
          '',
          `Текст: ${clampText(text, 8000)}`,
          '',
          'Верни только JSON в формате {"interesting": boolean, "score": number, "reason": string}.',
        ].join('\n'),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Scout model returned an empty response.');
  }

  const parsed = parseJsonObject<Partial<ScoutResult>>(content);
  const score = typeof parsed.score === 'number' ? parsed.score : 0;

  return {
    interesting: Boolean(parsed.interesting),
    score,
    reason: typeof parsed.reason === 'string' ? parsed.reason : 'No reason provided by scout model.',
  };
}

export { scoutArticle as scouterArticle };
