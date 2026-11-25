import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export class PluginManager {
  #directory;
  #api;
  #logger;
  #loaded = new Map();

  constructor({ directory, api, logger }) {
    this.#directory = directory;
    this.#api = api;
    this.#logger = logger;
  }

  async loadAll() {
    await fs.mkdir(this.#directory, { recursive: true });
    const entries = await fs.readdir(this.#directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        await this.load(entry.name);
      } catch (error) {
        this.#logger.error({ plugin: entry.name, err: error }, 'Plugin failed to load');
      }
    }
    return this.#loaded.size;
  }

  async load(name) {
    if (this.#loaded.has(name)) return false;
    const entryPath = path.join(this.#directory, name, 'index.js');
    const stat = await fs.stat(entryPath);
    if (!stat.isFile()) throw new Error(`Plugin entry is not a file: ${entryPath}`);
    const moduleUrl = pathToFileURL(entryPath);
    moduleUrl.searchParams.set('loadedAt', String(Date.now()));
    const imported = await import(moduleUrl.href);
    const plugin = imported.default;
    if (!plugin || typeof plugin.register !== 'function' || !plugin.name) {
      throw new Error(`Invalid plugin manifest: ${name}`);
    }
    await plugin.register(this.#api);
    this.#loaded.set(name, plugin);
    this.#logger.info({ name: plugin.name, version: plugin.version || '0.0.0' }, 'Plugin loaded');
    return true;
  }

  async unload(name) {
    const plugin = this.#loaded.get(name);
    if (!plugin) return false;
    try {
      await plugin.dispose?.(this.#api);
    } finally {
      this.#api.commands.unregisterPlugin(plugin.name);
      this.#loaded.delete(name);
    }
    return true;
  }

  list() {
    return [...this.#loaded.values()].map(({ name, version }) => ({ name, version }));
  }
}
