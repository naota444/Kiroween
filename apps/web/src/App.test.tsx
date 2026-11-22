import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('App', () => {
  it('タイトルを表示する', () => {
    expect(renderToString(<App />)).toContain('Doodle Nearby');
  });
});
