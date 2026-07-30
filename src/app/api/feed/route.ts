import { NextResponse } from 'next/server';

export const revalidate = 300;

const TOP_STORIES_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const ITEM_URL = 'https://hacker-news.firebaseio.com/v0/item';
const DEFAULT_LIMIT = 5;

interface HackerNewsItem {
  id: number;
  by?: string;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  time?: number;
  type?: string;
}

interface LiveSignalItem extends HackerNewsItem {
  rank: number;
  hnUrl: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      next: {
        revalidate,
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function loadTopStories(limit = DEFAULT_LIMIT): Promise<LiveSignalItem[]> {
  const storyIds = await fetchJson<number[]>(TOP_STORIES_URL);
  if (!Array.isArray(storyIds) || storyIds.length === 0) {
    return [];
  }

  const topIds = storyIds.slice(0, limit);
  const stories = await Promise.all(
    topIds.map(async (id, index) => {
      const item = await fetchJson<HackerNewsItem>(`${ITEM_URL}/${id}.json`);
      if (!item || item.type !== 'story' || !item.title) {
        return null;
      }

      return {
        ...item,
        rank: index + 1,
        hnUrl: `https://news.ycombinator.com/item?id=${item.id}`,
      } satisfies LiveSignalItem;
    }),
  );

  return stories.filter((story): story is LiveSignalItem => story !== null);
}

export async function GET() {
  const stories = await loadTopStories();
  return NextResponse.json(stories, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
