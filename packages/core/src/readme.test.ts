import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MESSAGE_SPECS } from './message-specs.js';

// Requirements 2.13, 2.14: README の表と MESSAGE_SPECS の対応を確かめる。

type Row = { direction: string; fields: string[] };

function parseReadmeTable(markdown: string): Map<string, Row> {
  const rows = new Map<string, Row>();
  let inTable = false;
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      inTable = false;
      continue;
    }
    const cells = trimmed
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    if (cells[0] === 'Type' && cells[1] === 'Direction' && cells[2] === 'Fields') {
      inTable = true;
      continue;
    }
    if (!inTable || cells.every((c) => /^:?-+:?$/.test(c))) continue;
    const [type, direction, fields] = cells;
    if (type === undefined || direction === undefined || fields === undefined) continue;
    rows.set(type, {
      direction,
      fields: fields
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f !== ''),
    });
  }
  return rows;
}

const readmePath = fileURLToPath(new URL('../README.md', import.meta.url));
const table = parseReadmeTable(readFileSync(readmePath, 'utf8'));

describe('packages/core/README.md message table', () => {
  it('has a parsed table', () => {
    expect(table.size).toBeGreaterThan(0);
  });

  it.each(MESSAGE_SPECS.map((s) => [s.typeName, s] as const))(
    '%s matches MESSAGE_SPECS',
    (typeName, spec) => {
      const row = table.get(typeName);
      expect(row, `README table has no row for type "${typeName}"`).toBeDefined();
      if (!row) return;
      expect(row.direction, `direction of "${typeName}" in README`).toBe(spec.direction);
      const missing = spec.fields.filter((f) => !row.fields.includes(f));
      expect(missing, `README row "${typeName}" is missing fields: ${missing.join(', ')}`).toEqual(
        [],
      );
    },
  );

  it('has no types that are missing from MESSAGE_SPECS', () => {
    const known = new Set(MESSAGE_SPECS.map((s) => s.typeName));
    const extra = [...table.keys()].filter((t) => !known.has(t));
    expect(extra, `README lists types not in MESSAGE_SPECS: ${extra.join(', ')}`).toEqual([]);
  });
});
