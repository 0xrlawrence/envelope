import { existsSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import { dirname, join, resolve } from "node:path";

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

/** Never worth walking into when looking for configuration. */
const SKIP = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
  ".next",
  ".git",
]);

function envFilesIn(directory: string): string[] {
  return DEFAULT_ENV_FILES.map((name) => join(directory, name)).filter((path) =>
    existsSync(path),
  );
}

/**
 * Find the env file without being told where it is.
 *
 * Three places, in decreasing order of how obviously they are meant:
 *
 * 1. The directory you are standing in.
 * 2. Its parents, up to the repository root. This is the monorepo case, where
 *    the file is at the top and the command is run from inside a package.
 * 3. One level down. This is the other monorepo case, and the one that made
 *    this necessary: the file lives in `web/` because a framework put it there,
 *    and the command is run from the root above it.
 *
 * The downward step is the only one that could surprise anyone, so it is kept
 * narrow. One level, never into build output or dependencies, and if more than
 * one candidate turns up it refuses and names them instead of picking. Choosing
 * between two files that each hold a signing key is not a guess worth making on
 * somebody's behalf.
 */
export function findEnvFiles(from: string = process.cwd()): string[] {
  const here = envFilesIn(from);
  if (here.length) return here;

  let directory = from;
  while (true) {
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
    const found = envFilesIn(directory);
    if (found.length) return found;
    // A repository root is as far up as configuration for this project can
    // reasonably live; past it is somebody else's machine.
    if (existsSync(join(directory, ".git"))) break;
  }

  const below: string[][] = [];
  let entries: Dirent[] = [];
  try {
    entries = readdirSync(from, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || SKIP.has(entry.name)) {
      continue;
    }
    const found = envFilesIn(join(from, entry.name));
    if (found.length) below.push(found);
  }

  if (below.length === 1) return below[0]!;
  if (below.length > 1) {
    throw new Error(
      [
        `Found more than one env file below this directory and will not choose between them:`,
        ...below.map((group) => `  ${group[0]}`),
        "",
        "Name the one you mean: envelope <command> --env path/to/.env.local",
      ].join("\n"),
    );
  }
  return [];
}

/**
 * Load a dotenv file into the environment, if there is one.
 *
 * The real environment always wins. A key exported in the shell, or injected by
 * whatever runs an agent, is the more deliberate of the two and must not be
 * quietly replaced by a file left in a working directory.
 *
 * Returns the paths it actually read, so the caller can say where the values
 * came from rather than leaving it a mystery which key is being signed with.
 */
export function loadEnvFiles(explicit?: string): string[] {
  const paths = explicit ? [resolve(process.cwd(), explicit)] : findEnvFiles();
  const loaded: string[] = [];

  for (const path of paths) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      // Naming a file that is not there is a mistake worth reporting; not
      // having one at all is the normal case.
      if (explicit) throw new Error(`No env file at ${path}.`);
      continue;
    }
    for (const [name, value] of Object.entries(parseEnvFile(text))) {
      if (process.env[name] === undefined) process.env[name] = value;
    }
    loaded.push(path);
  }

  return loaded;
}
