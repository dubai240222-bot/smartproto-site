/**
 * READ-ONLY tone audit for published articles.
 * Does NOT modify articles.json.
 *
 * Usage: npx tsx scripts/audit-published-tone.ts [--sample=N] [--stdout]
 * Writes data/tone-audit-report.json by default; also prints summary.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const articlesPath = path.resolve(root, 'src', 'data', 'articles.json');
const reportPath = path.resolve(root, 'data', 'tone-audit-report.json');

type Verdict = 'KEEP' | 'REWRITE' | 'REMOVE';

interface Article {
  id?: string;
  slug: string;
  title: string;
  summary?: string;
  content?: string;
  text?: string;
  category?: string;
  tags?: string[];
  sourceUrl?: string;
  publishedAt?: string;
}

interface AuditItem {
  slug: string;
  title: string;
  verdict: Verdict;
  reasons: string[];
  suggestedNeutralTitle: string;
  flags: {
    clickbait: boolean;
    pathos: boolean;
    adPhrases: boolean;
    unsupportedClaims: boolean;
    jargon: boolean;
    missingPriceOrDate: boolean;
    missingLimitations: boolean;
    testOrConstruction: boolean;
    feminineVoice: boolean;
  };
}

interface AuditReport {
  generatedAt: string;
  articlesPath: string;
  total: number;
  counts: Record<Verdict, number>;
  items: AuditItem[];
}

const CLICKBAIT_RE =
  /изменит\s+(вашу\s+)?жизн|взорвал(?:а|о)?\s+интернет|такого\s+вы\s+ещ[её]\s+не\s+видел|вы\s+не\s+поверите|вы\s+обязаны|секретн(?:ый|ый\s+код)|настоящ(?:ая|ее)\s+бомба|лучше\s+гаджет\s+года|все\s+захотят|не\s+оставят\s+равнодушн/i;

const PATHOS_RE =
  /\bвау\b|wow|это\s+бомба|невероятн|революционн|потрясающ|фантастическ|гениальн|убийца\s+iphone|изменит\s+мир|переверн[её]т\s+рынок|мы\s+в\s+восторге|наконец[- ]то\s+свершилось|будущее\s+уже\s+наступил|о\s+боже|я\s+сейчас\s+упаду|обалдеть|офигенн|это\s+чудо|огонь[!]|граничит\s+с\s+читерств|меняет\s+правила\s+игры/i;

const AD_RE =
  /уникальн|перв(?:ый|ая|ое)\s+в\s+мире|лучш(?:ий|ая|ее|ие)|сам(?:ый|ая|ое)\s+(?:мощн|быстр|умн|компактн|лёгк|легк|точн|надёжн|надежн)|не\s+имеющ[а-яё]*\s+аналог|профессиональн[а-яё]*\s+качеств|идеальн[а-яё]*\s+решени|незаменим/i;

const ADDR_RE =
  /\bребята\b|\bдрузья[,!]|\bпосмотрите\b|\bпосмотри[,!]|\bсмотрите[,!]|\bguys\b|look\s+at\s+this|забудьте\s+о|попробуйте\s+сами|готовьтесь\s+к|вы\s+обязаны/i;

const JARGON_RE =
  /\bdocker\b|\bkubernetes\b|\bk8s\b|\bci\/cd\b|\bdevops\b|\bhacker\s*news\b|\bpull\s*request\b|\bmicroservice|\byaml\b|\bterraform\b/i;

const LIMIT_HINT_RE =
  /ограничен|не\s+подходит|пока\s+не|не\s+объявлен|неизвестн|не\s+уточнил|независим\w*\s+(?:испытан|обзор|тест)|прототип|сомнен|однако|но\s+|хотя\s+|минус|недостаток|не\s+раскрыт/i;

const PRICE_RE =
  /\$\s?\d|\d[\d\s]*\s*(?:руб|usd|eur|\$)|цен[аые]\s|стоимость|от\s+\$|предзаказ|kickstarter|indiegogo|купить|прода/i;

const DATE_RE =
  /20\d{2}|квартал|месяц|скоро|уже\s+в\s+продаж|дата\s|выход[ае]\s|появитс|доставк|shipping|available|release/i;

const TEST_CONSTRUCTION_RE =
  /lorem\s+ipsum|TODO|FIXME|PLACEHOLDER|тест(?:овая|овый)\s+(?:стать|текст)|черновик|\[\[|\]\]|xxx+|sample\s+article|building\s+site|under\s+construction/i;

const EMOTION_RE =
  /я\s+(?:мысленно|сейчас|в\s+восторге)|мне\s+нравится|мы\s+(?:нашли|в\s+восторге)|кажется,\s+мы/i;

/** Feminine first-person author voice — must REWRITE to masculine. */
const FEMININE_VOICE_RE =
  /(?:^|[^а-яё])я\s+(?:пришла|увидела|поняла|решила|купила|нашла|посмотрела|подумала|написала|рассказала|узнала|выбрала|смогла|хотела|ждала|заметила|попробовала|включила|получила|проверила|сравнила|оценила|взяла|открыла|пошла|вернулась|осталась|стала|была)(?:[^а-яё]|$)|(?:^|[^а-яё])я\s+(?:рада|готова|уверена|счастлива|довольна|поражена|удивлена|вдохновлена|благодарна|согласна|убеждена)(?:[^а-яё]|$)|я\s+как\s+женщина|мне\s+как\s+женщин|я\s+такая|была\s+рада|когда\s+включила/i;

function parseArgs(argv: string[]) {
  let sample = 0;
  let stdoutOnly = false;
  for (const arg of argv) {
    if (arg.startsWith('--sample=')) sample = Math.max(0, parseInt(arg.split('=')[1], 10) || 0);
    else if (arg === '--stdout') stdoutOnly = true;
  }
  return { sample, stdoutOnly };
}

function bodyOf(a: Article): string {
  return (a.content || a.text || '').trim();
}

function stripLeadingArticle(title: string): string {
  return title.replace(/^(?:этот|эта|это|новая?|новый)\s+/i, '').trim();
}

function suggestNeutralTitle(a: Article): string {
  const raw = (a.title || '').replace(/!+/g, '').trim();
  const cleaned = raw
    .replace(
      /невероятн[а-яё]*|революционн[а-яё]*|потрясающ[а-яё]*|фантастическ[а-яё]*|гениальн[а-яё]*|бомба|вау|сам(?:ый|ая|ое)\s+[а-яё]+|лучш(?:ий|ая|ее|ие)\s+|ваш\s+личн[а-яё]*\s+|спаситель\s+в\s+[^:]+/gi,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s+[—–-]\s*$/g, '')
    .replace(/:\s*$/g, '')
    .trim();

  if (cleaned.length >= 20 && !CLICKBAIT_RE.test(cleaned) && !PATHOS_RE.test(cleaned)) {
    return cleaned.slice(0, 90);
  }

  const slugWords = (a.slug || '')
    .split('-')
    .filter((w) => w.length > 2 && !['the', 'and', 'for', 'with', 'that', 'this'].includes(w))
    .slice(0, 8)
    .join(' ');

  const base = stripLeadingArticle(cleaned) || slugWords;
  return (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 90) || a.slug;
}

function auditArticle(a: Article): AuditItem {
  const title = a.title || '';
  const body = bodyOf(a);
  const full = `${title}\n${a.summary || ''}\n${body}`;
  const reasons: string[] = [];

  const clickbait =
    CLICKBAIT_RE.test(full) || /!/.test(title) || /\?\s*$/.test(title.trim());
  const pathos = PATHOS_RE.test(full) || EMOTION_RE.test(full) || ADDR_RE.test(full);
  const feminineVoice = FEMININE_VOICE_RE.test(full);
  const adPhrases = AD_RE.test(full) && !/производитель\s+утверждает/i.test(full);
  const unsupportedClaims =
    adPhrases ||
    (/\b(?:гарантирует|полностью\s+изменит|всегда\s+работает|навсегда)\b/i.test(full) &&
      !/производитель\s+утверждает/i.test(full));
  const jargon = JARGON_RE.test(full);
  const hasPriceOrDate = PRICE_RE.test(full) || DATE_RE.test(full);
  const missingPriceOrDate = !hasPriceOrDate;
  const missingLimitations = body.length > 80 && !LIMIT_HINT_RE.test(body);
  const testOrConstruction =
    TEST_CONSTRUCTION_RE.test(full) ||
    body.length < 40 ||
    /off-topic|#reject/i.test(full);

  if (clickbait) reasons.push('кликбейт / восклицание или интрига в заголовке/тексте');
  if (pathos) reasons.push('пафос, обращения к читателю или личные эмоции');
  if (feminineVoice) reasons.push('женский голос автора (нужен мужской)');
  if (adPhrases) reasons.push('рекламные суперлативы без «Производитель утверждает…»');
  if (unsupportedClaims && !adPhrases) reasons.push('неподтверждённые сильные утверждения');
  if (jargon) reasons.push('технический жаргон (Docker/DevOps/HN и т.п.)');
  if (missingPriceOrDate) reasons.push('нет цены и/или даты/статуса доступности');
  if (missingLimitations) reasons.push('нет ограничений / неизвестных данных');
  if (testOrConstruction) reasons.push('тестовый / строительный / слишком короткий текст');

  // Off-topic / non-buyable soft signals for REMOVE
  const removeSignal =
    testOrConstruction ||
    jargon ||
    /\b(?:docker|kubernetes|devops|hacker news)\b/i.test(full) ||
    (/vibe\s*coding|читерств/i.test(full) && !/куп|предзаказ|цен|маркет/i.test(full));

  let verdict: Verdict = 'KEEP';
  const hardTone = clickbait || pathos || adPhrases || unsupportedClaims || feminineVoice;
  if (removeSignal && (jargon || testOrConstruction || /vibe\s*coding/i.test(full))) {
    verdict = 'REMOVE';
  } else if (hardTone || missingLimitations || missingPriceOrDate) {
    verdict = 'REWRITE';
  } else if (reasons.length >= 2) {
    verdict = 'REWRITE';
  }

  // Mild KEEP: only soft missing meta with otherwise calm text
  if (
    verdict === 'REWRITE' &&
    !hardTone &&
    !jargon &&
    !testOrConstruction &&
    reasons.length === 1 &&
    (missingPriceOrDate || missingLimitations)
  ) {
    // still REWRITE — meta gaps matter per spec
    verdict = 'REWRITE';
  }

  if (reasons.length === 0) {
    verdict = 'KEEP';
    reasons.push('тон спокойный, критичных нарушений не найдено');
  }

  return {
    slug: a.slug,
    title,
    verdict,
    reasons,
    suggestedNeutralTitle: suggestNeutralTitle(a),
    flags: {
      clickbait,
      pathos,
      adPhrases,
      unsupportedClaims,
      jargon,
      missingPriceOrDate,
      missingLimitations,
      testOrConstruction,
      feminineVoice,
    },
  };
}

async function main() {
  const { sample, stdoutOnly } = parseArgs(process.argv.slice(2));
  const raw = await readFile(articlesPath, 'utf8');
  const articles = JSON.parse(raw) as Article[];
  if (!Array.isArray(articles)) {
    throw new Error('articles.json must be an array');
  }

  const list = sample > 0 ? articles.slice(0, sample) : articles;
  const items = list.map(auditArticle);
  const counts: Record<Verdict, number> = { KEEP: 0, REWRITE: 0, REMOVE: 0 };
  for (const item of items) counts[item.verdict]++;

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    articlesPath: path.relative(root, articlesPath).replace(/\\/g, '/'),
    total: items.length,
    counts,
    items,
  };

  const json = JSON.stringify(report, null, 2) + '\n';
  if (!stdoutOnly) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, json, 'utf8');
  }
  console.log(json);
  console.error(
    `[audit:tone] total=${report.total} KEEP=${counts.KEEP} REWRITE=${counts.REWRITE} REMOVE=${counts.REMOVE}` +
      (stdoutOnly ? '' : ` → ${path.relative(root, reportPath)}`),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
