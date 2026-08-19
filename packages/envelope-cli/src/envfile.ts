import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Read variables out of a dotenv file.
 *
 * A CLI reads `process.env` and nothing else, so a key written into a file is
 * invisible to it: `export FOO=bar` sitting in `.env.local` is a line of text
 * that was never run by a shell. Next.js reads those files itself, which is
 * exactly why someone who has been editing `web/.env.local` all week expects
 * every other tool in the repo to do the same.
 *
 * Written here rather than pulled in, because the whole grammar is four rules
 * and this package should not add a dependency to a process that holds a
 * signing key.
 */
export function parseEnvFile(text: string): Record<string, string> {
  const found: Record<string, string> = {};

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    // `export FOO=bar` is what people paste, because that is what a shell
    // wants. It is not part of the format, and it is not a reason to refuse.
    const body = line.startsWith("export ") ? line.slice(7).trim() : line;
    const split = body.indexOf("=");
    if (split < 1) continue;

    const name = body.slice(0, split).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;

    let value = body.slice(split + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1);
    } else {
      // An unquoted value ends at a comment. A quoted one does not, because a
      // `#` inside quotes is a character someone meant to include.
      const comment = value.indexOf(" #");
      if (comment >= 0) value = value.slice(0, comment).trim();
    }
    found[name] = value;
  }

  return found;
}

/** Files looked at when none was named, in the order Next.js reads them. */
export const DEFAULT_ENV_FILES = [".env.local", ".env"] as const;

/**
 * Load a dotenv file into the environment, if there is one.
 *
 * The real environment always wins. A key exported in the shell, or injected by
 * whatever runs an agent, is the more deliberate of the two and must not be
 * quietly replaced by a file left in a working directory.
 *
 * Returns the paths it actually read, so the caller can say where it looked
 * when something is still missing.
 */
export function loadEnvFiles(explicit?: string): string[] {
  const candidates = explicit ? [explicit] : [...DEFAULT_ENV_FILES];
  const loaded: string[] = [];

  for (const candidate of candidates) {
    const path = resolve(process.cwd(), candidate);
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      // Naming a file that is not there is a mistake worth reporting; not
      // having a `.env` is the normal case.
      if (explicit) {
        throw new Error(`No env file at ${path}.`);
      }
      continue;
    }
    for (const [name, value] of Object.entries(parseEnvFile(text))) {
      if (process.env[name] === undefined) process.env[name] = value;
    }
    loaded.push(path);
  }

  return loaded;
}
