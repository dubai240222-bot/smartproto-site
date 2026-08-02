/**
 * SP-A-032-U1 — LOCAL title signals only. No internet, no OpenRouter, no articles.json.
 * Budget reminder: parsers many → hard-reject → Qwen max 3–5/cycle (not invoked here).
 */
import {
  chinaHardReject,
  findChinaNoveltySignals,
  guessChinaCategory,
} from '../src/lib/ai/china-analyst';

const TITLES = [
  '小米发布可穿戴设备新品手环，首发预售开启',
  '安克推出便携迷你充电宝创新产品',
  '某品牌新款只换色，同款复刻上市',
  '热销榜导购合集：什么值得买SEO合集',
  '普通陶瓷杯子新品到货',
  '华为智能家居机器人众筹启动',
  '包治百病的神药手环医疗级疗效',
  '概念产品AI硬件终端亮相消费电子展',
];

for (const title of TITLES) {
  const signals = findChinaNoveltySignals(title);
  const category = guessChinaCategory(title);
  const gate = chinaHardReject({
    sourceUrl: 'https://example.com/manual',
    platform: 'manual',
    title,
    summary: title,
  });
  console.log('---');
  console.log(`title: ${title}`);
  console.log(`novelty: ${signals.join(', ') || '(none)'}`);
  console.log(`category: ${category}`);
  console.log(`hardReject: ${gate.reason || '(pass)'}`);
  console.log(`verdict: ${gate.reject ? 'REJECT' : 'CONSIDER'}`);
}
