/**
 * SP-A-071 — Human Priority Gate (cheap editorial overlay).
 * Not Human Value scoring / PR #9. Local regex door + grey-noise demote/reject.
 */
export type HumanDoor =
  | 'money'
  | 'one_person'
  | 'direct_access'
  | 'home'
  | 'autonomy'
  | 'routine'
  | 'new_ability'
  | 'mobility'
  | 'none';

export interface PriorityGateResult {
  score: number;
  penalty: number;
  reason?: string;
  door: HumanDoor;
  grey: boolean;
  /** True when grey noise has no human door — Scout/Reviewer should not publish. */
  blockPublish: boolean;
}

/** Grey gadget / factory noise — default: do not publish. */
const GREY_NOISE_RE: RegExp[] = [
  // Peripherals / audio / gaming clutter
  /\b(gaming\s+)?(wireless\s+)?mouse\b|\b(игров\w*\s+)?мышь\b|\bмыши\b|\bmice\b/i,
  /\b(mechanical|gaming|мембранн\w*)\s+keyboard\b|\bмеханическ\w*\s+клавиатур/i,
  /\b(bluetooth\s+)?speaker\b|\bboombox\b|\bxboom\b|\bsubwoofer\b|\bсабвуфер|\bколонк/i,
  /\b(headphones?|earbuds?|headset|наушник|гарнитур)\b/i,
  /\b(gaming\s+)?(controller|gamepad|joystick|геймпад)\b/i,
  // Ordinary phone / display / power clutter
  /\b(ordinary|budget|бюджетн\w*|очередн\w*)\s+(smartphone|phone|смартфон)/i,
  /\b(smartphone|смартфон|phone)\b.{0,80}\b(launch|unveil|представил|анонс|вышел|новый)\b/i,
  /\b(lava|micromax|itel|tecno|infinix|iqoo)\b.{0,40}\b(phone|smartphone|smart\s*\d|смартфон|z\d)/i,
  /\b(monitor|монитор|television|\btv\b|телевизор)\b/i,
  /\b(charger|зарядк|power\s*bank|повербанк|пауэрбанк)\b/i,
  // Spec / refresh noise
  /\b(megapixel|мегапиксе|polling\s*rate|\d+\s*hz|\+\s*\d+\s*%|spec(?:s|ifications)?\s+(leak|refresh)|обновлен\w*\s+характеристик)/i,
  /\b(color|colour|colorway|оттенк|новый\s+цвет)\s+(refresh|update|option|версия)/i,
  /\b(processor|cpu|snapdragon|dimensity)\b.{0,40}\b(upgrade|обновл|faster|производительн)/i,
  /\b(camera|камер)\b.{0,40}\b(refresh|обновл|megapixel|мегапиксе)/i,
  /\b(generic\s+)?(wearable|fitness\s+band|фитнес[- ]?браслет)\b/i,
  // Industrial robots without a person-facing door
  /\b(factory|industrial|warehouse)\s+(robot|arm|automation)\b/i,
  /\b(robot\s+arm|robotic\s+arm|industrial\s+manipulator)\b/i,
  /\b(промышленн\w*\s+робот|заводск\w*\s+робот|складск\w*\s+автоматиз|манипулятор\s+для\s+(завода|линии|цех))/i,
  /\b(pick[- ]and[- ]place|palletiz|assembly\s+line\s+robot)\b/i,
];

/** Assistive / replace-peripheral stories are not grey noise. */
const NOT_GREY_EXCEPTION_RE =
  /\b(replace|replaces|вместо|без\s+необходимости)\b[\s\S]{0,50}\b(mouse|мыши|мышь|keyboard|клавиатур)|не\s+может\s+(пользоваться\s+)?рук|paralys|paralyz|disability|доступн\w*\s+сред|assistive|эмг|emg\s+bracelet|жестов\w*\s+браслет/i;

type DoorRule = { door: Exclude<HumanDoor, 'none'>; re: RegExp };

const HUMAN_DOOR_RULES: DoorRule[] = [
  {
    door: 'money',
    re: /\b(дешевл|доступн\w*\s+цен|в\s+разы\s+дешев|экономит\s+деньг|сэконом|affordable|cheaper\s+than|cost\s+saving|democratiz|проф\w*\s+.{0,20}для\s+дома|вместо\s+дорого)/i,
  },
  {
    door: 'one_person',
    re: /\b(один\s+человек|без\s+команды|сам(ому|а)?\b|самостоятельно\s+(сдел|запуст|собер)|diy\b|do[- ]it[- ]yourself|without\s+a\s+(team|specialist)|one[- ]person\s+(business|studio|shop)|solo\s+(founder|creator|operator))/i,
  },
  {
    door: 'direct_access',
    re: /\b(без\s+посредник|напрямую|direct\s+(access|to\s+(factory|maker|brand))|минуя\s+(магазин|дилер)|factory[- ]direct|peer[- ]to[- ]peer)/i,
  },
  {
    door: 'home',
    re: /\b(дома\s+вместо|не\s+ехать\s+в\s+(клиник|офис|салон)|clinic\s*→\s*home|at[- ]home\s+(care|dialysis|lab|therapy|dental)|перенос\w*\s+(услуг|процедур)\s+домой|home\s+instead\s+of)/i,
  },
  {
    door: 'autonomy',
    re: /\b(самостоятельн|assistive|accessibility|инвалид|ограниченн\w*\s+возможност|не\s+может\s+ходить|без\s+помощник|independence|mobility\s+aid|для\s+людей\s+с\s+)/i,
  },
  {
    door: 'routine',
    re: /\b(убирает\s+рутин|больше\s+не\s+нужно|избавля\w*\s+от|automates?\s+(the\s+)?(chore|routine|daily)|снимает\s+обязанност|повторяющ\w*\s+обязанност)/i,
  },
  {
    door: 'new_ability',
    re: /\b(новая\s+способност|раньше\s+нельзя\s+было|недоступн\w*\s+обычн|gives?\s+(people|users)\s+the\s+ability|first\s+time\s+(consumers?|people)\s+can|открывает\s+возможност)/i,
  },
  {
    door: 'mobility',
    re: /\b(из\s+любой\s+точки|не\s+привязан\s+к\s+месту|удалённ\w*\s+работ|remote\s+work|place\s+freedom|работает\s+без\s+(офиса|клиники)|on[- ]the[- ]go\s+(professional|clinic))/i,
  },
];

export function detectHumanDoor(title: string, text = ''): HumanDoor {
  const hay = `${title}\n${text}`;
  for (const rule of HUMAN_DOOR_RULES) {
    if (rule.re.test(hay)) return rule.door;
  }
  return 'none';
}

export function isGreyGadgetNoise(title: string, text = ''): boolean {
  const hay = `${title}\n${text}`;
  if (NOT_GREY_EXCEPTION_RE.test(hay)) return false;
  return GREY_NOISE_RE.some((re) => re.test(hay));
}

/**
 * Non-grey stories that still read as «неужели?» without an explicit door phrase
 * (robotics / frontier AI demos). Not a scoring framework — allow-list only.
 */
const SHARE_WORTHY_RE =
  /\b(robot|робот|humanoid|exoskeleton|prosthetic|протез|brain[- ]?computer|bci|llm|chatgpt|claude|gemini\s+robotics|whole[- ]body|embodied\s+ai|tactile|тактильн|manipulat|оптическ\w*\s+нейро|neural\s+interface|drone\s+swarm)\b/i;

export function isShareWorthyStory(title: string, text = ''): boolean {
  if (isGreyGadgetNoise(title, text)) return false;
  return SHARE_WORTHY_RE.test(`${title}\n${text}`);
}

/**
 * Scout post-score gate. Does NOT change SCOUT_SCORE_THRESHOLD.
 * Grey + no door → cap ~18 (fails 70) / block publish.
 * No door + not share-worthy → demote ≤55 (SKIP rather than publish for regularity).
 * Door or share-worthy robotics/AI → keep score.
 */
export function applyHumanPriorityGate(
  rawScore: number,
  title: string,
  text = '',
): PriorityGateResult {
  const door = detectHumanDoor(title, text);
  const grey = isGreyGadgetNoise(title, text);
  const shareWorthy = isShareWorthyStory(title, text);
  const scoreIn = Math.max(0, Math.min(100, Math.round(rawScore)));

  if (grey && door === 'none') {
    const score = Math.min(scoreIn, 18);
    return {
      score,
      penalty: Math.max(0, scoreIn - score),
      reason: 'SP-A-071 grey noise without human door',
      door,
      grey,
      blockPublish: true,
    };
  }

  if (door === 'none' && !shareWorthy) {
    const score = Math.min(scoreIn, 55);
    return {
      score,
      penalty: Math.max(0, scoreIn - score),
      reason: 'SP-A-071B no human door / not share-worthy — SKIP over regularity',
      door,
      grey,
      blockPublish: false,
    };
  }

  return {
    score: scoreIn,
    penalty: 0,
    reason: grey
      ? `SP-A-071 grey cleared by human door (${door})`
      : door !== 'none'
        ? `SP-A-071 human door (${door})`
        : 'SP-A-071B share-worthy (robotics/AI) — allow',
    door,
    grey,
    blockPublish: false,
  };
}

/** True when Scout may mark interesting (threshold still applied separately). */
export function passesEditorialPriority(title: string, text = ''): boolean {
  if (shouldHardRejectGreyNoise(title, text)) return false;
  const door = detectHumanDoor(title, text);
  if (door !== 'none') return true;
  return isShareWorthyStory(title, text);
}

/** Hard-reject helper: grey noise only when no human door. */
export function shouldHardRejectGreyNoise(title: string, text = ''): boolean {
  return isGreyGadgetNoise(title, text) && detectHumanDoor(title, text) === 'none';
}
