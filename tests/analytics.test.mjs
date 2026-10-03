import assert from 'node:assert/strict';
import test from 'node:test';
import { countWords, dashboardStats, usageCategory } from '../src/analytics.ts';

const now = Date.parse('2026-09-28T12:00:00Z');
const session = (overrides = {}) => ({
  raw_text: 'one two three four', formatted_text: 'One two three four.', app_name: 'Google Chrome',
  app_title: 'ChatGPT', profile: 'Natural', duration_ms: 2000, created_at: '2026-09-28T11:00:00Z', ...overrides
});

test('counts words and computes a duration-weighted rolling 30-day WPM', () => {
  const stats = dashboardStats([
    session(),
    session({ raw_text: 'five six', duration_ms: 1000 }),
    session({ raw_text: 'too old to count', created_at: '2026-08-01T00:00:00Z' })
  ], now);
  assert.equal(stats.wordsSpoken, 6);
  assert.equal(stats.wordsPerMinute, 120);
});

test('recognizes multilingual words', () => {
  assert.equal(countWords('Hello, world!'), 2);
  assert.ok(countWords('你好世界') >= 2);
});

test('classifies AI separately while keeping coding agents in Coding', () => {
  assert.equal(usageCategory(session({ app_title: 'Claude' })), 'AI');
  assert.equal(usageCategory(session({ app_name: 'Terminal', app_title: 'Claude Code' })), 'Coding');
  assert.equal(usageCategory(session({ app_name: 'Cursor', app_title: 'ChatGPT extension' })), 'Coding');
  assert.equal(usageCategory(session({ app_title: 'Perplexity' })), 'AI');
});

test('usage percentages are based on words dictated in recognized categories', () => {
  const stats = dashboardStats([
    session({ raw_text: 'one two three', app_title: 'ChatGPT' }),
    session({ raw_text: 'one', app_name: 'Mail', app_title: 'Inbox', profile: 'Email' })
  ], now);
  assert.equal(stats.percentages.AI, 75);
  assert.equal(stats.percentages.Email, 25);
});
