import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NameTag } from './name-tag.js';

describe('NameTag', () => {
  it('aria-label は "color icon" の形式になる', () => {
    const html = renderToString(<NameTag identity={{ color: 'red', icon: 'cat' }} />);
    expect(html).toContain('aria-label="red cat"');
  });

  it('role="img" が付いている', () => {
    const html = renderToString(<NameTag identity={{ color: 'blue', icon: 'dog' }} />);
    expect(html).toContain('role="img"');
  });

  it('絵文字が含まれる', () => {
    const html = renderToString(<NameTag identity={{ color: 'green', icon: 'frog' }} />);
    // 🐸
    expect(html).toContain('\uD83D\uDC38');
  });
});
