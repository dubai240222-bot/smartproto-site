import 'dotenv/config';

import OpenAI from 'openai';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENROUTER_SITE_URL = 'https://smartproto.site';
const DEFAULT_OPENROUTER_APP_NAME = 'SmartProto';

function requireApiKey(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getOpenRouterClient(): OpenAI {
  const apiKey = requireApiKey(
    process.env.OPENROUTER_API_KEY,
    'OPENROUTER_API_KEY',
  );

  return new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? DEFAULT_OPENROUTER_SITE_URL,
      'X-Title': process.env.OPENROUTER_APP_NAME ?? DEFAULT_OPENROUTER_APP_NAME,
    },
  });
}

export function parseJsonObject<T>(content: string): T {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const start = normalized.indexOf('{');
  if (start < 0) {
    throw new Error(`Model response was not valid JSON: ${content}`);
  }

  const end = normalized.lastIndexOf('}');
  if (end > start) {
    try {
      return JSON.parse(normalized.slice(start, end + 1)) as T;
    } catch {
      /* fall through to salvage */
    }
  }

  // Salvage truncated Scout/Reviewer JSON (finish_reason: length).
  let frag = normalized.slice(start);
  // Drop trailing incomplete key/value
  frag = frag.replace(/,\s*"[^"]*$/, '');
  frag = frag.replace(/,\s*[^,}\]]*$/, '');
  frag = frag.replace(/,\s*$/, '');
  // Close open braces/brackets
  const opens = (frag.match(/\{/g) || []).length;
  const closes = (frag.match(/\}/g) || []).length;
  const openArr = (frag.match(/\[/g) || []).length;
  const closeArr = (frag.match(/\]/g) || []).length;
  frag += ']'.repeat(Math.max(0, openArr - closeArr));
  frag += '}'.repeat(Math.max(0, opens - closes));
  try {
    return JSON.parse(frag) as T;
  } catch {
    // Last resort: pull score/interesting/reason for Scout tables
    const scoreM = frag.match(/"score"\s*:\s*(\d+)/);
    const interestingM = frag.match(/"interesting"\s*:\s*(true|false)/);
    const reasonM = frag.match(/"reason"\s*:\s*"((?:\\.|[^"\\])*)"/);
    const statusM = frag.match(/"status"\s*:\s*"([A-Z_]+)"/);
    if (scoreM) {
      return {
        interesting: interestingM ? interestingM[1] === 'true' : Number(scoreM[1]) >= 70,
        score: Number(scoreM[1]),
        reason: reasonM ? reasonM[1] : 'salvaged truncated JSON',
        productType: 'salvaged',
        status: statusM ? statusM[1] : undefined,
        isActuallyNew: true,
        noveltyEvidence: ['salvaged-truncated'],
        functionalDifference: 'salvaged',
        marketSaturation: 'low',
        parts: undefined,
      } as T;
    }
    throw new Error(`Model response was not valid JSON: ${content}`);
  }
}

export function clampText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}
