/** STRK, like every ERC20 here, is quoted in whole tokens and held in wei. */
const DECIMALS = 18;
const UNIT = 10n ** BigInt(DECIMALS);

/**
 * Read "1", "0.5" or "12.345" as a token amount.
 *
 * Parsed by string rather than through a float. `0.1` has no exact binary form,
 * and the rounding that follows is invisible until it has moved somebody's
 * money by a few wei.
 */
export function toWei(input: string): bigint {
  const text = input.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Could not read "${input}" as an amount. Use a number like 1 or 0.5.`);
  }
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > DECIMALS) {
    throw new Error(`An amount cannot be finer than ${DECIMALS} decimal places.`);
  }
  const padded = fraction.padEnd(DECIMALS, "0");
  const value = BigInt(whole!) * UNIT + BigInt(padded || "0");
  if (value <= 0n) throw new Error("An envelope has to hold something.");
  return value;
}

/** Back to a readable figure, with no trailing zeroes. */
export function fromWei(value: bigint): string {
  const whole = value / UNIT;
  const fraction = value % UNIT;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(DECIMALS, "0").replace(/0+$/, "")}`;
}
