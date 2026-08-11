/**
 * SP-A-085 — dry control: finish-the-thought Editor rewrites (no publish).
 *
 *   npx tsx scripts/spa085-finish-thought-control.ts
 */
import 'dotenv/config';
import { writeDraft } from '../src/lib/ai/editor';

type Case = {
  name: string;
  question: string;
  oldFailed: string;
  missing: string[];
  oldText: string;
  articleData: Record<string, unknown>;
  reviewData: Record<string, unknown>;
};

const CASES: Case[] = [
  {
    name: 'Ulefone Armor 24 Pro',
    question: 'Насколько велики/тяжелы «габариты», с которыми нужно мириться ради батареи?',
    oldFailed:
      'Говорит про габариты и выносливость, но не даёт вес, размеры, толщину и сравнение с обычным смартфоном.',
    missing: ['вес 647 г', '181.2×87×27.5 мм', 'аккумулятор 22000 мА·ч', 'сравнение с ~170–200 г телефоном'],
    oldText:
      'Armor 24 Pro создан для тех, кто готов мириться с его габаритами ради впечатляющей выносливости. Большой аккумулятор обещает долго работать в походах.',
    articleData: {
      format: 'article',
      mode: 'gadget',
      title: 'Ulefone Armor 24 Pro rugged phone with 22000mAh battery',
      sourceName: 'Ulefone official',
      text: [
        'Ulefone Armor 24 Pro — защищённый смартфон с аккумулятором 22000 мА·ч (typ).',
        'Официальные размеры: 181.2 × 87 × 27.5 мм, вес 647 г.',
        'Производитель заявляет до 7 дней работы без частой зарядки; есть задний LED до 1000 люмен.',
        'Обычный современный смартфон весит примерно 170–200 г — для сравнения габаритов.',
        'Устройство ориентировано на тех, кому важна автономность сильнее тонкости корпуса.',
      ].join('\n'),
    },
    reviewData: {
      technicalVerdict: 'PASS: rugged phone with verified official size/weight/battery',
      productName: 'Armor 24 Pro',
      manufacturer: 'Ulefone',
    },
  },
  {
    name: 'HoverAir Versa',
    question: 'Насколько «карманный» гибрид камера+дрон и сколько он реально летает?',
    oldFailed: 'Повторяет «мгновенную трансформацию» и мобильность без веса, времени полёта и размера.',
    missing: ['вес', 'время полёта', 'карманный форм-фактор с цифрой'],
    oldText:
      'HoverAir Versa мгновенно превращается из ручной камеры в дрон. Универсальное и компактное решение для тех, кто ценит мобильность.',
    articleData: {
      format: 'article',
      mode: 'gadget',
      title: 'HoverAir Versa pocket gimbal camera drone hybrid',
      sourceName: 'New Atlas',
      text: [
        'HoverAir Versa — гибрид карманной камеры со стабилизатором и мини-дрона.',
        'По данным источника: устройство весит около 149 г, складывается в карманный форм-фактор,',
        'заявленное время полёта около 16 минут, переключение hand→hover за секунды.',
        'Снимает стабилизированное видео с рук и с воздуха одним корпусом.',
      ].join('\n'),
    },
    reviewData: {
      technicalVerdict: 'PASS: hybrid pocket camera/drone with flight time and weight',
      productName: 'HoverAir Versa',
    },
  },
  {
    name: 'OpenAI GPT-5.6-Cyber',
    question: 'Насколько «значительно реже отказывается» и насколько лучше обычной модели?',
    oldFailed: 'Раньше текст обрывался на «впечатляющих» процентах без ясного «что стало возможно человеку/команде».',
    missing: ['95% vs 1.5%', 'доступ только Daybreak Red', 'пример: 2 zero-day в Chrome V8'],
    oldText:
      'GPT-5.6-Cyber значительно реже отказывается помогать. На тестах показал впечатляющие результаты по кибербезопасности.',
    articleData: {
      format: 'article',
      mode: 'ai_radar',
      title: 'OpenAI launches GPT-5.6-Cyber for defensive cybersecurity',
      sourceName: 'VentureBeat',
      text: [
        'OpenAI выпустила GPT-5.6-Cyber — специализированную модель для оборонительной кибербезопасности.',
        'На внутренних тестах: 95% completion на advanced cybersecurity tasks против 1.5% у обычной модели.',
        'Доступ ограничен программой Daybreak Red (проверка оборонительного использования).',
        'OpenAI сообщила об обнаружении двух ранее неизвестных уязвимостей в Chrome V8, исправленных Google.',
        'Модель умеет искать zero-day и строить цепочки эксплуатации для защиты.',
      ].join('\n'),
    },
    reviewData: {
      technicalVerdict: 'PASS: AI capability event with benchmark and concrete outcome',
    },
  },
  {
    name: 'UCL solar windows',
    question: 'Что значит «значительное снижение счетов» — есть ли хоть какая-то цифра/статус?',
    oldFailed: 'Обещает исчезновение счетов за свет без эффективности, статуса (lab/prototype) и масштаба.',
    missing: ['статус: лабораторная разработка', 'работа от солнца и indoor light', 'нет выдуманного % экономии'],
    oldText:
      'Окна смогут генерировать электричество. Потенциально — значительное снижение или полное исчезновение счетов за электричество.',
    articleData: {
      format: 'article',
      mode: 'ai_radar',
      title: 'UCL solar windows harvest sun and indoor light',
      sourceName: 'UCL News',
      text: [
        'Учёные UCL разработали полупрозрачные солнечные элементы для окон.',
        'Они собирают энергию и от солнечного света, и от обычного комнатного освещения.',
        'Это лабораторная разработка / research prototype, не готовый массовый продукт.',
        'Цель — превратить площадь остекления в источник энергии; точный % экономии счетов в источнике не назван.',
        'До массового внедрения ещё путь; важно не обещать «счета исчезнут» без цифры.',
      ].join('\n'),
    },
    reviewData: {
      technicalVerdict: 'PASS: research milestone — energy-harvesting windows, prototype status',
    },
  },
  {
    name: 'OmniHand 3 Ultra-M / contact intelligence',
    question: 'Что рука реально умеет сверх «впечатляющих манипуляций» с шариками?',
    oldFailed: 'Красивая сцена с шариками без того, что именно измеряется и зачем это человеку/производству.',
    missing: ['задача: фигурки из шариков', 'contact intelligence = сила/адаптация', 'обучение с восстановлением после ошибок'],
    oldText:
      'Роботизированная рука демонстрирует впечатляющие возможности сложных манипуляций. Это новый этап робототехники.',
    articleData: {
      format: 'article',
      mode: 'ai_radar',
      title: 'AGILINK OmniHand 3 Ultra-M balloon animal contact intelligence',
      sourceName: 'IEEE Spectrum',
      text: [
        'Роботизированная рука OmniHand 3 Ultra-M (AGILINK) делает фигурки из воздушных шариков.',
        'Задача требует точного контроля силы и адаптации к меняющейся форме объекта.',
        '«Contact intelligence» — ощущать контакт, держать стабильное касание с податливым объектом.',
        'Обучение включает восстановление после ошибок и анализ вмешательств оператора.',
        'Практический смысл: деликатные операции, где раньше нужна была человеческая рука (быт/сборка).',
      ].join('\n'),
    },
    reviewData: {
      technicalVerdict: 'PASS: robotics capability demo with concrete task',
    },
  },
];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasComparison(text: string): boolean {
  return /для сравнения|в\s+\d|раз[а]?\s+(тяж|больш|быстр|дешев)|≈|примерно|обычн\w*\s+смартфон|против|vs\b|раньше.{0,40}теперь|рабоч\w*\s+смен/i.test(
    text,
  );
}

function endingOf(text: string): string {
  const parts = text.trim().split(/(?<=[.!?…])\s+/);
  return parts.slice(-2).join(' ');
}

async function main() {
  console.log('SP-A-085 finish-the-thought control (dry)\n');
  let armorOk = false;
  let weak = 0;

  for (const c of CASES) {
    console.log('='.repeat(72));
    console.log('TITLE:', c.name);
    console.log('WHAT QUESTION ARTICLE RAISES:', c.question);
    console.log('WHAT OLD TEXT FAILED TO ANSWER:', c.oldFailed);
    console.log('MISSING FACTS:', c.missing.join('; '));
    const draft = await writeDraft(c.articleData, c.reviewData);
    const wc = wordCount(draft.text);
    const cmp = hasComparison(draft.text);
    const unfinished =
      /мириться с (его )?габарит|довольно тяж|больш(ой|ая)\s+аккумулятор|огромн\w*\s+запас|значительн\w*\s+снижен/i.test(
        draft.text,
      ) && !/\d[\d\s.,]*\s*(г|кг|мм|мА·?ч|mAh|%|час|мин)/i.test(draft.text);

    if (c.name.startsWith('Ulefone Armor')) {
      const hasWeight = /647/.test(draft.text);
      const hasSize = /181/.test(draft.text) || /27\.5/.test(draft.text);
      const hasBattery = /22000|22\s*000/.test(draft.text);
      armorOk = hasWeight && hasSize && hasBattery && !unfinished;
      console.log('ARMOR CHECK:', { hasWeight, hasSize, hasBattery, unfinished, armorOk });
    }

    if (unfinished || draft.title === 'REJECT') weak += 1;

    console.log('NEW VERSION:\n' + draft.text);
    console.log('WORD COUNT:', wc);
    console.log('COMPARISON USED:', cmp ? 'YES' : 'NO');
    console.log('ENDING:', endingOf(draft.text));
    console.log('STATUS:', unfinished || draft.title === 'REJECT' ? 'WEAK' : 'OK');
    console.log();
  }

  console.log('SUMMARY weak=', weak, 'armorOk=', armorOk);
  if (!armorOk || weak > 1) {
    console.error('STOP calibration — ask GPT Sol if still unfinished after one pass.');
    process.exit(1);
  }
  console.log('CONTROL PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
