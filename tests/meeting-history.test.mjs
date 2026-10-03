import assert from 'node:assert/strict';
import test from 'node:test';
import { findMeetingRecord, meetingHistoryRecord, mergeMeetingRecordings } from '../src/meeting-history.ts';

const saved = (overrides = {}) => ({
  path: '/recordings/meeting-1.wav', provider: 'zoom', duration_ms: 176_555,
  created_at: Date.parse('2026-09-28T14:16:40Z'), ...overrides
});

test('turns a saved recording into a local meeting-history entry', () => {
  const entry = meetingHistoryRecord(saved());
  assert.equal(entry.app_name, 'Zoom');
  assert.equal(entry.formatted_text, '2m 57s recording saved locally');
  assert.equal(entry.path, '/recordings/meeting-1.wav');
});

test('backfills recordings without duplicating an existing path', () => {
  const existing = meetingHistoryRecord(saved());
  const merged = mergeMeetingRecordings([existing], [saved(), saved({ path: '/recordings/meeting-2.wav', created_at: existing.id + 1 })]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].path, '/recordings/meeting-2.wav');
});

test('opens the exact meeting selected from history', () => {
  const first = meetingHistoryRecord(saved());
  const second = meetingHistoryRecord(saved({ path: '/recordings/meeting-2.wav', created_at: first.id + 1 }));
  assert.equal(findMeetingRecord([first, second], second.path)?.path, second.path);
  assert.equal(findMeetingRecord([first, second], '/recordings/missing.wav'), null);
  assert.equal(findMeetingRecord([first, second], null), null);
});
