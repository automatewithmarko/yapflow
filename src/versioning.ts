export function isNewerVersion(candidate: string, current: string) {
  const parts = (value: string) => value.replace(/^v/, '').split('.').map(part => Number.parseInt(part, 10) || 0);
  const next = parts(candidate); const installed = parts(current);
  for (let index = 0; index < Math.max(next.length, installed.length); index += 1) {
    if ((next[index] || 0) !== (installed[index] || 0)) return (next[index] || 0) > (installed[index] || 0);
  }
  return false;
}
