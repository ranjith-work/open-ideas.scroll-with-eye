import assert from 'node:assert/strict';
import test from 'node:test';

import { EyeScroll } from '../plugin/eye-scroll.js';

test('the plugin exposes start', () => {
  assert.equal(typeof EyeScroll.start, 'function');
});
