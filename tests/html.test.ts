import { describe, expect, test } from 'vitest';
import { cleanHtml } from '../server/html.ts';

describe('rich text', () => {
  test('an image keeps its width and aspect ratio, nothing else', () => {
    const { html, imageIds } = cleanHtml(
      '<img src="/api/attachments/7" alt="a" width="320" style="aspect-ratio: 480 / 200; position: fixed" onerror="x()">',
    );
    expect(html).toBe('<img src="/api/attachments/7" alt="a" style="aspect-ratio:480 / 200" width="320" />');
    expect(imageIds).toEqual([7]);
    expect(cleanHtml('<img src="/api/attachments/7" width="100%">').html).toBe('<img src="/api/attachments/7" />');
    expect(cleanHtml('<p>x</p><img src="https://evil.example/p.png">').html).toBe('<p>x</p>');
  });
});
