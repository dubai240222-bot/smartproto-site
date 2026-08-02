/**
 * Inject 7 verified buyable gadgets into articles.json (no Scout).
 */
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extractArticleImage } from '../src/lib/collectors/image-extractor';

interface Article {
  id: string;
  slug: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  content: string;
  sourceUrl: string;
  publishedAt: string;
  readTime: string;
  imageUrl?: string;
}

const REMOVE = new Set([
  'domesticating-ai-why-vibe-coding-feels-like-cheating',
  'stewart-platform-walker-gains-feeling-in-legs-from-resistors',
  'should-you-still-buy-your-next-smartphone-or-subscribe-to-it-instead',
  'browser-based-3d-editor-covers-the-basics-while-staying-local',
  'commercialization-and-innovation',
  'replace-100-tutorial-videos-with-this-one-smart-keyboard', // concept, not SKU
]);

type Seed = {
  slug: string;
  titleEn: string;
  sourceUrl: string;
  fallbackImage: string;
  title: string;
  content: string;
  tags: string[];
};

const SEEDS: Seed[] = [
  {
    slug: 'origamiswift-foldable-bluetooth-mouse',
    titleEn: 'OrigamiSwift Foldable Bluetooth Mouse',
    sourceUrl: 'https://shop.yankodesign.com/products/origamiswift-folding-mouse',
    fallbackImage:
      'https://www.yankodesign.com/images/design_news/2024/12/discover-the-ultimate-edc-mouse-foldable-design-for-effortless-productivity/origamiswift_folding_mouse_yanko_design_01.jpg',
    title: 'OrigamiSwift: мышь, которая складывается в карман и раскрывается за полсекунды',
    content: `Устал таскать тяжёлую «полноразмерную» мышь в рюкзаке или тыкать трекпадом в кафе? OrigamiSwift решает это красиво: 40 граммов, складывается почти в лист — около 4,5 мм — и за полсекунды превращается в нормальную эргономичную форму под ладонь.

Bluetooth 5.2, тихие клики, HD infrared-сенсор до 4000 CPI, зарядка USB-C и заявка до трёх месяцев от одной зарядки. На столе работает как обычная мышь, в сумке почти не занимает места — редкий случай, когда «портативность» не означает «урезанный компромисс». Есть чёрный и серый; титановый цвет быстро разбирают.

Бери, если учишься или работаешь между кампусом, коворкингом и диваном и не хочешь каждый раз мириться с тачпадом. Для больших ладоней первые дни могут казаться непривычными — это честный минус лёгкой конструкции. Зато механизм складывания остаётся приятным даже после недель ежедневного открытия-закрытия, а связь не отваливается на лекции.

Цена в магазине Yanko Design — $85. Это как раз тот десктопный гаджет, который реально меняет день, а не пылится «на красивое» рядом с кабелями.

Источник: Yanko Design / YD Select.`,
    tags: ['#новинка', '#полезно', '#гаджет', '#мышь', '#EDC', '#Bluetooth', '#работа'],
  },
  {
    slug: 'king-jim-magflap-magnetic-clipboard',
    titleEn: 'King Jim MagFlap Magnetic Clipboard',
    sourceUrl:
      'https://www.yankodesign.com/2026/07/20/this-21-magnetic-clipboard-fixes-3-things-every-clipboard-gets-wrong/',
    fallbackImage:
      'https://www.yankodesign.com/images/design_news/2026/07/this-21-magnetic-clipboard-fixes-3-things-every-clipboard-gets-wrong/magflap_clipboard_yanko_design_01.jpg',
    title: 'MagFlap за $21: планшетка, которая наконец держит бумагу и не «парит» на ветру',
    content: `Знакомо: клипборд, ветер, уголки листов кудрявятся, а готовые страницы болтаются и мешают писать? King Jim MagFlap чинит ровно три классические боли обычной планшетки — без «умного приложения» и без подписки.

Снизу — магнитный клапан, который прижимает стопку и не даёт страницам хлопать. Сзади — второй магнитный клапан: законченные листы перекидываешь через верх и фиксируешь на обратной стороне, рабочая поверхность остаётся чистой. Сверху — клипса во всю ширину, а не «точечный» зажим по центру. Корпус сам магнитный: повесил на шкафчик, локер или холодильник — и руки свободны.

Толщина около 0,7 дюйма, до 30 листов, размеры A4 вертикаль/горизонталь и A3, цвета синий, красный, зелёный и чёрный. Есть направляющая для ровной укладки бумаги — мелочь, которая спасает, когда листов много. Цена — $20,99. Если ты студент с распечатками, медик с обходами или просто ненавидишь бумажный хаос — это мелкая покупка с большим ежедневным эффектом.

Источник: Yanko Design.`,
    tags: ['#новинка', '#полезно', '#гаджет', '#канцелярия', '#магнит', '#студент', '#организация'],
  },
  {
    slug: 'narwal-flow-2-white-robot-vacuum',
    titleEn: "Narwal Flow 2 White Robot Vacuum",
    sourceUrl:
      'https://www.yankodesign.com/2026/07/17/narwals-flow-2-white-a-robot-vacuum-for-homes-with-babies-pets-and-great-taste/',
    fallbackImage:
      'https://www.yankodesign.com/images/design_news/2026/07/narwals-flow-2-white-a-robot-vacuum-for-homes-with-babies-pets-and-great-taste/narwal_flow_2_white_01.jpg',
    title: 'Narwal Flow 2 White: робот-пылесос, который понимает детскую и зону питомца',
    content: `Если дома есть малыш или шерстяной хаос, обычный «просто мощный» робот часто бесит: орёт у кроватки, тащит грязную тряпку по всей квартире, врезается в миску. Narwal Flow 2 White заточен под жилой дом, а не под шоурум.

Baby Care Mode тише работает у детской и помогает отмечать разбросанные игрушки на карте. Pet Mode глубже чистит зоны питомца и даже умеет искать «где мой зверь» через приложение. Тяга заявлена на уровне 31 000 Па, система CarpetFocus усиливает уборку на коврах, а антизапутывание щеток рассчитано на шерсть. FlowWash греет воду примерно до 60 °C и обновляет моп по ходу цикла, станция самоочистки — до ~120 дней без ежедневной возни с контейнером.

Док с матовым «стеклянным» фасадом и мягкой статус-подсветкой выглядит как мебель, а не как ведро из подсобки — это важно, если станция стоит на виду в светлой квартире. Стартовая цена около $1 099 при MSRP выше. Дорого? Да. Но если устал вручную доделывать то, что «умный» пылесос размазал, это флагман ради спокойствия, а не ради цифры в слайдах.

Источник: Yanko Design.`,
    tags: ['#новинка', '#полезно', '#гаджет', '#умныйдом', '#роботпылесос', '#Narwal', '#дом'],
  },
  {
    slug: 'rolling-world-clock-analog-desk',
    titleEn: 'Rolling World Clock',
    sourceUrl: 'https://shop.yankodesign.com/products/rolling-world-clock',
    fallbackImage:
      'https://www.yankodesign.com/images/design_news/2026/04/this-minimalist-analog-world-clock-is-the-upgrade-you-didnt-know-your-desk-needed/rolling_world_clock_01.jpg',
    title: 'Rolling World Clock за $49: крутанул грань — и видишь время в другом городе',
    content: `Не хочешь открывать телефон, чтобы понять, можно ли уже писать другу в Токио? Rolling World Clock делает это тактильно: 12-гранный аналоговый объект, каждая грань — крупный часовой пояс, одна стрелка показывает локальное время.

Лондон, Париж, Нью-Йорк, Москва, Шанхай, Токио, Сидней, Лос-Анджелес, Мехико, Карачи, Кейптаун и Новая Каледония — без меню, приложений и мелкого шрифта. Просто перекатил кубик на нужную сторону и сразу читаешь время. Сделано в Японии, дизайн Masafumi Ishikawa (Lexus Design Award), есть чёрный и белый. Размер крошечный — примерно 8×8×3 см, идеально ложится на край монитора или полку рядом с ноутбуком.

За $49 это редкий «деск-объект», который реально полезен удалёнщикам, фрилансерам и всем, у кого жизнь размазана по таймзонам. Он красивее очередного виджета на экране, но главное — им хочется пользоваться каждый день, а не один раз «ради фото стола». На складе YD Select остатки часто маленькие, так что если понравился формат — лучше не тянуть.

Источник: Yanko Design / YD Select.`,
    tags: ['#новинка', '#полезно', '#гаджет', '#часы', '#деск', '#дизайн', '#таймзоны'],
  },
  {
    slug: 'anywhere-use-lamp-portable-aa',
    titleEn: 'Anywhere-Use Lamp',
    sourceUrl: 'https://shop.yankodesign.com/products/anywhere-use-lamp',
    fallbackImage:
      'https://www.yankodesign.com/images/design_news/2026/08/the-7-best-desk-gadgets-tools-of-july-2026-for-college-students/anywhere_use_lamp_01.jpg',
    title: 'Anywhere-Use Lamp: настольный свет без розетки — кинул на стол и читаешь',
    content: `В общаге, Airbnb или на кухонном столе розетка всегда «не там». Anywhere-Use Lamp из Японии (TENT × Fujita Metal) работает от четырёх AA — ставишь свет туда, где он нужен, а не туда, куда дотягивается кабель.

Шесть LED с тёплым светом и хорошей цветопередачей, четыре уровня яркости: от ночника до нормального чтения. Нажимаешь на край «шляпки» — клик с приятным откликом и смена яркости. Лампа разбирается и едет в сумке, корпус из порошковой стали, есть чёрный, белый и Industrial со «поцарапанным» характером базы. На минималке заявлено до ~80 часов, на втором уровне около 40, на максимуме — около 8.

Цена $149 — не «дешёвый али», а вещь, которую реально переставляешь по квартире годами: к кровати, на подоконник, на стол для вечерней работы. Бери, если устал от проводов, удлинителей и ламп, которые живут только у одной розетки и портят весь сценарий комнаты.

Источник: Yanko Design / YD Select.`,
    tags: ['#новинка', '#полезно', '#гаджет', '#лампа', '#портатив', '#деск', '#япония'],
  },
  {
    slug: 'inkleaf-foldable-dual-eink-notebook',
    titleEn: 'Inkleaf Foldable Dual-Screen E Ink Notebook',
    sourceUrl:
      'https://www.yankodesign.com/2026/07/13/inkleafs-foldable-dual-screen-e-ink-notebook-lets-you-read-and-write-at-the-same-time/',
    fallbackImage:
      'https://www.yankodesign.com/images/design_news/2026/07/inkleafs-foldable-dual-screen-e-ink-notebook-lets-you-read-and-write-at-the-same-time/inkleaf_01.jpg',
    title: 'Inkleaf: складной E Ink с двумя экранами — читаешь слева, пишешь справа',
    content: `Обычный ридер заставляет выбирать: либо PDF на весь экран, либо заметки — и снова прыжки между окнами. Inkleaf раскрывается как книга: два 10,3″ Carta E Ink рядом. Слева учебник или статья, справа рукописный конспект — без второго устройства и без подписки «чтобы открыть свои файлы».

В сложенном виде около 8,4 мм и 480 г, каждая панель около 4,2 мм — тоньше многих «плоских» конкурентов вроде reMarkable 2 или Kindle Scribe, плюс устройство реально складывается на петле 180°. Корпус из литого алюминия, кнопки под большим пальцем, Android, PDF/EPUB/MOBI/TXT, AI-поиск по рукописному тексту. В комплекте стилус с нажимом и USB-C.

Ориентир цены около $450, первые поставки фаундерам — август 2026. Если ты студент, исследователь или просто любишь длинное чтение с пометками — это один из самых честных ответов на «хочу читать и писать одновременно». Не планшет с подсветкой ради бесконечного скролла, а рабочий бумагоподобный инструмент для настоящих сессий.

Источник: Yanko Design.`,
    tags: ['#новинка', '#полезно', '#гаджет', '#EInk', '#чтение', '#учёба', '#Inkleaf'],
  },
  {
    slug: 'techcrunch-best-handheld-mini-fan-picks',
    titleEn: "What's the best handheld mini fan?",
    sourceUrl: 'https://techcrunch.com/2026/08/01/whats-the-best-handheld-mini-fan/',
    fallbackImage: 'https://techcrunch.com/wp-content/uploads/2026/07/mini-fans-review.jpg?resize=1200,675',
    title: 'Какой мини-вентилятор взять в жару: практичный разбор карманных моделей',
    content: `Жара в метро — и ты уже смотришь на людей с крошечными вентиляторами не как на мем, а как на выживших. TechCrunch сравнил ручные мини-вентиляторы: где нормальный поток воздуха, где тихий мотор, где батарея не садится через двадцать минут и где корпус не выглядит как одноразовый пластик из киоска.

Смысл не в «любом вентиляторе за три доллара», а в модели, которую реально носишь каждый день: компактная, с нормальным хватом, USB-C или понятной зарядкой, без адского дребезга на совещании. В подборке — варианты под карман, сумку и стол, плюс честные минусы вроде шума на максималке, веса и хлипких лопастей. Это полезно перед покупкой на маркетплейсе, где фото всегда красивее реальности.

Если лето снова обещает ад, а кондей бывает только в офисе — это гаджет «на сейчас», который окупается за первую неделю поездок. Открой разбор, сравни фичи и бери модель под свой сценарий: пеший город, офис open space или ночной стол у ноутбука — а не самый яркий цвет на витрине.

Источник: TechCrunch.`,
    tags: ['#новинка', '#полезно', '#гаджет', '#лето', '#вентилятор', '#обзор', '#EDC'],
  },
];

function summaryOf(text: string): string {
  const t = text.trim();
  if (t.length <= 200) return t;
  const i = t.indexOf('.', 50);
  if (i > 0 && i <= 200) return t.slice(0, i + 1);
  return `${t.slice(0, 197)}...`;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function main() {
  const root = process.cwd();
  const articlesPath = path.resolve(root, 'src', 'data', 'articles.json');
  const draftsDir = path.resolve(root, 'drafts');
  await mkdir(draftsDir, { recursive: true });

  let articles: Article[] = JSON.parse((await readFile(articlesPath, 'utf8')).replace(/^\uFEFF/, ''));
  const before = articles.length;
  articles = articles.filter((a) => !REMOVE.has(a.slug));
  // Also drop the short mini-fan duplicate if we'll republish improved version under new slug
  articles = articles.filter((a) => a.slug !== 'what-s-the-best-handheld-mini-fan');
  console.log(`Removed ${before - articles.length} weak/dup entries`);

  const seen = new Set(
    articles.flatMap((a) => [a.slug, a.id, a.sourceUrl, a.sourceUrl.replace(/\?.*$/, '')]),
  );

  const published: string[] = [];
  const now = Date.now();

  for (let i = 0; i < SEEDS.length; i++) {
    const seed = SEEDS[i];
    if (seen.has(seed.slug) || seen.has(seed.sourceUrl)) {
      console.log(`skip existing ${seed.slug}`);
      continue;
    }
    if (/дожили/i.test(seed.title + seed.content)) throw new Error('cliche in seed');
    const wc = wordCount(seed.content);
    console.log(`${seed.slug}: ${wc} words`);
    if (wc < 140 || wc > 220) {
      console.warn(`WARN wordcount ${wc} for ${seed.slug}`);
    }

    let imageUrl = seed.fallbackImage;
    try {
      const extracted = await extractArticleImage(seed.sourceUrl);
      if (extracted) imageUrl = extracted;
    } catch {
      /* keep fallback */
    }

    const publishedAt = new Date(now - i * 1000).toISOString();
    const article: Article = {
      id: seed.slug,
      slug: seed.slug,
      title: seed.title,
      category: 'ГАДЖЕТ / ПОЛЕЗНО',
      tags: seed.tags,
      summary: summaryOf(seed.content),
      content: seed.content,
      sourceUrl: seed.sourceUrl,
      publishedAt,
      readTime: `${Math.max(1, Math.ceil(wc / 150))} мин`,
      imageUrl,
    };

    articles = [article, ...articles];
    seen.add(seed.slug);
    seen.add(seed.sourceUrl);
    published.push(seed.slug);

    await writeFile(
      path.join(draftsDir, `${Date.now()}-${seed.slug}.json`),
      JSON.stringify({ generatedAt: publishedAt, source: { title: seed.titleEn, url: seed.sourceUrl }, draft: article }, null, 2),
      'utf8',
    );
    console.log(`OK https://www.smartproto.net/articles/${seed.slug}`);
  }

  await writeFile(articlesPath, JSON.stringify(articles, null, 2) + '\n', 'utf8');
  console.log(`\nDONE published=${published.length} total=${articles.length}`);
  for (const s of published) console.log(`https://www.smartproto.net/articles/${s}`);
  if (published.length < 5) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
