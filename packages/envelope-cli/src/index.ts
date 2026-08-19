#!/usr/bin/env node
/**
 * Envelope, from a terminal.
 *
 * Built for a caller that is not a person: an agent with an account key, no
 * browser and no wallet extension, that needs to pay someone who may not have
 * an account at all. It seals value against a fresh key, prints the link that
 * carries it, and opens links handed to it.
 *
 * What it deliberately does not do is pretend to be a privacy wallet. Funding
 * through the STRK20 pool needs a wallet that can prove a STRK20 action for its
 * own account class, which a bare private key cannot; so does reclaiming an
 * expired envelope, which the contract only accepts from the pool. Those two
 * live in the web app. Everything the contract exposes to an ordinary account
 * is here, and the parts that are not are named rather than quietly missing.
 */
import { Account, RpcProvider } from "starknet";
import {
  buildClaimToAddressCall,
  buildPublicFundCalls,
  decodeLinkFragment,
  encodeClaimLink,
  encodeRefundLink,
  generateEnvelopeKey,
  readEnvelope,
  toPublicKey,
} from "strk20-envelope";
import { fromWei, toWei } from "./amount.js";
import { account, ConfigError, network, noteEnvFiles, type Network } from "./config.js";
import { loadEnvFiles } from "./envfile.js";
import { describeDuration, parseDuration } from "./duration.js";

const USAGE = `envelope: private claim links on Starknet

  envelope seal --amount <n> [--expiry 24h] [--memo <text>] [--dry-run]
      Fund a new envelope and print the links that open and reclaim it.

  envelope open <link|key> [--to <address>] [--dry-run]
      Claim an envelope to an address. Defaults to your own.

  envelope status <link|key> [--id]
      Report what the contract says about an envelope. --id when the argument
      is an envelope id rather than a claim key.

  envelope whoami
      Print the account and network in use, and what they can do.

Configuration
  Read from the environment. A .env.local or .env in the directory you run
  from is loaded automatically, and --env <path> points at one anywhere.
  Variables already exported in the shell always win over a file.

  Not --env-file: node claims that one for itself before this program is
  handed its arguments, so it would never reach here.

  STARKNET_ACCOUNT       account address to sign with
  STARKNET_PRIVATE_KEY   its private key
  ENVELOPE_NETWORK       sepolia (default) or mainnet
  STARKNET_RPC           override the RPC endpoint
  ENVELOPE_ANONYMIZER    override the contract address
  ENVELOPE_APP_ORIGIN    override the origin used to build links

Output is JSON whenever stdout is not a terminal, so a program calling this
never has to read prose. --json forces it, --human forces the other way.

--dry-run builds and prints the transaction without signing or sending it, so a
caller can rehearse a payment before it spends anything.`;

interface Flags {
  readonly command: string;
  readonly positional: string[];
  readonly options: Record<string, string | true>;
}

function parseArgv(argv: string[]): Flags {
  const [command = "", ...rest] = argv;
  const positional: string[] = [];
  const options: Record<string, string | true> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]!;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = rest[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[name] = true;
    } else {
      options[name] = next;
      index += 1;
    }
  }
  return { command, positional, options };
}

/**
 * Machines get JSON, people get sentences, and the default is decided by what
 * stdout is attached to rather than by the caller remembering a flag.
 */
function reporter(options: Flags["options"]) {
  const machine = options.json === true || (options.human !== true && !process.stdout.isTTY);
  return {
    machine,
    ok(payload: Record<string, unknown>, lines: string[]) {
      if (machine) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      else process.stdout.write(`${lines.join("\n")}\n`);
    },
    fail(message: string, hint?: string) {
      if (machine) {
        process.stderr.write(
          `${JSON.stringify({ ok: false, error: message, hint }, null, 2)}\n`,
        );
      } else {
        process.stderr.write(`${message}\n${hint ? `\n${hint}\n` : ""}`);
      }
      process.exitCode = 1;
    },
  };
}

function provider(net: Network): RpcProvider {
  return new RpcProvider({ nodeUrl: net.rpcUrl });
}

function signer(net: Network): Account {
  const { address, privateKey } = account();
  return new Account({ provider: provider(net), address, signer: privateKey });
}

/**
 * Accept either a full claim link or the bare key inside it.
 *
 * An agent that was handed a link should be able to pass it through untouched,
 * including the fragment, and one that stored only the key should not have to
 * rebuild a URL around it.
 */
function readClaimKey(input: string): string {
  const fragment = input.includes("#") ? input.slice(input.indexOf("#")) : input;
  const decoded = decodeLinkFragment(fragment);
  if (decoded) {
    if (decoded.kind === "refund") {
      throw new Error(
        "That is a return link, not a claim link. Returning an expired envelope needs the privacy pool, which this tool cannot reach.",
      );
    }
    if (decoded.kind === "locked") {
      throw new Error(
        "That envelope is password locked. Its key only exists once the password is put back together with the link, which the web app does.",
      );
    }
    return decoded.privateKey;
  }
  if (/^0x[0-9a-f]+$/i.test(input.trim())) return input.trim();
  throw new Error("Could not read that as a claim link or a claim key.");
}

async function seal(flags: Flags) {
  const out = reporter(flags.options);
  const net = network();
  const amountInput = flags.options.amount;
  if (typeof amountInput !== "string") {
    out.fail("seal needs --amount, for example: envelope seal --amount 1");
    return;
  }

  const amount = toWei(amountInput);
  const expirySeconds = parseDuration(
    typeof flags.options.expiry === "string" ? flags.options.expiry : "24h",
  );
  const memo = typeof flags.options.memo === "string" ? flags.options.memo.slice(0, 31) : "";

  // Both keys exist before anything is signed. If this process dies between the
  // transaction and the output, the envelope is funded on-chain and its only
  // keys were never written down, which is the one failure here that loses the
  // money outright.
  const claim = generateEnvelopeKey();
  const refund = generateEnvelopeKey();
  const expiry = Math.floor(Date.now() / 1000) + expirySeconds;

  const calls = buildPublicFundCalls({
    anonymizer: net.anonymizer,
    token: net.token,
    amount,
    claimPublicKey: claim.publicKey,
    refundPublicKey: refund.publicKey,
    expiry,
    memo,
  });

  const claimLink = encodeClaimLink(net.appOrigin, claim.privateKey);
  const returnLink = encodeRefundLink(net.appOrigin, refund.privateKey, claim.publicKey);

  if (flags.options["dry-run"] === true) {
    out.ok(
      {
        ok: true,
        dryRun: true,
        network: net.id,
        amount: fromWei(amount),
        token: "STRK",
        expiresAt: new Date(expiry * 1000).toISOString(),
        claimLink,
        returnLink,
        envelopeId: claim.publicKey,
        calls,
      },
      [
        `Would seal ${fromWei(amount)} STRK on ${net.label}, claimable for ${describeDuration(expirySeconds)}.`,
        `Two calls: approve on the token, then fund_public on ${net.anonymizer}.`,
        "Nothing was signed and nothing was sent.",
      ],
    );
    return;
  }

  const { transaction_hash } = await signer(net).execute(calls);
  await provider(net).waitForTransaction(transaction_hash);

  out.ok(
    {
      ok: true,
      network: net.id,
      amount: fromWei(amount),
      token: "STRK",
      memo: memo || null,
      expiresAt: new Date(expiry * 1000).toISOString(),
      claimLink,
      returnLink,
      envelopeId: claim.publicKey,
      transactionHash: transaction_hash,
      explorer: `${net.explorer}/tx/${transaction_hash}`,
      fundedPrivately: false,
    },
    [
      `Sealed ${fromWei(amount)} STRK on ${net.label}, claimable for ${describeDuration(expirySeconds)}.`,
      "",
      `Claim link   ${claimLink}`,
      `Return link  ${returnLink}`,
      "",
      "Anyone holding the claim link can take the contents, so send it the way you",
      "would send cash. Keep the return link: after the window shuts it is the only",
      "way to get the money back, and it needs the web app.",
      "",
      `Transaction  ${net.explorer}/tx/${transaction_hash}`,
    ],
  );
}

async function open(flags: Flags) {
  const out = reporter(flags.options);
  const net = network();
  const input = flags.positional[0];
  if (!input) {
    out.fail("open needs a claim link or key: envelope open <link>");
    return;
  }

  const claimPrivateKey = readClaimKey(input);
  const claimPublicKey = toPublicKey(claimPrivateKey);
  const me = signer(net);
  const recipient =
    typeof flags.options.to === "string" ? flags.options.to : me.address;

  const state = await readEnvelope(provider(net), net.anonymizer, claimPublicKey);
  if (state.status === "none") {
    out.fail(`Nothing is sealed against this key on ${net.label}.`);
    return;
  }
  if (state.status !== "funded") {
    out.fail(`This envelope was already ${state.status}.`);
    return;
  }
  if (!state.claimable) {
    out.fail(
      state.refundable
        ? "The claim window has shut. Only the funder can take this back now."
        : "This envelope is time locked and cannot be opened yet.",
    );
    return;
  }

  const call = buildClaimToAddressCall({
    anonymizer: net.anonymizer,
    claimPrivateKey,
    claimPublicKey,
    recipient,
  });

  if (flags.options["dry-run"] === true) {
    out.ok(
      {
        ok: true,
        dryRun: true,
        network: net.id,
        amount: fromWei(state.amount),
        token: "STRK",
        recipient,
        envelopeId: claimPublicKey,
        call,
      },
      [
        `Would open ${fromWei(state.amount)} STRK to ${recipient}.`,
        "Nothing was signed and nothing was sent.",
      ],
    );
    return;
  }

  const { transaction_hash } = await me.execute(call);
  await provider(net).waitForTransaction(transaction_hash);

  out.ok(
    {
      ok: true,
      network: net.id,
      amount: fromWei(state.amount),
      token: "STRK",
      recipient,
      envelopeId: claimPublicKey,
      transactionHash: transaction_hash,
      explorer: `${net.explorer}/tx/${transaction_hash}`,
      private: false,
    },
    [
      `Opened ${fromWei(state.amount)} STRK to ${recipient}.`,
      "",
      "Paid to an address, in the open: this route puts the recipient on-chain.",
      "Claiming into a shielded balance instead needs a STRK20 wallet.",
      "",
      `Transaction  ${net.explorer}/tx/${transaction_hash}`,
    ],
  );
}

async function status(flags: Flags) {
  const out = reporter(flags.options);
  const net = network();
  const input = flags.positional[0];
  if (!input) {
    out.fail("status needs a claim link or key: envelope status <link>");
    return;
  }

  /*
   * A claim key and an envelope id are both felts, so nothing about the input
   * says which one arrived. Deriving regardless turned an id into a key nobody
   * had sealed against and reported "nothing here", which reads as an answer
   * about the envelope rather than about the argument. Asking is the only way.
   */
  const claimPublicKey =
    flags.options.id === true ? input.trim() : toPublicKey(readClaimKey(input));
  const state = await readEnvelope(provider(net), net.anonymizer, claimPublicKey);

  out.ok(
    {
      ok: true,
      network: net.id,
      envelopeId: claimPublicKey,
      status: state.status,
      amount: state.status === "none" ? null : fromWei(state.amount),
      token: state.status === "none" ? null : "STRK",
      claimable: state.claimable,
      refundable: state.refundable,
      expiresAt: state.expiry ? new Date(state.expiry * 1000).toISOString() : null,
    },
    state.status === "none"
      ? [`Nothing is sealed against this key on ${net.label}.`]
      : [
          `${state.status} on ${net.label}, holding ${fromWei(state.amount)} STRK.`,
          state.expiry
            ? `Claim window ${state.claimable ? "shuts" : "shut"} ${new Date(state.expiry * 1000).toISOString()}.`
            : "No expiry.",
        ],
  );
}

async function whoami(flags: Flags) {
  const out = reporter(flags.options);
  const net = network();
  const { address } = account();
  out.ok(
    {
      ok: true,
      address,
      network: net.id,
      rpcUrl: net.rpcUrl,
      anonymizer: net.anonymizer,
      can: ["seal", "open", "status"],
      cannot: {
        "seal privately":
          "funding through the STRK20 pool needs a wallet that can prove a STRK20 action for this account class",
        "claim into a shielded balance": "same proof, on the claim leg",
        "return an expired envelope":
          "the contract only accepts a refund from the pool, so it needs the web app",
      },
    },
    [
      `${address}`,
      `on ${net.label} via ${net.rpcUrl}`,
      `contract ${net.anonymizer}`,
      "",
      "Can: seal, open, status.",
      "Cannot: seal privately, claim into a shielded balance, or return an expired",
      "envelope. All three need a wallet that can prove a STRK20 action.",
    ],
  );
}

async function main() {
  const flags = parseArgv(process.argv.slice(2));

  // Before anything reads a variable, so a key in a file is as good as a key
  // in the shell. Failing to find one is normal; failing to read a file that
  // was named explicitly is not.
  try {
    noteEnvFiles(
      loadEnvFiles(
        typeof flags.options.env === "string" ? flags.options.env : undefined,
      ),
    );
  } catch (cause) {
    reporter(flags.options).fail(
      cause instanceof Error ? cause.message : String(cause),
    );
    return;
  }
  const commands: Record<string, (f: Flags) => Promise<void>> = {
    seal,
    open,
    status,
    whoami,
  };

  if (!flags.command || flags.command === "help" || flags.options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const run = commands[flags.command];
  if (!run) {
    process.stderr.write(`Unknown command "${flags.command}".\n\n${USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    await run(flags);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    reporter(flags.options).fail(
      message,
      cause instanceof ConfigError ? undefined : "Nothing was signed if this failed before a transaction hash was printed.",
    );
  }
}

void main();
