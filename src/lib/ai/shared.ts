import OpenAI from 'openai';
import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai';

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
    process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY,
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
  const end = normalized.lastIndexOf('}');

  if (start < 0 || end <= start) {
    throw new Error(`Model response was not valid JSON: ${content}`);
  }

  return JSON.parse(normalized.slice(start, end + 1)) as T;
}

export function getGeminiModel(modelName: string, systemInstruction: string, generationConfig?: GenerationConfig) {
  const apiKey = requireApiKey(
    process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    'GOOGLE_API_KEY',
  );

  const client = new GoogleGenerativeAI(apiKey);
  return client.getGenerativeModel({
    model: modelName,
    systemInstruction,
    generationConfig,
  });
}

export function clampText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}
