import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { INITIAL_STATE } from '../state/app-state.js';
import { EntryScreen } from './entry-screen.js';

const noop = vi.fn();

describe('EntryScreen', () => {
  it('location:unavailable のときテンキーと作成ボタンが出る', () => {
    const html = renderToString(
      <EntryScreen
        location={{ status: 'unavailable' }}
        rooms={null}
        entry={INITIAL_STATE.entry}
        onAction={noop}
        onSendMessage={noop}
      />,
    );
    // テンキーの数字ボタンが出ている
    expect(html).toContain('>1<');
    // Create a new room ボタンが出ている
    expect(html).toContain('Create a new room');
  });

  it("rooms が空配列のとき 'No rooms nearby yet.' が出る", () => {
    const html = renderToString(
      <EntryScreen
        location={{ status: 'ready', geohash: 'xn76ur' }}
        rooms={[]}
        entry={INITIAL_STATE.entry}
        onAction={noop}
        onSendMessage={noop}
      />,
    );
    expect(html).toContain('No rooms nearby yet.');
  });

  it('entry.error があればエラー文言が出る', () => {
    const html = renderToString(
      <EntryScreen
        location={{ status: 'pending' }}
        rooms={null}
        entry={{ ...INITIAL_STATE.entry, error: 'Something went wrong. Please try again.' }}
        onAction={noop}
        onSendMessage={noop}
      />,
    );
    expect(html).toContain('Something went wrong. Please try again.');
  });

  it("location:pending のとき 'Finding rooms near you' が出る", () => {
    const html = renderToString(
      <EntryScreen
        location={{ status: 'pending' }}
        rooms={null}
        entry={INITIAL_STATE.entry}
        onAction={noop}
        onSendMessage={noop}
      />,
    );
    expect(html).toContain('Finding rooms near you');
  });

  it('HTML に input / textarea / contenteditable が含まれない', () => {
    const html = renderToString(
      <EntryScreen
        location={{ status: 'unavailable' }}
        rooms={null}
        entry={INITIAL_STATE.entry}
        onAction={noop}
        onSendMessage={noop}
      />,
    );
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('contenteditable');
  });
});
