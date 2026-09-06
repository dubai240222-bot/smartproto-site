/**
 * SP-A-082 — Global final AUTO commodity kill switch.
 *
 * Last line of defense before an AUTO article is written to SQLite.
 * Ordinary commodity hardware → HARD REJECT (doubt → REJECT).
 * Chief Fast Lane / Author Door are never blocked.
 */

export type FinalAutoGateInput = {
  title: string;
  summary?: string;
  content?: string;
  tags?: string[];
  category?: string;
  agentId?: string;
  /** Optional source / dossier residue */
  extra?: string;
};

export type FinalAutoGateResult =
  | { ok: true; bypassed?: 'chief' | 'author' | 'manual' }
  | { ok: false; reason: string };

export class FinalAutoGateError extends Error {
  readonly code = 'SP_A_082_FINAL_AUTO_GATE';
  constructor(message: string) {
    super(message);
    this.name = 'FinalAutoGateError';
  }
}

/** Manual editorial doors — owner decision, never blocked by this gate. */
export function isManualEditorialAgent(agentId?: string | null): boolean {
  const a = (agentId || '').trim().toLowerCase();
  if (!a) return false;
  if (a === 'chief-fast-lane' || a === 'author-door') return true;
  if (a.startsWith('chief-') || a.startsWith('author-')) return true;
  return false;
}

function haystack(input: FinalAutoGateInput): string {
  return [
    input.title,
    input.summary,
    input.content,
    input.category,
    ...(input.tags || []),
    input.extra,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 8000);
}

/**
 * Strong new human capability — the ONLY way ordinary hardware-shaped text may pass.
 * Spec bumps (DPI, Hz, buttons, megapixels, lighter lens, +10%) do NOT qualify.
 */
const STRONG_HUMAN_CAPABILITY_RE =
  /\b(assistive|accessibility|инвалид|паралич|paralys|paralyz|ампут|prosthetic|протез|mobility\s+aid|экзоскелет|exoskeleton|clinic\s*→\s*home|at[- ]home\s+(care|dialysis|lab|therapy|rehab)|дома\s+вместо\s+клиник|professional\s*→\s*consumer|проф\w*\s+.{0,30}для\s+(дома|обычн)|democratiz|в\s+разы\s+дешев|раньше\s+нельзя\s+было|новая\s+способност|gives?\s+(people|users|patients)\s+the\s+ability|independence\s+for|для\s+людей\s+с\s+ограничен|не\s+может\s+(пользоваться\s+)?рук|emg\s+bracelet|жестов\w*\s+браслет|brain[- ]computer|bci\b|нейроинтерфейс|humanoid\s+robot|робот[- ]?помощник|care\s+robot|surgical\s+robot|робот[- ]?хирург)\b/i;

/** Spec / refresh noise that must never count as capability. */
const SPEC_BUMP_ONLY_RE =
  /\b(\d{2,5}\s*dpi|\d{2,4}\s*hz|polling\s*rate|\d{1,3}\s*(программируем\w*\s+)?кноп|\+\s*\d+\s*%|megapixel|мегапиксе|lighter\s+lens|лёгк\w*\s+зум|new\s+chip|новый\s+чип|more\s+megapixels?|обновлен\w*\s+характеристик|spec(?:s|ifications)?\s+(leak|refresh|bump))\b/i;

/**
 * Ordinary commodity hardware — hard reject unless strong human capability fires.
 */
// NOTE: avoid JS `\b` around Cyrillic — it is ASCII-word only and misses «мышь»/«смартфон».
const ORDINARY_COMMODITY_RE: RegExp[] = [
  // Mice / keyboards / gaming accessories
  /\b(gaming\s+)?(wireless\s+|wired\s+|optical\s+)?mouse\b|\bmice\b|(?:^|[^а-яёa-z0-9])(?:игров\w*\s+)?мышь(?:[^а-яёa-z0-9]|$)|(?:^|[^а-яёa-z0-9])мыши(?:[^а-яёa-z0-9]|$)/i,
  /\b(mechanical|gaming)\s+keyboard\b|мембранн\w*\s+keyboard|(?:^|[^а-яёa-z0-9])(?:механическ\w*\s+)?клавиатур/i,
  /\b(gaming\s+)?(controller|gamepad|joystick)\b|геймпад|джойстик/i,
  /\b(gaming\s+)?(headset|headphone|earbuds?)\b|наушник|гарнитур/i,
  /\bmouse\s*pad\b|коврик\s+для\s+мыши|rgb\s+desk/i,
  // Displays / PC parts
  /\b(monitor|display\s+panel)\b|монитор/i,
  /\b(psu|power\s*supply)\b|блок\s*питания/i,
  /\b(motherboard|gpu|graphics\s+card|cpu\s+cooler)\b|материнск|видеокарт|кулер\s+для\s+процессор/i,
  /\b(ddr[45]|dimm|ram\s+kit)\b|оперативн\w*\s+памят/i,
  /\bpc\s*case\b|компьютерн\w*\s+корпус/i,
  // Phones / tablets / laptops (ordinary refresh)
  /\b(smartphone|phablet)\b|смартфон/i,
  /\btablet\b|планшет/i,
  /\b(laptop|notebook|ultrabook)\b|ноутбук/i,
  // Audio / print / network / power
  /\b(bluetooth\s+)?speaker\b|\bsubwoofer\b|сабвуфер|колонк/i,
  /\bprinter\b|принтер/i,
  /\b(router|wi-?fi\s+6|mesh\s+node)\b|роутер/i,
  /\b(charger|power\s*bank)\b|зарядк|повербанк|пауэрбанк/i,
  // Camera / lens refresh
  /\b(camera)\b.{0,60}\b(lens|megapixel|zoom)\b|камер\w*.{0,60}(объектив|мегапиксе|зум)/i,
  /\bzoom\s+lens\b|зум[- ]?объектив|fe\s*\d{2,3}[-–]\d{2,3}|\bsel\d{5,}\b/i,
  // Specs-only SKU / commodity refresh language
  /\b(specs?-only|lineup\s+refresh|colorway)\b|только\s+характеристик|обновление\s+линейки|новый\s+цвет/i,
];

/** Assistive / “replaces mouse” inventions are not ordinary mice. */
const NOT_ORDINARY_PERIPHERAL_RE =
  /\b(replace|replaces|вместо|без\s+необходимости|отказаться\s+от)\b[\s\S]{0,50}\b(mouse|мыши|мышь|keyboard|клавиатур)|не\s+может\s+(пользоваться\s+)?рук|assistive|эмг|emg\s+bracelet|жестов\w*\s+браслет|brain[- ]computer|bci\b/i;

function isOrdinaryCommodityHardware(hay: string): boolean {
  if (NOT_ORDINARY_PERIPHERAL_RE.test(hay)) return false;
  return ORDINARY_COMMODITY_RE.some((re) => re.test(hay));
}

function hasStrongHumanCapability(hay: string): boolean {
  if (!STRONG_HUMAN_CAPABILITY_RE.test(hay)) return false;
  // Spec-bump language alone cannot salvage; capability markers must dominate.
  // If the only "newness" is DPI/Hz/buttons and capability regex accidentally
  // matched a weak word, still reject when commodity + spec bump without care/assistive.
  return true;
}

/**
 * Final AUTO gate. Call before SQLite upsert (and before articles.json write).
 */
export function finalAutoCommodityGate(input: FinalAutoGateInput): FinalAutoGateResult {
  if (isManualEditorialAgent(input.agentId)) {
    const a = (input.agentId || '').toLowerCase();
    if (a.includes('chief')) return { ok: true, bypassed: 'chief' };
    if (a.includes('author')) return { ok: true, bypassed: 'author' };
    return { ok: true, bypassed: 'manual' };
  }

  const hay = haystack(input);
  const title = input.title || '';

  const commodity = isOrdinaryCommodityHardware(hay);
  const capability = hasStrongHumanCapability(hay);
  const specBump = SPEC_BUMP_ONLY_RE.test(hay);

  if (commodity && capability) {
    // Real assistive / exo / clinic→home stories about hardware-shaped topics may pass.
    return { ok: true };
  }

  if (commodity) {
    return {
      ok: false,
      reason:
        'SP-A-082 final gate: ordinary commodity hardware (mouse/keyboard/phone/monitor/PC part/audio/etc.) — HARD REJECT',
    };
  }

  // Doubt on specs-only SKU refresh without a clear non-commodity subject.
  if (specBump && /\b(phone|smartphone|смартфон|laptop|ноутбук|camera|камер|lens|объектив|mouse|мышь)\b/i.test(hay)) {
    return {
      ok: false,
      reason: 'SP-A-082 final gate: specs-only / refresh commodity — doubt → REJECT',
    };
  }

  // Explicit gaming-mouse shaped titles even if somehow missed by commodity list.
  if (
    /игров\w*\s+мышь|gaming\s+mouse|razer\s+naga|attack\s+shark/i.test(title) ||
    (/мышь/i.test(title) && /\d+\s*кноп/i.test(hay))
  ) {
    return {
      ok: false,
      reason: 'SP-A-082 final gate: gaming mouse / peripheral SKU — HARD REJECT',
    };
  }

  return { ok: true };
}

/** Throw FinalAutoGateError when AUTO publish must stop. */
export function assertFinalAutoPublishAllowed(input: FinalAutoGateInput): void {
  const result = finalAutoCommodityGate(input);
  if (!result.ok) throw new FinalAutoGateError(result.reason);
}
