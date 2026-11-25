export class SessionManager {
  #sessions = new Map();
  #ttl;

  constructor(ttlMs = 120_000) {
    if (!Number.isFinite(ttlMs) || ttlMs < 1) throw new TypeError('ttlMs must be positive');
    this.#ttl = ttlMs;
  }

  set(key, value, onExpire) {
    this.delete(key);
    const timer = setTimeout(() => {
      const entry = this.#sessions.get(key);
      if (!entry) return;
      this.#sessions.delete(key);
      Promise.resolve(entry.onExpire?.()).catch(() => {});
    }, this.#ttl);
    timer.unref?.();
    this.#sessions.set(key, { value, timer, onExpire, expiresAt: Date.now() + this.#ttl });
    return value;
  }

  get(key) {
    const entry = this.#sessions.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.delete(key);
      Promise.resolve(entry.onExpire?.()).catch(() => {});
      return undefined;
    }
    return entry.value;
  }

  delete(key) {
    const entry = this.#sessions.get(key);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.#sessions.delete(key);
    return true;
  }

  async clear() {
    const cleanups = [];
    for (const [key, entry] of this.#sessions) {
      this.delete(key);
      if (entry.onExpire) cleanups.push(Promise.resolve().then(() => entry.onExpire()));
    }
    await Promise.allSettled(cleanups);
  }

  get size() {
    return this.#sessions.size;
  }
}
