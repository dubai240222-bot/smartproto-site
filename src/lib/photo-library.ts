/**
 * SP-A-101 — Editorial photo library with global rotation cycle.
 * When an article has no good hero, assign the next library template in order.
 * Used assets stay marked until the full cycle completes, then the cycle resets.
 * No topic matching — pure sequential rotation through a curated pool.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { CATEGORY_STOCK, type VisualCategoryKey } from './visual-fallback';

export type PhotoLibraryAsset = {
  id: string;
  url: string;
  scene: string;
};

export type PhotoLibraryCycleState = {
  nextIndex: number;
  usedInCycle: string[];
  cycleNumber: number;
  updatedAt: string;
};

const POPULAR_CATEGORIES: VisualCategoryKey[] = [
  'ai_future',
  'gadget',
  'robotics',
  'mobility',
  'healthtech',
  'energy',
  'research',
  'smart_home',
  'gaming',
  'future_tech',
  'open_source',
  'business',
];

/** Extra curated Unsplash scenes (15 per popular category → ~150 additional). */
const EXTRA_LIBRARY: Partial<Record<VisualCategoryKey, { photoId: string; scene: string }[]>> = {
  ai_future: [
    { photoId: 'photo-1535378643346-79aebb8a6035', scene: 'server lights' },
    { photoId: 'photo-1555949963-aa79dcee981c', scene: 'code matrix' },
    { photoId: 'photo-1558494949-ef010cbdcc31', scene: 'data center aisle' },
    { photoId: 'photo-1504639725590-34d0984388bd', scene: 'hologram touch' },
    { photoId: 'photo-1451187580459-43490279c0fa', scene: 'earth networks' },
    { photoId: 'photo-1518770660439-4636190af475', scene: 'chip macro' },
    { photoId: 'photo-1526374965328-7f61d4dc18c5', scene: 'matrix rain' },
    { photoId: 'photo-1635070041078-e363dbe005cb', scene: 'tech orb' },
    { photoId: 'photo-1555255707-c079660bb025', scene: 'AI workspace' },
    { photoId: 'photo-1563986768609-322da13575f3', scene: 'futuristic desk' },
    { photoId: 'photo-1617791160505-6f00504e3519', scene: 'neural art' },
    { photoId: 'photo-1620712943543-bcc4688e7485', scene: 'robot portrait' },
    { photoId: 'photo-1677442136019-21780ecad995', scene: 'AI glow' },
    { photoId: 'photo-1676299080920-8ac4c4c0d0e8', scene: 'circuit trails' },
    { photoId: 'photo-1655720828018-edd2daec9349', scene: 'headset collab' },
  ],
  gadget: [
    { photoId: 'photo-1523275335684-37898b6baf30', scene: 'watch flatlay' },
    { photoId: 'photo-1434494870777-86ca23adf0ec', scene: 'phone desk' },
    { photoId: 'photo-1511707171634-5f897ff81aa9', scene: 'laptop coffee' },
    { photoId: 'photo-1498050108023-c5249f4df085', scene: 'dev setup' },
    { photoId: 'photo-1587825140708-dfaf76ae4a56', scene: 'keyboard macro' },
    { photoId: 'photo-1601784551446-20c9e07edb3c', scene: 'phone hand' },
    { photoId: 'photo-1556656793-08538406a9f0', scene: 'phone stack' },
    { photoId: 'photo-1544244015-0df4b3ffc134', scene: 'tablet pen' },
    { photoId: 'photo-1580910051074-3eb694886505', scene: 'smartphone glow' },
    { photoId: 'photo-1512941937669-90a1b58e7e9c', scene: 'device showcase' },
    { photoId: 'photo-1592890288564-76628a30a657', scene: 'gadget flatlay' },
    { photoId: 'photo-1563013544-824ae1b704d3', scene: 'city night tech' },
    { photoId: 'photo-1550009158-9ebf69173e03', scene: 'electronics' },
    { photoId: 'photo-1505740420928-5e560c06d30e', scene: 'headphones' },
    { photoId: 'photo-1526170375885-4d8ecf77b99f', scene: 'camera gear' },
  ],
  robotics: [
    { photoId: 'photo-1535378917042-10a22c95931a', scene: 'industrial arm' },
    { photoId: 'photo-1518314916381-77a37c2a49ae', scene: 'humanoid' },
    { photoId: 'photo-1581091226825-a6a2a5aee158', scene: 'engineer robot' },
    { photoId: 'photo-1589254065878-42c9da997008', scene: 'gripper' },
    { photoId: 'photo-1485827404703-89b55fcc595e', scene: 'lab robot' },
    { photoId: 'photo-1555949963-aa79dcee981c', scene: 'tech lab' },
    { photoId: 'photo-1531746795393-6c087f046d1b', scene: 'robot hand' },
    { photoId: 'photo-1563770660931-64b2f1c44947', scene: 'factory robot' },
    { photoId: 'photo-1581092160562-40aa08e78837', scene: 'automation' },
    { photoId: 'photo-1507146423296-424593475144', scene: 'drone close' },
    { photoId: 'photo-1517976487492-5750f3196463', scene: 'warehouse bot' },
    { photoId: 'photo-1558346490-a72e53ae2d4f', scene: 'tech bench' },
    { photoId: 'photo-1558618666-fcd25c85cd64', scene: 'future machine' },
    { photoId: 'photo-1516321318423-f06f85e504b3', scene: 'robotics team' },
    { photoId: 'photo-1581092918056-0c4c3acd378a', scene: 'precision arm' },
  ],
  mobility: [
    { photoId: 'photo-1492144534655-ae79c964c9d7', scene: 'car front' },
    { photoId: 'photo-1449965408869-eaa3f722e40d', scene: 'highway' },
    { photoId: 'photo-1474302770737-173ee21bab63', scene: 'drone sky' },
    { photoId: 'photo-1540962351504-0429c03f4a4d', scene: 'aircraft' },
    { photoId: 'photo-1558618666-fcd25c85cd64', scene: 'ev dusk' },
    { photoId: 'photo-1503376780353-7e6692767b70', scene: 'car night' },
    { photoId: 'photo-1486262715619-67b85e062381', scene: 'e-bike' },
    { photoId: 'photo-1571068316344-75bc76f77890', scene: 'scooter' },
    { photoId: 'photo-1558618047-3c8c76ca7d13', scene: 'motorcycle' },
    { photoId: 'photo-1511919886356-cd3ebe3c0f6d', scene: 'train motion' },
    { photoId: 'photo-1544622657-9458a71af463', scene: 'EV charge' },
    { photoId: 'photo-1568605114967-8130f3a36993', scene: 'autonomous car' },
    { photoId: 'photo-1502877338535-766e1452684a', scene: 'city traffic' },
    { photoId: 'photo-1493238792791-2a5140800864', scene: 'road trip' },
    { photoId: 'photo-1519003726854-8e2276a8c9a4', scene: 'airport' },
  ],
  healthtech: [
    { photoId: 'photo-1576091160399-112ba8d25d1d', scene: 'clinic tablet' },
    { photoId: 'photo-1559757148-5c350d0d3c56', scene: 'wearable' },
    { photoId: 'photo-1584982751601-97dcc096659c', scene: 'diagnostics' },
    { photoId: 'photo-1579684385127-1ef15d508118', scene: 'care tech' },
    { photoId: 'photo-1631217868264-e5b90bb7e629', scene: 'med research' },
    { photoId: 'photo-1579684385127-1ef15d508118', scene: 'hospital light' },
    { photoId: 'photo-1551197172-0e66a3ebbca8', scene: 'medical device' },
    { photoId: 'photo-1582719471384-894fbb16e074', scene: 'microscope' },
    { photoId: 'photo-1505751172870-f35393a7bebf', scene: 'health app' },
    { photoId: 'photo-1576091160550-2173dba999ef', scene: 'doctor tablet' },
    { photoId: 'photo-1519494026897-4d37353f878a', scene: 'lab health' },
    { photoId: 'photo-1584515933487-7798242912f9', scene: 'wellness' },
    { photoId: 'photo-1559757175-0eb30b8a0a83', scene: 'brain scan' },
    { photoId: 'photo-1581595228742-f73b1962bbdf', scene: 'fitness tech' },
    { photoId: 'photo-1571019613454-1cb2f99b2d8b', scene: 'health monitor' },
  ],
  energy: [
    { photoId: 'photo-1509391366360-2e959784a276', scene: 'solar field' },
    { photoId: 'photo-1473341304170-971dccb5ac1e', scene: 'wind turbines' },
    { photoId: 'photo-1466611653911-95081537e5b7', scene: 'grid sunset' },
    { photoId: 'photo-1497435334941-8c899ee9e8e9', scene: 'battery' },
    { photoId: 'photo-1569017388730-020d5f2d0624', scene: 'hydro' },
    { photoId: 'photo-1473341304170-971dccb5ac1e', scene: 'renewables' },
    { photoId: 'photo-1508514177221-188b1cf16e9d', scene: 'solar roof' },
    { photoId: 'photo-1465311471301-7b88c163f72d', scene: 'wind farm' },
    { photoId: 'photo-1497435334941-8c899ee9e8e9', scene: 'storage' },
    { photoId: 'photo-1558449028-301e0ec403b3', scene: 'power lines' },
    { photoId: 'photo-1472214103451-9374bd1c798e', scene: 'sunset grid' },
    { photoId: 'photo-1548337138-e46d44614487', scene: 'green energy' },
    { photoId: 'photo-1595433707802-6b2626ef1ca5', scene: 'EV charge sun' },
    { photoId: 'photo-1611273426858-450d4e00148c', scene: 'home solar' },
    { photoId: 'photo-1559305610-3190c6c8a0b9', scene: 'urban solar' },
  ],
  research: [
    { photoId: 'photo-1532094349884-543bc11b234d', scene: 'lab glass' },
    { photoId: 'photo-1582719471384-894fbb16e074', scene: 'microscope' },
    { photoId: 'photo-1507413245164-6160d8298b31', scene: 'science bench' },
    { photoId: 'photo-1576086213369-97a306d36557', scene: 'research notes' },
    { photoId: 'photo-1532187863486-abf9dbad1b69', scene: 'pipette' },
    { photoId: 'photo-1579154204601-01588f42e603', scene: 'scientist' },
    { photoId: 'photo-1581093458791-9f3c3900df4b', scene: 'lab equipment' },
    { photoId: 'photo-1582719471384-894fbb16e074', scene: 'biology' },
    { photoId: 'photo-1582719471384-894fbb16e074', scene: 'chemistry' },
    { photoId: 'photo-1532187863486-abf9dbad1b69', scene: 'petri dish' },
    { photoId: 'photo-1581094794329-c8112a89af12', scene: 'university lab' },
    { photoId: 'photo-1579154204601-01588f42e603', scene: 'research team' },
    { photoId: 'photo-1581093458791-9f3c3900df4b', scene: 'experiment' },
    { photoId: 'photo-1532094349884-543bc11b234d', scene: 'beakers' },
    { photoId: 'photo-1507413245164-6160d8298b31', scene: 'science desk' },
  ],
  smart_home: [
    { photoId: 'photo-1558002038-1055907df827', scene: 'living room' },
    { photoId: 'photo-1586023492125-27b2c045efd7', scene: 'modern interior' },
    { photoId: 'photo-1556912173-46c336c7fd55', scene: 'kitchen tech' },
    { photoId: 'photo-1560448204-e02f11c3d0e2', scene: 'apartment evening' },
    { photoId: 'photo-1600607687939-ce8a6c25118c', scene: 'architecture' },
    { photoId: 'photo-1556912172-406fa4a0a4e3', scene: 'smart lights' },
    { photoId: 'photo-1600585154340-be6161a56a0c', scene: 'home office' },
    { photoId: 'photo-1600607687644-c7171b42498b', scene: 'minimal home' },
    { photoId: 'photo-1600566753190-17f0baa2a6e3', scene: 'cozy tech' },
    { photoId: 'photo-1600585154526-990dced4db0d', scene: 'modern house' },
    { photoId: 'photo-1600607687920-4e2a09cf159d', scene: 'interior design' },
    { photoId: 'photo-1600566752355-35792bedcfea', scene: 'connected home' },
    { photoId: 'photo-1600585154340-be6161a56a0c', scene: 'desk home' },
    { photoId: 'photo-1600607687939-ce8a6c25118c', scene: 'glass house' },
    { photoId: 'photo-1556912173-46c336c7fd55', scene: 'kitchen smart' },
  ],
  gaming: [
    { photoId: 'photo-1542751371-adc38448a05e', scene: 'esports RGB' },
    { photoId: 'photo-1511512578047-dfb367046420', scene: 'controller' },
    { photoId: 'photo-1493711662062-fa541adb3fc8', scene: 'console' },
    { photoId: 'photo-1552820728-8b83bb6b773f', scene: 'arcade neon' },
    { photoId: 'photo-1606144042614-b2417e99c4e3', scene: 'handheld' },
    { photoId: 'photo-1511512578047-dfb367046420', scene: 'gamepad' },
    { photoId: 'photo-1542751371-adc38448a05e', scene: 'gaming desk' },
    { photoId: 'photo-1493711662062-fa541adb3fc8', scene: 'living room game' },
    { photoId: 'photo-1552820728-8b83bb6b773f', scene: 'retro arcade' },
    { photoId: 'photo-1606144042614-b2417e99c4e3', scene: 'portable play' },
    { photoId: 'photo-1511882154062-185ec2440c2d', scene: 'VR headset' },
    { photoId: 'photo-1538481190775-84dc4c3344f0', scene: 'gaming setup' },
    { photoId: 'photo-1511512578047-dfb367046420', scene: 'joystick' },
    { photoId: 'photo-1542751371-adc38448a05e', scene: 'RGB setup' },
    { photoId: 'photo-1493711662062-fa541adb3fc8', scene: 'couch gaming' },
  ],
  future_tech: [
    { photoId: 'photo-1451187580459-43490279c0fa', scene: 'earth grid' },
    { photoId: 'photo-1518770660439-4636190af475', scene: 'circuit vivid' },
    { photoId: 'photo-1526374965328-7f61d4dc18c5', scene: 'matrix' },
    { photoId: 'photo-1504639725590-34d0984388bd', scene: 'hologram' },
    { photoId: 'photo-1635070041078-e363dbe005cb', scene: 'tech orb' },
    { photoId: 'photo-1555949963-aa79dcee981c', scene: 'future code' },
    { photoId: 'photo-1451187580459-43490279c0fa', scene: 'planet tech' },
    { photoId: 'photo-1518770660439-4636190af475', scene: 'pcb macro' },
    { photoId: 'photo-1526374965328-7f61d4dc18c5', scene: 'digital rain' },
    { photoId: 'photo-1504639725590-34d0984388bd', scene: 'interface hands' },
    { photoId: 'photo-1635070041078-e363dbe005cb', scene: 'abstract orb' },
    { photoId: 'photo-1555949963-aa79dcee981c', scene: 'dev future' },
    { photoId: 'photo-1451187580459-43490279c0fa', scene: 'network earth' },
    { photoId: 'photo-1518770660439-4636190af475', scene: 'hardware future' },
    { photoId: 'photo-1526374965328-7f61d4dc18c5', scene: 'cyber light' },
  ],
  open_source: [
    { photoId: 'photo-1517694712202-14dd9538aa97', scene: 'code keyboard' },
    { photoId: 'photo-1461749280684-dccba630e2f6', scene: 'screen code' },
    { photoId: 'photo-1498050108023-c5249f4df085', scene: 'dev desk' },
    { photoId: 'photo-1555066931-4365d14bab8c', scene: 'dark IDE' },
    { photoId: 'photo-1516321318423-f06f85e504b3', scene: 'pairing' },
    { photoId: 'photo-1555066931-4365d14bab8c', scene: 'terminal' },
    { photoId: 'photo-1461749280684-dccba630e2f6', scene: 'programming' },
    { photoId: 'photo-1517694712202-14dd9538aa97', scene: 'typing code' },
    { photoId: 'photo-1498050108023-c5249f4df085', scene: 'laptop code' },
    { photoId: 'photo-1516321318423-f06f85e504b3', scene: 'collab dev' },
    { photoId: 'photo-1555066931-4365d14bab8c', scene: 'night code' },
    { photoId: 'photo-1461749280684-dccba630e2f6', scene: 'monitor code' },
    { photoId: 'photo-1517694712202-14dd9538aa97', scene: 'keyboard glow' },
    { photoId: 'photo-1498050108023-c5249f4df085', scene: 'workspace dev' },
    { photoId: 'photo-1516321318423-f06f85e504b3', scene: 'team dev' },
  ],
  business: [
    { photoId: 'photo-1460925895917-afdab827c52f', scene: 'analytics' },
    { photoId: 'photo-1552664730-d307ca884978', scene: 'team planning' },
    { photoId: 'photo-1556761175-5973dc0f32e7', scene: 'startup' },
    { photoId: 'photo-1507679799987-c73779587ccf', scene: 'executive' },
    { photoId: 'photo-1454165804606-c3d57bc86b40', scene: 'workspace' },
    { photoId: 'photo-1556761175-5973dc0f32e7', scene: 'meeting' },
    { photoId: 'photo-1460925895917-afdab827c52f', scene: 'charts' },
    { photoId: 'photo-1552664730-d307ca884978', scene: 'whiteboard' },
    { photoId: 'photo-1507679799987-c73779587ccf', scene: 'focus work' },
    { photoId: 'photo-1454165804606-c3d57bc86b40', scene: 'laptop biz' },
    { photoId: 'photo-1556761175-5973dc0f32e7', scene: 'collab biz' },
    { photoId: 'photo-1460925895917-afdab827c52f', scene: 'data viz' },
    { photoId: 'photo-1552664730-d307ca884978', scene: 'planning' },
    { photoId: 'photo-1507679799987-c73779587ccf', scene: 'office' },
    { photoId: 'photo-1454165804606-c3d57bc86b40', scene: 'business desk' },
  ],
};

function libUrl(photoId: string): string {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1400&q=82&plib=1`;
}

function buildPhotoLibrary(): PhotoLibraryAsset[] {
  const seen = new Set<string>();
  const out: PhotoLibraryAsset[] = [];

  const push = (id: string, url: string, scene: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, url, scene });
  };

  for (const cat of POPULAR_CATEGORIES) {
    for (const a of CATEGORY_STOCK[cat] || []) {
      push(a.id, a.url.replace(/spfb=1/, 'plib=1'), a.scene);
    }
    for (const extra of EXTRA_LIBRARY[cat] || []) {
      const id = `${cat}-lib-${extra.photoId.replace('photo-', '')}`;
      push(id, libUrl(extra.photoId), extra.scene);
    }
  }

  return out;
}

/** Global ordered library — rotation index walks this array. */
export const PHOTO_LIBRARY: PhotoLibraryAsset[] = buildPhotoLibrary();

function cycleFilePath(): string {
  const root = process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
  return path.join(root, 'photo-library-cycle.json');
}

export function readPhotoLibraryCycle(): PhotoLibraryCycleState {
  const fp = cycleFilePath();
  try {
    if (existsSync(fp)) {
      return JSON.parse(readFileSync(fp, 'utf8')) as PhotoLibraryCycleState;
    }
  } catch {
    /* fresh cycle */
  }
  return {
    nextIndex: 0,
    usedInCycle: [],
    cycleNumber: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function writePhotoLibraryCycle(state: PhotoLibraryCycleState): void {
  const fp = cycleFilePath();
  mkdirSync(path.dirname(fp), { recursive: true });
  writeFileSync(fp, `${JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

/** Pick next asset in global rotation; marks used until cycle completes. */
export function pickNextLibraryAsset(opts?: {
  avoidIds?: Iterable<string>;
  state?: PhotoLibraryCycleState;
}): { asset: PhotoLibraryAsset; state: PhotoLibraryCycleState } {
  const library = PHOTO_LIBRARY;
  if (library.length === 0) {
    throw new Error('Photo library is empty');
  }

  let state = opts?.state ? { ...opts.state, usedInCycle: [...opts.state.usedInCycle] } : readPhotoLibraryCycle();
  const avoid = new Set(opts?.avoidIds || []);

  // Reset cycle when all assets were used.
  if (state.usedInCycle.length >= library.length) {
    state = {
      nextIndex: 0,
      usedInCycle: [],
      cycleNumber: state.cycleNumber + 1,
      updatedAt: new Date().toISOString(),
    };
  }

  let picked: PhotoLibraryAsset | null = null;
  let idx = state.nextIndex % library.length;

  for (let i = 0; i < library.length; i++) {
    const candidate = library[(idx + i) % library.length];
    if (state.usedInCycle.includes(candidate.id)) continue;
    if (avoid.has(candidate.id)) continue;
    picked = candidate;
    idx = (idx + i + 1) % library.length;
    break;
  }

  if (!picked) {
    // Full avoid set — start fresh cycle and take first.
    state = {
      nextIndex: 0,
      usedInCycle: [],
      cycleNumber: state.cycleNumber + 1,
      updatedAt: new Date().toISOString(),
    };
    picked = library[0];
    idx = 1;
  }

  state.usedInCycle.push(picked.id);
  state.nextIndex = idx;

  return { asset: picked, state };
}

/** True when hero should be replaced by library template. */
export function heroNeedsLibraryReplacement(
  url: string | undefined | null,
  opts?: { duplicateCount?: number },
): boolean {
  if (!url || !String(url).trim()) return true;
  if ((opts?.duplicateCount ?? 0) >= 2) return true;

  const u = url.toLowerCase();

  // Already a curated library/stock banner — keep.
  if (/[?&]plib=1(?:&|$)/.test(u) || /[?&]spfb=1(?:&|$)/.test(u)) return false;
  if (/\/media\/library\//i.test(u)) return false;

  if (
    /avatar|logo|icon|favicon|sprite|emoji|gravatar|placeholder|badge|mark\.png|brand|monogram/i.test(
      u,
    ) ||
    /\.svg(\?|$)/i.test(u) ||
    /google.*logo|gstatic\.com\/.*logo|lh3\.googleusercontent\.com\/.*[-_]s\d{2,3}([?\-]|$)/i.test(
      u,
    ) ||
    /openai\.com|cdn\.openai|anthropic\.com|claude\.ai|chatgpt|kingy\.ai/i.test(u) ||
    /unsplash\.com/i.test(u) ||
    /1x1|pixel\.gif|spacer|blank\.(jpg|png)/i.test(u)
  ) {
    return true;
  }

  return false;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Download library asset bytes to article slug folder as hero.jpg|.webp */
export async function downloadLibraryAssetToSlug(
  slug: string,
  asset: PhotoLibraryAsset,
  mediaRoot = process.env.SMARTPROTO_MEDIA_DIR || path.resolve(process.cwd(), 'public', 'media'),
): Promise<string | null> {
  try {
    const res = await fetch(asset.url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2500 || buf.length > 8 * 1024 * 1024) return null;
    const head = buf.slice(0, 256).toString('utf8');
    if (/^\s*<svg|^\s*<!DOCTYPE|^\s*<html/i.test(head)) return null;

    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
    if (!isJpeg && !isPng && !isWebp) return null;

    const ext = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
    const dir = path.join(mediaRoot, slug);
    mkdirSync(dir, { recursive: true });
    const filename = `hero.${ext}`;
    writeFileSync(path.join(dir, filename), buf);
    return `/api/media/${slug}/${filename}`;
  } catch {
    return null;
  }
}

/** Assign next library template to an article slug; persists cycle state. */
export async function assignLibraryHeroToSlug(
  slug: string,
  opts?: { avoidIds?: Iterable<string> },
): Promise<{ imageUrl: string; assetId: string; state: PhotoLibraryCycleState } | null> {
  const { asset, state } = pickNextLibraryAsset(opts);
  const imageUrl = await downloadLibraryAssetToSlug(slug, asset);
  if (!imageUrl) return null;
  writePhotoLibraryCycle(state);
  return { imageUrl, assetId: asset.id, state };
}

export function librarySize(): number {
  return PHOTO_LIBRARY.length;
}
