/**
 * Bianchi gallery slides helper — only activates with ≥2 media.
 * Run: npx tsx scripts/test-spa-gallery-slides.ts
 */
import assert from 'node:assert/strict';
import { getArticleMediaSlides } from '../src/lib/article-media';

{
  const one = getArticleMediaSlides({
    title: 'One',
    imageUrl: '/api/media/x/hero.jpg',
  });
  assert.equal(one.length, 1);
}

{
  const multi = getArticleMediaSlides({
    title: 'Multi',
    images: [
      { url: '/api/media/x/hero.jpg', role: 'hero' },
      { url: '/api/media/x/secondary.png', role: 'secondary' },
      { url: '/api/media/x/detail.jpg', role: 'detail' },
    ],
  });
  assert.equal(multi.length, 3);
  assert.equal(multi[0].url.endsWith('hero.jpg'), true);
}

{
  const fs = require('fs');
  const path = require('path');
  const gallery = fs.readFileSync(
    path.resolve(__dirname, '../src/components/article-gallery.tsx'),
    'utf8',
  );
  assert.match(gallery, /export function ArticleGallery/);
  assert.match(gallery, /swapSlides/);
  assert.match(gallery, /useFlipAnimation/);
  assert.match(gallery, /if \(total <= 1/);
}

console.log('Bianchi gallery slide contract OK');
