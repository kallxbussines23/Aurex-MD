export class SessionManager {
  #sessions = new Map();
  #ttl;

  constructor(ttlMs = 120_000) {
    if (!Number.isFinite(ttlMs) || ttlMs < 1) throw new TypeError('ttlMs must be positive');
    this.#ttl = ttlMs;
  }

  set(key, value) {
    this.delete(key);
    const timer = setTimeout(() => this.delete(key), this.#ttl);
    timer.unref?.();
    this.#sessions.set(key, { value, timer, expiresAt: Date.now() + this.#ttl });
    return value;
  }

  get(key) {
    const entry = this.#sessions.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.delete(key);
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

  clear() {
    for (const key of this.#sessions.keys()) this.delete(key);
  }

  get size() {
    return this.#sessions.size;
  }
}
