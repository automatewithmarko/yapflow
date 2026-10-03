export type PermissionId = 'microphone' | 'accessibility' | 'input_monitoring' | 'screen_recording';
export type PermissionState = Record<PermissionId, boolean>;
export type PermissionView = {
  permissions: PermissionState | null;
  current: PermissionId | null;
  started: boolean;
  error: string;
};

// A single serialized operation owns each read/request cycle. Polling, window
// focus and the fallback button cannot race or open several prompts at once.
export class PermissionFlow {
  view: PermissionView = { permissions: null, current: null, started: false, error: '' };
  private order: PermissionId[];
  private read: () => Promise<PermissionState>;
  private request: (id: PermissionId) => Promise<void>;
  private changed: (view: PermissionView) => void;
  private prompted = new Set<PermissionId>();
  private operation: Promise<void> | null = null;
  private stopped = false;

  constructor(order: PermissionId[], read: () => Promise<PermissionState>, request: (id: PermissionId) => Promise<void>, changed: (view: PermissionView) => void) {
    this.order = order; this.read = read; this.request = request; this.changed = changed;
  }

  stop() { this.stopped = true; }
  refresh() { return this.run(false); }
  next() { return this.run(true); }

  private run(manual: boolean): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.operation) {
      // Preserve a click that arrives during a background preflight.
      return manual ? this.operation.then(() => this.run(true)) : this.operation;
    }
    this.operation = this.check(manual).catch(error => {
      if (!this.stopped) {
        this.view = { ...this.view, error: String(error) };
        this.changed(this.view);
      }
    }).finally(() => { this.operation = null; });
    return this.operation;
  }

  private async check(manual: boolean) {
    const permissions = await this.read();
    if (this.stopped) return;
    const missing = this.order.filter(id => !permissions[id]);
    const started = this.view.started || manual;
    const previous = this.view.current;
    let current = previous && !permissions[previous] ? previous : null;
    let prompt: PermissionId | undefined;
    if (started && missing.length) {
      if (manual) {
        // The fallback visits the next currently disabled permission. It never
        // changes the grant state of the permission being left behind.
        prompt = missing.find(id => !this.prompted.has(id));
        if (!prompt) prompt = missing[(missing.indexOf(current!) + 1) % missing.length];
      } else if (!current) {
        prompt = missing.find(id => !this.prompted.has(id));
      }
      current = prompt ?? current ?? missing[0];
    }
    this.view = { permissions, current: missing.length ? current : null, started, error: '' };
    this.changed(this.view);
    if (prompt && !this.stopped) {
      this.prompted.add(prompt);
      await this.request(prompt);
    }
  }
}
