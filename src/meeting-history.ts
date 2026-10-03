export type MeetingRecording = {
  path: string;
  provider: string;
  duration_ms: number;
  created_at: number;
};

export type MeetingHistoryRecord = {
  id: number;
  created_at: string;
  raw_text: string;
  formatted_text: string;
  app_name: string;
  app_title: string;
  profile: string;
  duration_ms: number;
  pasted: boolean;
  path: string;
};

function providerName(provider: string) {
  if (provider.toLowerCase() === 'zoom') return 'Zoom';
  if (provider.toLowerCase() === 'meet') return 'Google Meet';
  return 'Meeting';
}

function durationLabel(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s recording saved locally` : `${remainder}s recording saved locally`;
}

export function meetingHistoryRecord(recording: MeetingRecording): MeetingHistoryRecord {
  const createdAt = recording.created_at > 0 ? recording.created_at : Date.now();
  return {
    id: createdAt,
    created_at: new Date(createdAt).toISOString(),
    raw_text: '',
    formatted_text: durationLabel(recording.duration_ms),
    app_name: providerName(recording.provider),
    app_title: providerName(recording.provider),
    profile: 'Meeting',
    duration_ms: recording.duration_ms,
    pasted: false,
    path: recording.path
  };
}

export function mergeMeetingRecordings(current: MeetingHistoryRecord[], recordings: MeetingRecording[]) {
  const byPath = new Map(current.filter(item => item.path).map(item => [item.path, item]));
  for (const recording of recordings) {
    if (!byPath.has(recording.path)) byPath.set(recording.path, meetingHistoryRecord(recording));
  }
  return [...byPath.values()].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
}

export function findMeetingRecord(items: MeetingHistoryRecord[], path: string | null) {
  if (path === null) return null;
  return items.find(item => item.path === path) ?? null;
}
