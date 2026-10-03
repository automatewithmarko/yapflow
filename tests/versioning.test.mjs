import assert from 'node:assert/strict';
import test from 'node:test';
import { isNewerVersion } from '../src/versioning.ts';

test('recognizes newer semantic versions without flagging equal or older builds', () => {
  assert.equal(isNewerVersion('0.1.1', '0.1.0'), true);
  assert.equal(isNewerVersion('0.2.0', '0.1.9'), true);
  assert.equal(isNewerVersion('1.0.0', '0.99.99'), true);
  assert.equal(isNewerVersion('v0.1.0', '0.1.0'), false);
  assert.equal(isNewerVersion('0.0.9', '0.1.0'), false);
});
