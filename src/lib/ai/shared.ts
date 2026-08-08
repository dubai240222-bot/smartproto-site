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
  frag = frag.replace(/,\s*"[^"]*$/s, '');
  frag = frag.replace(/,\s*$/s, '');
  if (!frag.trimEnd().endsWith('}')) frag = `${frag}}`;
  try {
    return JSON.parse(frag) as T;
  } catch {
    throw new Error(`Model response was not valid JSON: ${content}`);
  }
}

export function clampText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}
