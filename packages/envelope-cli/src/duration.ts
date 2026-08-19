/**
 * Claim windows, written the way a person or a prompt would write them.
 *
 * `30m`, `24h`, `7d`. Bare numbers are refused rather than guessed at: an
 * expiry read as seconds when minutes were meant shuts the window before the
 * recipient has opened their mail, and the value is then locked up until the
 * funder reclaims it.
 */
const UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3_600,
  d: 86_400,
};

export function parseDuration(input: string): number {
  const match = /^(\d+)\s*([smhd])$/i.exec(input.trim());
  if (!match) {
    throw new Error(
      `Could not read "${input}" as a claim window. Use a number and a unit, like 30m, 24h or 7d.`,
    );
  }
  const amount = Number(match[1]);
  const unit = UNITS[match[2]!.toLowerCase()]!;
  const seconds = amount * unit;
  if (seconds <= 0) throw new Error("A claim window has to be longer than nothing.");
  return seconds;
}

/** "7 days", for a human reading the result back. */
export function describeDuration(seconds: number): string {
  const pick: Array<[number, string]> = [
    [86_400, "day"],
    [3_600, "hour"],
    [60, "minute"],
    [1, "second"],
  ];
  for (const [size, name] of pick) {
    if (seconds % size === 0 && seconds >= size) {
      const count = seconds / size;
      return `${count} ${name}${count === 1 ? "" : "s"}`;
    }
  }
  return `${seconds} seconds`;
}
