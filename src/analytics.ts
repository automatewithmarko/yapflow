export type UsageCategory = 'Coding' | 'Meetings' | 'Messaging' | 'Email' | 'Documents' | 'AI';

export type AnalyticsHistoryItem = {
  raw_text?: string;
  formatted_text?: string;
  app_name?: string;
  app_title?: string;
  profile?: string;
  duration_ms?: number;
  created_at: string;
};

export const usageCategoryOrder: UsageCategory[] = ['Coding', 'Meetings', 'Messaging', 'Email', 'Documents', 'AI'];

export function countWords(text = ''): number {
  if (!text.trim()) return 0;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    return Array.from(segmenter.segment(text)).filter(segment => segment.isWordLike).length;
  }
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length || 0;
}

export function usageCategory(item: AnalyticsHistoryItem): UsageCategory | null {
  const app = (item.app_name || '').toLowerCase();
  const title = (item.app_title || '').toLowerCase();
  const profile = (item.profile || '').toLowerCase();
  const context = `${app} ${title}`;

  if (['zoom meeting', 'zoom webinar', 'google meet', 'meet.google.com', 'teams meeting']
    .some(value => context.includes(value))) return 'Meetings';

  // Coding agents belong to Coding even though their names also match an AI product.
  if (profile === 'code' || ['claude code', 'codex', 'cursor', 'windsurf', 'visual studio code', 'vs code',
    'vscode', 'xcode', 'lovable', 'replit', 'bolt.new', 'v0.dev', 'base44', 'zed', 'terminal', 'iterm']
    .some(value => context.includes(value))) return 'Coding';

  if (['chatgpt', 'chat gpt', 'chad gpt', 'claude', 'perplexity', 'gemini', 'copilot', 'grok', 'deepseek',
    'qwen', 'quinn', 'kimi', 'kimmy', 'mistral', 'le chat', 'character.ai', 'poe', 'you.com']
    .some(value => context.includes(value))) return 'AI';

  if (profile === 'message' || ['slack', 'discord', 'messages', 'whatsapp', 'telegram', 'messenger', 'signal']
    .some(value => context.includes(value))) return 'Messaging';
  if (profile === 'email' || ['gmail', 'outlook', 'thunderbird', 'superhuman', 'hey mail', 'apple mail']
    .some(value => context.includes(value)) || app === 'mail') return 'Email';
  if (profile === 'document' || ['google docs', 'microsoft word', 'pages', 'notion', 'obsidian', 'craft',
    'google sheets', 'microsoft excel', 'google slides', 'powerpoint']
    .some(value => context.includes(value))) return 'Documents';
  return null;
}

export function dashboardStats(items: AnalyticsHistoryItem[], now = Date.now()) {
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  const recent = items.filter(item => {
    const timestamp = Date.parse(item.created_at);
    return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now;
  });
  const wordCounts = recent.map(item => countWords(item.raw_text || item.formatted_text || ''));
  const wordsSpoken = wordCounts.reduce((sum, words) => sum + words, 0);
  const durationMs = recent.reduce((sum, item, index) => sum + (wordCounts[index] > 0 && Number(item.duration_ms) > 0 ? Number(item.duration_ms) : 0), 0);
  const wordsPerMinute = durationMs > 0 ? Math.round(wordsSpoken / (durationMs / 60_000)) : null;
  const categoryWords = Object.fromEntries(usageCategoryOrder.map(category => [category, 0])) as Record<UsageCategory, number>;
  recent.forEach((item, index) => {
    const category = usageCategory(item);
    if (category) categoryWords[category] += wordCounts[index];
  });
  const categorizedWords = Object.values(categoryWords).reduce((sum, words) => sum + words, 0);
  const percentages = Object.fromEntries(usageCategoryOrder.map(category => [
    category,
    categorizedWords > 0 ? Math.round(categoryWords[category] / categorizedWords * 100) : 0
  ])) as Record<UsageCategory, number>;
  return { recent, wordsSpoken, wordsPerMinute, categoryWords, percentages };
}
