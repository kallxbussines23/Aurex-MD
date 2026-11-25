export function parseCommand(text, prefix = '.') {
  if (typeof text !== 'string' || !text.startsWith(prefix)) return null;
  const body = text.slice(prefix.length).trim();
  if (!body) return null;
  const [name, ...args] = body.split(/\\s+/);
  return { name: name.toLowerCase(), args, raw: body };
}

export class CommandHandler {
  #commands = new Map();
  #prefix;

  constructor(prefix = '.') {
    this.#prefix = prefix;
  }

  register(command, handler, pluginName = 'unknown') {
    const name = command.toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(name)) throw new Error(`Invalid command: ${command}`);
    if (this.#commands.has(name)) throw new Error(`Command already registered: ${name}`);
    this.#commands.set(name, { handler, pluginName });
  }

  unregisterPlugin(pluginName) {
    for (const [name, entry] of this.#commands) {
      if (entry.pluginName === pluginName) this.#commands.delete(name);
    }
  }

  async dispatch(context) {
    const parsed = parseCommand(context.text, this.#prefix);
    if (!parsed) return false;
    const entry = this.#commands.get(parsed.name);
    if (!entry) return false;
    await entry.handler({ ...context, ...parsed });
    return true;
  }

  list() {
    return [...this.#commands.keys()].sort();
  }
}
