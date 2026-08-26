// @ts-check

/** @typedef {Record<string, string | true | Array<string | true>>} CliFlags */

/**
 * @param {string[]} argv
 * @returns {{ args: string[], flags: CliFlags }}
 */
export function parseArgs(argv) {
  /** @type {CliFlags} */
  const flags = {};
  /** @type {string[]} */
  const args = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      args.push(...argv.slice(index + 1));
      break;
    }
    if (!arg.startsWith("-")) {
      args.push(arg);
      continue;
    }
    const withoutPrefix = arg.replace(/^--?/, "");
    const [rawKey, inlineValue] = withoutPrefix.split("=");
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (inlineValue !== undefined) {
      setFlag(flags, key, inlineValue);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("-")) {
      setFlag(flags, key, next);
      index += 1;
    } else {
      setFlag(flags, key, true);
    }
  }
  return { args, flags };
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function parseCsvFlag(value) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => String(item).split(",").map((entry) => entry.trim()).filter(Boolean));
}

/**
 * @param {CliFlags} flags
 * @param {string} key
 * @param {string | true} value
 */
export function setFlag(flags, key, value) {
  if (flags[key] === undefined) {
    flags[key] = value;
    return;
  }
  flags[key] = Array.isArray(flags[key]) ? [.../** @type {Array<string | true>} */ (flags[key]), value] : [/** @type {string | true} */ (flags[key]), value];
}

/**
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
export function parseInputFlags(value) {
  const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
  /** @type {Record<string, string>} */
  const inputs = {};
  for (const item of values) {
    const text = String(item);
    const separator = text.indexOf("=");
    if (separator === -1) throw new Error(`Invalid --input "${text}". Expected KEY=VALUE.`);
    inputs[text.slice(0, separator)] = text.slice(separator + 1);
  }
  return inputs;
}
