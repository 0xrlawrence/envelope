/**
 * Just enough syntax colouring for the three languages this site shows.
 *
 * Not a general highlighter and not trying to be. The agent page carries shell
 * commands, one JSON response and one TypeScript snippet, and pulling in a real
 * grammar engine for that would cost more to ship than the page it decorates.
 *
 * Tokens come back as data rather than as markup. Everything here is rendered
 * through React elements, so no string of code is ever interpolated into HTML
 * and there is nothing to escape: a snippet containing a tag is text, not an
 * element, by construction rather than by remembering to sanitise it.
 */
export type TokenKind =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "flag"
  | "command"
  | "property"
  | "punctuation";

export interface Token {
  readonly text: string;
  readonly kind: TokenKind;
}

export type Language = "shell" | "json" | "ts";

/**
 * One expression per language, alternatives ordered so the greedy cases win.
 *
 * Scanning with a single sticky regex is what keeps this honest: every token is
 * matched against the same cursor, so a `#` inside a string cannot start a
 * comment and a keyword cannot be found inside an identifier. Anything that
 * matches nothing is emitted as plain text rather than dropped.
 */
const GRAMMARS: Record<Language, RegExp> = {
  shell: new RegExp(
    [
      "(?<comment>#[^\\n]*)",
      "(?<string>\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*')",
      "(?<flag>(?<=\\s)--?[A-Za-z][\\w-]*)",
      "(?<keyword>\\$\\{[^}]*\\}|\\$[A-Za-z_]\\w*)",
      "(?<command>(?<![\\w.-])(?:npm|npx|export|envelope|curl|jq|echo)(?![\\w.-]))",
      "(?<number>\\b\\d+(?:\\.\\d+)?\\b)",
    ].join("|"),
    "gu",
  ),
  json: new RegExp(
    [
      "(?<property>\"(?:\\\\.|[^\"\\\\])*\"(?=\\s*:))",
      "(?<string>\"(?:\\\\.|[^\"\\\\])*\")",
      "(?<keyword>\\b(?:true|false|null)\\b)",
      "(?<number>-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)",
      "(?<punctuation>[{}\\[\\],:])",
    ].join("|"),
    "gu",
  ),
  ts: new RegExp(
    [
      "(?<comment>//[^\\n]*|/\\*[\\s\\S]*?\\*/)",
      "(?<string>\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|`(?:\\\\.|[^`\\\\])*`)",
      "(?<keyword>\\b(?:import|from|export|const|let|var|await|async|new|return|function|type|interface|of|in)\\b)",
      "(?<property>\\b[A-Za-z_$][\\w$]*(?=\\s*:))",
      "(?<number>\\b\\d[\\d_]*n?(?:\\.\\d+)?\\b)",
      "(?<punctuation>[{}()\\[\\];,.])",
    ].join("|"),
    "gu",
  ),
};

export function highlight(code: string, language: Language): Token[] {
  const grammar = new RegExp(GRAMMARS[language].source, GRAMMARS[language].flags);
  const tokens: Token[] = [];
  let cursor = 0;

  for (const match of code.matchAll(grammar)) {
    const at = match.index ?? 0;
    if (at > cursor) tokens.push({ text: code.slice(cursor, at), kind: "plain" });

    const groups = match.groups ?? {};
    const kind = (Object.keys(groups).find((name) => groups[name] !== undefined) ??
      "plain") as TokenKind;
    tokens.push({ text: match[0], kind });
    cursor = at + match[0].length;
  }

  if (cursor < code.length) tokens.push({ text: code.slice(cursor), kind: "plain" });
  return tokens;
}
