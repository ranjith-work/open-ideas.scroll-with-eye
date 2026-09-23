import assert from 'node:assert/strict';
import test from 'node:test';

import { sectionAtPoint, sectionLabel } from '../plugin/sections.js';

const page = { id: 'Page body', left: 0, top: 0, right: 800, bottom: 2000 };
const row = { id: 'Card row', left: 100, top: 400, right: 700, bottom: 600 };
const board = { id: '', left: 100, top: 900, right: 500, bottom: 1200 };

test('a point outside every section selects nothing', () => {
  assert.equal(sectionAtPoint(50, 50, [row, board]), null);
  assert.equal(sectionLabel(null), 'Page');
});

test('a point inside a section returns that section', () => {
  const hit = sectionAtPoint(200, 500, [row, board]);
  assert.equal(hit, row);
  assert.equal(sectionLabel(hit), 'Card row');
});

test('edges count as inside', () => {
  assert.equal(sectionAtPoint(100, 400, [row]), row);
  assert.equal(sectionAtPoint(700, 600, [row]), row);
});

test('the smaller overlapping section wins', () => {
  const hit = sectionAtPoint(200, 500, [page, row]);
  assert.equal(hit, row);
});

test('a later section wins when areas match', () => {
  const first = { id: 'A', left: 0, top: 0, right: 100, bottom: 100 };
  const second = { id: 'B', left: 0, top: 0, right: 100, bottom: 100 };
  assert.equal(sectionAtPoint(10, 10, [first, second]), second);
});

test('an unnamed section is labeled Section', () => {
  assert.equal(sectionLabel(board), 'Section');
});
