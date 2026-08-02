/**
 * Persisted round-robin topic rotation for autonomous newsroom ticks.
 * State file: data/topic-rotation.json (committed by GHA so ticks don't reset to 0).
 */
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { DESKS, getDesk, type Desk, type DeskId } from './desks';

export const TOPIC_ROTATION_FILENAME = 'topic-rotation.json';

export interface TopicRotationState {
  version: 1;
  /** Index into DESKS — next desk to try at tick start */
  index: number;
  lastDeskId: DeskId | null;
  lastPublishedDeskId: DeskId | null;
  lastTickAt: string | null;
  /** Desks skipped this tick (empty / no good candidate) before advance */
  lastSkipped: DeskId[];
}

const DEFAULT_STATE: TopicRotationState = {
  version: 1,
  index: 0,
  lastDeskId: null,
  lastPublishedDeskId: null,
  lastTickAt: null,
  lastSkipped: [],
};

export function defaultRotationPath(cwd = process.cwd()): string {
  return path.resolve(cwd, 'data', TOPIC_ROTATION_FILENAME);
}

function clampIndex(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n) % DESKS.length;
}

export function normalizeState(raw: unknown): TopicRotationState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE };
  const o = raw as Partial<TopicRotationState>;
  return {
    version: 1,
    index: clampIndex(typeof o.index === 'number' ? o.index : 0),
    lastDeskId: typeof o.lastDeskId === 'string' ? (o.lastDeskId as DeskId) : null,
    lastPublishedDeskId:
      typeof o.lastPublishedDeskId === 'string' ? (o.lastPublishedDeskId as DeskId) : null,
    lastTickAt: typeof o.lastTickAt === 'string' ? o.lastTickAt : null,
    lastSkipped: Array.isArray(o.lastSkipped)
      ? o.lastSkipped.filter((x): x is DeskId => typeof x === 'string')
      : [],
  };
}

export async function loadTopicRotation(filePath?: string): Promise<TopicRotationState> {
  const p = filePath || defaultRotationPath();
  try {
    const raw = await readFile(p, 'utf8');
    return normalizeState(JSON.parse(raw.replace(/^\uFEFF/, '')));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveTopicRotation(
  state: TopicRotationState,
  filePath?: string,
): Promise<void> {
  const p = filePath || defaultRotationPath();
  await mkdir(path.dirname(p), { recursive: true });
  const next = normalizeState(state);
  await writeFile(p, JSON.stringify(next, null, 2) + '\n', 'utf8');
}

/** Current desk at cursor (does not advance). */
export function nextTopic(state: TopicRotationState): Desk {
  const s = normalizeState(state);
  return DESKS[s.index] ?? DESKS[0];
}

/** Ordered desk queue starting at cursor (full round). */
export function topicQueueFrom(state: TopicRotationState): Desk[] {
  const s = normalizeState(state);
  const out: Desk[] = [];
  for (let i = 0; i < DESKS.length; i++) {
    out.push(DESKS[(s.index + i) % DESKS.length]!);
  }
  return out;
}

/**
 * After a tick: advance past the desk we published from,
 * or past the starting desk if nothing published (so we don't stall on empty desks).
 */
export function advanceAfterTick(
  state: TopicRotationState,
  opts: {
    startedAtIndex: number;
    publishedDeskId: DeskId | null;
    skipped: DeskId[];
  },
): TopicRotationState {
  const publishedIdx =
    opts.publishedDeskId != null
      ? DESKS.findIndex((d) => d.id === opts.publishedDeskId)
      : -1;
  const base = publishedIdx >= 0 ? publishedIdx : clampIndex(opts.startedAtIndex);
  const nextIndex = (base + 1) % DESKS.length;
  return {
    version: 1,
    index: nextIndex,
    lastDeskId: opts.publishedDeskId ?? nextTopic({ ...state, index: opts.startedAtIndex }).id,
    lastPublishedDeskId: opts.publishedDeskId,
    lastTickAt: new Date().toISOString(),
    lastSkipped: opts.skipped,
  };
}

export function deskById(id: DeskId): Desk {
  return getDesk(id);
}

export { DESKS, type Desk, type DeskId };
