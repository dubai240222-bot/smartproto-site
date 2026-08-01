import { extractArticleImage } from './image-extractor';

const HN_API_BASE_URL = 'https://hacker-news.firebaseio.com/v0';
const TOP_STORIES_URL = `${HN_API_BASE_URL}/topstories.json`;
const ITEM_URL = `${HN_API_BASE_URL}/item`;

export interface HackerNewsApiItem {
  id: number;
  type?: string;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
}

export interface HackerNewsStory {
  id: string;
  title: string;
  url: string;
  text: string | undefined;
  score: number;
  imageUrl?: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
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

function toStory(item: HackerNewsApiItem): HackerNewsStory | null {
  if (item.type !== 'story' || !item.title) {
    return null;
  }

  return {
    id: String(item.id),
    title: item.title,
    url: item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
    text: item.text,
    score: typeof item.score === 'number' ? item.score : 0,
  };
}

export async function fetchHackerNewsTopStories(limit: number = 10): Promise<HackerNewsStory[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 10;
  const storyIds = await fetchJson<number[]>(TOP_STORIES_URL);

  if (!Array.isArray(storyIds) || storyIds.length === 0 || safeLimit === 0) {
    return [];
  }

  const topIds = storyIds.slice(0, safeLimit);
  const stories = await Promise.all(
    topIds.map(async (id) => {
      const item = await fetchJson<HackerNewsApiItem>(`${ITEM_URL}/${id}.json`);
      if (!item) return null;
      const story = toStory(item);
      if (!story) return null;

      if (story.url && !story.url.includes('news.ycombinator.com/item?id=')) {
        try {
          const img = await extractArticleImage(story.url);
          if (img) {
            story.imageUrl = img;
          }
        } catch {
          // Graceful fallback to null
        }
      }

      return story;
    }),
  );

  return stories.filter((story): story is HackerNewsStory => story !== null);
}
