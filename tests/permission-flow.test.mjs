import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlow } from '../src/permission-flow.ts';

const order = ['microphone', 'accessibility', 'input_monitoring', 'screen_recording'];
function fixture(initial, ids = order) {
  const state = { ...initial };
  const prompts = [];
  const flow = new PermissionFlow(ids, async () => ({ ...state }), async id => { prompts.push(id); }, () => {});
  return { state, prompts, flow };
}
test('existing grants are recognized on launch and never requested', async () => {
  const { flow, prompts } = fixture({ microphone: true, accessibility: true, input_monitoring: true, screen_recording: true });
  await flow.refresh(); await flow.next(); await flow.refresh();
  assert.deepEqual(prompts, []);
  assert.equal(flow.view.current, null);
  assert.ok(Object.values(flow.view.permissions).every(Boolean));
});
test('only missing permission is requested; detecting its grant completes the step', async () => {
  const { state, flow, prompts } = fixture({ microphone: true, accessibility: false, input_monitoring: true, screen_recording: true });
  await flow.next();
  assert.deepEqual(prompts, ['accessibility']);
  state.accessibility = true;
  await flow.refresh();
  assert.equal(flow.view.current, null);
  assert.deepEqual(prompts, ['accessibility']);
});
test('permissions are requested sequentially as native grants change', async () => {
  const { state, flow, prompts } = fixture({ microphone: false, accessibility: false, input_monitoring: false, screen_recording: false });
  await flow.next(); await flow.refresh();
  assert.deepEqual(prompts, ['microphone']);
  state.microphone = true; await flow.refresh();
  assert.deepEqual(prompts, ['microphone', 'accessibility']);
  state.accessibility = true; await flow.refresh();
  assert.deepEqual(prompts, order.slice(0, 3));
  state.input_monitoring = true; await flow.refresh();
  assert.deepEqual(prompts, order);
  state.screen_recording = true; await flow.refresh();
  assert.equal(flow.view.current, null);
});
test('fallback advances but cannot mark an ungranted permission enabled', async () => {
  const { flow, prompts } = fixture({ microphone: false, accessibility: false, input_monitoring: true, screen_recording: true });
  await flow.next(); await flow.next();
  assert.deepEqual(prompts, ['microphone', 'accessibility']);
  assert.equal(flow.view.permissions.microphone, false);
  assert.equal(flow.view.permissions.accessibility, false);
  await flow.next();
  assert.equal(prompts.at(-1), 'microphone');
});
test('fallback rechecks all grants before picking its next disabled permission', async () => {
  const { flow, prompts, state } = fixture({ microphone: false, accessibility: false, input_monitoring: false, screen_recording: true });
  await flow.next(); state.microphone = true; state.accessibility = true;
  await flow.next();
  assert.deepEqual(prompts, ['microphone', 'input_monitoring']);
});
test('Windows never requests macOS-only permissions', async () => {
  const { flow, prompts } = fixture({ microphone: true, accessibility: false, input_monitoring: false, screen_recording: false }, ['microphone']);
  await flow.next();
  assert.deepEqual(prompts, []);
  assert.equal(flow.view.current, null);
});
test('polling and a click cannot overlap checks or lose the click', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let active = 0; let maxActive = 0;
  const prompts = [];
  const flow = new PermissionFlow(order, async () => {
    maxActive = Math.max(maxActive, ++active); await gate; active--;
    return { microphone: true, accessibility: false, input_monitoring: true, screen_recording: true };
  }, async id => { prompts.push(id); }, () => {});
  const first = flow.refresh(); const click = flow.next(); const poll = flow.refresh();
  release(); await Promise.all([first, click, poll]);
  assert.equal(maxActive, 1); assert.deepEqual(prompts, ['accessibility']);
});
test('preflight errors do not turn unknown permissions into grants or issue prompts', async () => {
  const prompts = [];
  const flow = new PermissionFlow(order, async () => { throw new Error('native check failed'); }, async id => { prompts.push(id); }, () => {});
  await flow.next();
  assert.match(flow.view.error, /native check failed/);
  assert.equal(flow.view.permissions, null); assert.deepEqual(prompts, []);
});
