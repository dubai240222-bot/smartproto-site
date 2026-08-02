/**
 * SP-A-032 / U1 — Qwen China Analyst (dossier only; NEVER publishes; NEVER browses the web).
 * Architecture: Source Registry → Collectors (cheap) → Raw candidates → Qwen → Scout…
 * Budget: parsers many → deterministic hard-reject → Qwen max 3–5/cycle. No mass search.
 */
import { getOpenRouterClient, parseJsonObject, clampText } from './shared';
import type { ChinaRawCandidate } from '../collectors/china-sources';

export type { ChinaRawCandidate };

/** @deprecated alias — collectors emit ChinaRawCandidate */
export type ChinaCandidate = ChinaRawCandidate;

export interface ChinaSourceSuggestion {
  kind: 'manufacturer' | 'platform' | 'keyword' | 'exclude';
  value: string;
  reason: string;
}

export interface ChinaDossier {
  originalTitle: string;
  translatedTitle: string;
  productName: string;
  manufacturer: string;
  platform: string;
  productUrl: string;
  sourceUrl: string;
  imageUrl: string;
  whatItDoes: string;
  whyItIsNew: string;
  consumerUse: string;
  priceOriginal: number | null;
  currency: string | null;
  priceApproxUsd: number | null;
  availability: string;
  launchDate: string | null;
  market: string;
  prototypeOrSale: string;
  evidence: string[];
  unknownFacts: string[];
  warningFlags: string[];
  recommended: boolean;
  /** Advisor-only; humans add to Source Registry — Qwen never mutates registry. */
  sourceSuggestions: ChinaSourceSuggestion[];
}

export const CHINA_NOVELTY_SIGNALS = [
  // Chinese launch / category novelty
  '新品', '首发', '预售', '众筹', '新款', '概念产品', '智能家居',
  '可穿戴设备', '消费电子', '便携', '迷你', 'AI硬件', '机器人', '创新产品',
  '推出', '发布', '上市', '开售', '开卖', '发售', '预热', '上架', '亮相', '揭晓',
  // English manufacturer newsrooms (Anker etc.)
  'launch', 'launches', 'unveiled', 'unveils', 'introduces', 'introduced',
  'new product', 'now available', 'pre-order', 'preorder', 'crowdfunding',
] as const;

export const CHINA_ANALYST_SYSTEM_PROMPT = [
  'You are SmartProto Qwen China Analyst. Read ONLY the provided candidate JSON/text — no internet, no browsing, no search, no opening Chinese sites.',
  'Output ONE JSON dossier. Never invent specs/prices/dates/URLs; keep Chinese product/brand names; do not translate brand names;',
  'distinguish prototype / preorder / crowdfunding / on-sale; separate wholesale vs retail;',
  '新品/首发 alone are NOT novelty proof; fill unknownFacts, warningFlags;',
  'recommended=true ONLY for buyable/preorder consumer gadgets with a named product — NOT trade shows, hiring, sales stats, cars, politics;',
  'sourceSuggestions[] may advise manufacturers/platforms/keywords/excludes for collectors — never add sources yourself;',
  'you NEVER publish.',
].join(' ');

const HARD_REJECT: [RegExp, string][] = [
  [/只换色|新配色|新色|同款.*色/i, 'new color only'],
  [/山寨|高仿|同款复刻|拷贝|高仿/i, 'copy of known device'],
  [/SEO|导购合集|热销榜|什么值得买合集/i, 'SEO catalog'],
  [/包治|根治|神药|医疗级疗效|百病/i, 'dubious medical claims'],
  [/宣传文案|限时疯抢|史上最强(?!功能)/i, 'marketing without facts'],
  // Non-product CN media noise (must not burn Qwen budget)
  [/入职|裁员|人事任命|担任.{0,12}负责人|向CEO/i, 'personnel / hiring'],
  [/十八场对谈|还只是游戏展吗|行业联盟成立/i, 'trade show / industry fluff'],
  [/交付\s*[\d.]+?\s*万|销量.{0,8}突破|累计销量|同比大涨/i, 'sales / delivery stats'],
  [/票房|燃油附加费|住房公积金|二手房|产业项目|本科专业/i, 'non-gadget economy'],
  [/总经理|架构调整|融资数千万|半年报|营收增长/i, 'corporate finance / org'],
  [/预约.{0,12}车票|铁路\s*12306/i, 'travel booking'],
  [/碰撞测试|万辆|新车碰撞/i, 'auto industry fluff'],
  [/马斯克|特斯拉剥离/i, 'non-product digest'],
  [/全球榜单|央视详解|研究员.{0,8}爆料|被雪藏|创新人才|一人公司|\bOPC\b/i, 'AI ranking / non-product'],
  [/开启国补|已完成备案|经销商称/i, 'subsidy / filing not a product launch'],
];

/** Buyable consumer device / function markers (CN + EN). */
const DEVICE_OR_FUNCTION_RE =
  /(功能|智能|设备|硬件|机器人|穿戴|家居|便携|迷你|众筹|预售|首发|手机|手表|手环|耳机|音箱|手柄|键盘|鼠标|相机|镜头|充电器|充电宝|显示器|平板|眼镜|路由器|扫地|牙刷|风扇|投影|无人机|翻译|打印机|支架臂|支架|麦克风|摄像头|散热器|风冷|dock|gadget|earbuds|headphones|charger|power\s*bank|smartwatch|\bphone\b|controller|wearable)/i;

const BRAND_DEVICE_LAUNCH_RE =
  /(小米|华为|荣耀|红米|REDMI|安克|Anker|谷粒|GuliKit|泰坦军团|Zinwa|大疆|DJI|倍思|Baseus|绿联|UGREEN|银昕).{0,48}(手机|手表|手环|耳机|手柄|相机|充电器|充电宝|音箱|显示器|平板|眼镜|键盘|鼠标|路由器|散热器)/i;

const TITLE_LAUNCH_RE =
  /(推出|发布|预热|上市|开售|开卖|发售|上架|亮相|揭晓|新品|首发|预售|众筹|搭载|launch|launches|unveils|introduces|pre-?order|now available)/i;

const CATEGORY_HINTS: [RegExp, string][] = [
  [/可穿戴|手表|手环|耳机/i, 'wearable'],
  [/智能家居|扫地机器人|灯带/i, 'smart-home'],
  [/机器人/i, 'robot'],
  [/便携|迷你|充电宝/i, 'portable'],
  [/AI硬件|AI\s*芯片|大模型终端/i, 'ai-hardware'],
  [/众筹|预售|首发|推出|发布|上市/i, 'crowdfunding-launch'],
  [/手机|平板/i, 'phone-tablet'],
  [/手柄|键盘|鼠标/i, 'pc-peripheral'],
];

export function findChinaNoveltySignals(text: string): string[] {
  const lower = text.toLowerCase();
  return CHINA_NOVELTY_SIGNALS.filter((s) => {
    if (/[a-z]/i.test(s)) return lower.includes(s.toLowerCase());
    return text.includes(s);
  });
}

export function guessChinaCategory(text: string): string {
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(text)) return cat;
  return 'unknown';
}

/** True when title looks like a named consumer device launch (not HR / stats / essays). */
export function looksChinaConsumerGadget(title: string, summary = ''): boolean {
  const hay = `${title}\n${summary}`;
  if (
    /入职|十八场对谈|还只是游戏展吗|交付\s*[\d.]+?\s*万|累计销量|预约.{0,12}车票|碰撞测试|票房|总经理|马斯克|全球榜单|爆料|雪藏|创新人才|国补|已完成备案|经销商称/.test(
      hay,
    )
  ) {
    return false;
  }
  // Require a launch cue in the TITLE so long RSS summaries cannot smuggle 消费电子 into essays.
  if (!TITLE_LAUNCH_RE.test(title) && !BRAND_DEVICE_LAUNCH_RE.test(title)) return false;
  if (!DEVICE_OR_FUNCTION_RE.test(title) && !BRAND_DEVICE_LAUNCH_RE.test(title)) return false;
  return true;
}

export function chinaHardReject(
  c: Pick<ChinaRawCandidate, 'sourceUrl' | 'title' | 'summary' | 'platform'>,
): { reject: boolean; reason: string } {
  const hay = `${c.title}\n${c.summary}`;
  if (!c.sourceUrl?.trim()) return { reject: true, reason: 'no source URL' };
  for (const [re, reason] of HARD_REJECT) if (re.test(hay)) return { reject: true, reason };
  const signals = findChinaNoveltySignals(hay);
  const brandLaunch = BRAND_DEVICE_LAUNCH_RE.test(hay);
  if (!signals.length && !brandLaunch) {
    return { reject: true, reason: 'no early-launch novelty signal' };
  }
  if (!DEVICE_OR_FUNCTION_RE.test(hay) && !brandLaunch) {
    return { reject: true, reason: 'ordinary product without new function' };
  }
  if (!/(公司|品牌|厂|有限|科技|Xiaomi|小米|华为|安克|Anker|谷粒|GuliKit|泰坦|Zinwa|[A-Za-z]{2,})/.test(hay) && !c.platform?.trim()) {
    return { reject: true, reason: 'product without manufacturer' };
  }
  return { reject: false, reason: '' };
}

export function emptyDossier(partial: Partial<ChinaDossier> = {}): ChinaDossier {
  const { sourceSuggestions, recommended, ...rest } = partial;
  return {
    originalTitle: '', translatedTitle: '', productName: '', manufacturer: '',
    platform: '', productUrl: '', sourceUrl: '', imageUrl: '',
    whatItDoes: '', whyItIsNew: '', consumerUse: '',
    priceOriginal: null, currency: null, priceApproxUsd: null,
    availability: '', launchDate: null, market: '', prototypeOrSale: '',
    evidence: [], unknownFacts: [], warningFlags: [],
    ...rest,
    // Default false; parseChinaDossier / CHINA_ALLOW_RECOMMEND may set true.
    recommended: recommended === true,
    sourceSuggestions: sourceSuggestions ?? [],
  };
}

function parseSuggestions(v: unknown): ChinaSourceSuggestion[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    const o = x as Record<string, unknown>;
    const kind = o.kind;
    if (kind !== 'manufacturer' && kind !== 'platform' && kind !== 'keyword' && kind !== 'exclude') return [];
    if (typeof o.value !== 'string' || !o.value.trim()) return [];
    return [{ kind, value: o.value, reason: typeof o.reason === 'string' ? o.reason : '' }];
  });
}

export function parseChinaDossier(content: string): ChinaDossier {
  // LLMs occasionally emit trailing commas; strip before strict JSON.parse
  const p = parseJsonObject<Partial<ChinaDossier>>(content.replace(/,\s*([}\]])/g, '$1'));
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
  return emptyDossier({
    originalTitle: str(p.originalTitle), translatedTitle: str(p.translatedTitle),
    productName: str(p.productName), manufacturer: str(p.manufacturer),
    platform: str(p.platform), productUrl: str(p.productUrl),
    sourceUrl: str(p.sourceUrl), imageUrl: str(p.imageUrl),
    whatItDoes: str(p.whatItDoes), whyItIsNew: str(p.whyItIsNew),
    consumerUse: str(p.consumerUse), priceOriginal: numOrNull(p.priceOriginal),
    currency: typeof p.currency === 'string' ? p.currency : null,
    priceApproxUsd: numOrNull(p.priceApproxUsd), availability: str(p.availability),
    launchDate: typeof p.launchDate === 'string' ? p.launchDate : null,
    market: str(p.market), prototypeOrSale: str(p.prototypeOrSale),
    evidence: arr(p.evidence), unknownFacts: arr(p.unknownFacts),
    warningFlags: arr(p.warningFlags), sourceSuggestions: parseSuggestions(p.sourceSuggestions),
    recommended: p.recommended === true,
  });
}

/**
 * Calls OpenRouter only when CHINA_DEPARTMENT_ENABLED=true and this is invoked.
 * Input must already be a short collected candidate — Analyst does not fetch URLs.
 */
export async function analyzeChinaCandidate(candidate: ChinaRawCandidate): Promise<ChinaDossier> {
  const gate = chinaHardReject(candidate);
  if (gate.reject) {
    return emptyDossier({
      originalTitle: candidate.title, sourceUrl: candidate.sourceUrl,
      platform: candidate.platform, imageUrl: candidate.imageUrl,
      warningFlags: [gate.reason], unknownFacts: ['rejected before model'],
    });
  }
  if (process.env.CHINA_DEPARTMENT_ENABLED !== 'true') {
    throw new Error('CHINA_DEPARTMENT_ENABLED is not true; refusing OpenRouter call');
  }
  const model = process.env.CHINA_ANALYST_MODEL ?? 'qwen/qwen3-coder-next';
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: 1400,
    messages: [
      { role: 'system', content: CHINA_ANALYST_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          'Use ONLY this candidate (no web):',
          JSON.stringify(candidate),
          `Text:\n${clampText(candidate.summary || candidate.title, 4000)}`,
          'Return ONLY ChinaDossier JSON. recommended=false by default. Include sourceSuggestions[].',
        ].join('\n'),
      },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content || typeof content !== 'string') throw new Error('China Analyst empty response');
  const dossier = parseChinaDossier(content);
  if (!dossier.sourceUrl) dossier.sourceUrl = candidate.sourceUrl;
  if (!dossier.originalTitle) dossier.originalTitle = candidate.title;
  if (!dossier.imageUrl && candidate.imageUrl) dossier.imageUrl = candidate.imageUrl;
  // Seed productName from source title when model left it empty (keep Latin tokens intact).
  if (!dossier.productName.trim()) {
    const latin = candidate.title.match(/[A-Za-z][A-Za-z0-9][A-Za-z0-9.\-]{1,40}(?:\s+[A-Za-z0-9][A-Za-z0-9.\-]{0,20}){0,4}/);
    dossier.productName = (latin?.[0] || candidate.title).trim().slice(0, 80);
  }
  if (!dossier.whatItDoes.trim() && candidate.summary.trim()) {
    dossier.whatItDoes = clampText(candidate.summary, 400);
  }
  if (!dossier.platform) dossier.platform = candidate.platform || candidate.sourceName;
  // Safety default: never publish from Analyst alone. Publish scripts may set CHINA_ALLOW_RECOMMEND=true.
  if (process.env.CHINA_ALLOW_RECOMMEND !== 'true') {
    dossier.recommended = false;
  }
  return dossier;
}
