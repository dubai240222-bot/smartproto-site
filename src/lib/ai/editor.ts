import { getGeminiModel, clampText } from './shared';

export interface DraftResult {
  text: string;
}

const EDITOR_MODEL = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';
const EDITOR_SYSTEM_PROMPT = 'Ты редактор хакерского дайджеста. Напиши финальный текст на РУССКОМ языке. Стиль: строгий, монохромный, без воды, 150-250 слов. Используй технические термины корректно.';

export async function writeDraft(articleData: object, reviewData: object): Promise<DraftResult> {
  const model = getGeminiModel(EDITOR_MODEL, EDITOR_SYSTEM_PROMPT, {
    temperature: 0.7,
    maxOutputTokens: 400,
  });

  const prompt = [
    'Подготовь финальный текст дайджеста по следующей статье и техническому ревью.',
    '',
    'Статья:',
    clampText(JSON.stringify(articleData, null, 2), 10000),
    '',
    'Ревью:',
    clampText(JSON.stringify(reviewData, null, 2), 10000),
    '',
    'Верни только сам текст без заголовка JSON и без пояснений.',
  ].join('\n');

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  if (!text) {
    throw new Error('Editor model returned an empty response.');
  }

  return { text };
}
