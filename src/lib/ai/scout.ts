import { getOpenRouterClient, parseJsonObject, clampText } from './shared';

export interface ScoutResult {
  interesting: boolean;
  score: number;
  reason: string;
}

const SCOUT_MODEL = process.env.OPENROUTER_SCOUT_MODEL ?? 'deepseek/deepseek-v4-flash:latest';
const SCOUT_SYSTEM_PROMPT = 'Ты разведчик. Оцени новость от 0 до 100 по критериям: глубина технологии, open-source, инженерная ценность. Игнорируй кликбейт и обычные IT-новости.';

export async function scoutArticle(title: string, text: string): Promise<ScoutResult> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: SCOUT_MODEL,
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: 500,
    include_reasoning: false,
    reasoning: { max_tokens: 0 },
    extra_body: {
      include_reasoning: false,
      reasoning: { max_tokens: 0 },
    },
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
  } as any);

  const choice = completion.choices[0];
  const content = choice?.message?.content;
  if (!content || typeof content !== 'string' || content.trim() === '') {
    const finishReason = choice?.finish_reason ?? 'unknown';
    const msg = choice?.message as any;
    const choiceObj = choice as any;
    const hasReasoning = Boolean(
      msg?.reasoning ||
      msg?.reasoning_content ||
      msg?.reasoning_details ||
      choiceObj?.reasoning ||
      choiceObj?.reasoning_content
    );
    throw new Error(
      `Scout model (${SCOUT_MODEL}) returned an empty response. finish_reason: ${finishReason}, reasoning present: ${hasReasoning}`
    );
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
