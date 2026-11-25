import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export class PluginManager {
  #directory;
  #api;
  #logger;
  #loaded = new Map();
  #disposers = new Map();

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

    const disposers = [];
    const scopedApi = {
      ...this.#api,
      commands: {
        ...this.#api.commands,
        register: (command, handler) => this.#api.commands.register(command, handler, plugin.name),
        unregisterPlugin: pluginName => this.#api.commands.unregisterPlugin(pluginName)
      },
      onMessage: handler => {
        const dispose = this.#api.onMessage(handler, plugin.name);
        if (typeof dispose === 'function') disposers.push(dispose);
        return dispose;
      }
    };

    try {
      await plugin.register(scopedApi);
      this.#loaded.set(name, plugin);
      this.#disposers.set(name, disposers);
      this.#logger.info({ name: plugin.name, version: plugin.version || '0.0.0' }, 'Plugin loaded');
      return true;
    } catch (error) {
      for (const dispose of disposers) dispose();
      this.#api.commands.unregisterPlugin(plugin.name);
      throw error;
    }
  }

  async unload(name) {
    const plugin = this.#loaded.get(name);
    if (!plugin) return false;
    try {
      await plugin.dispose?.(this.#api);
    } finally {
      for (const dispose of this.#disposers.get(name) || []) dispose();
      this.#api.commands.unregisterPlugin(plugin.name);
      this.#disposers.delete(name);
      this.#loaded.delete(name);
    }
    return true;
  }

  list() {
    return [...this.#loaded.values()].map(({ name, version }) => ({ name, version }));
  }
}
