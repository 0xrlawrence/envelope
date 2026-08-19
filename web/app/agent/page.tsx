import type { Metadata } from "next";
import { Snippet } from "@/components/Snippet";
import { Eyebrow } from "@/components/ui";

export const metadata: Metadata = {
  title: "Envelope for agents: pay anyone by link, from a terminal",
  description:
    "An npm package and CLI that lets an agent with an account key seal value into a claim link and open links it is handed. No browser, no wallet extension, and the recipient needs no account with anyone.",
};

const INSTALL = `npm install -g strk20-envelope-cli`;

const SETUP = `export STARKNET_ACCOUNT=0x…        # the account that signs
export STARKNET_PRIVATE_KEY=0x…    # its key
export ENVELOPE_NETWORK=sepolia    # or mainnet`;

const SEAL = `envelope seal --amount 1 --expiry 24h --memo "invoice 1101"`;

const SEAL_JSON = `{
  "ok": true,
  "network": "sepolia",
  "amount": "1",
  "token": "STRK",
  "expiresAt": "2026-08-20T07:41:48.000Z",
  "claimLink": "https://0xrlawrence.github.io/envelope/claim#e1.BSc7nv0…",
  "returnLink": "https://0xrlawrence.github.io/envelope/refund#r1.B4jwdCU…~0x7e431…",
  "envelopeId": "0x7e43138dca13d7ab1cfd1e892bdcdcf8d49258ead6ea29aa395ef5559ef0797",
  "transactionHash": "0x2a927023701c734c6a91…",
  "fundedPrivately": false
}`;

const OPEN = `envelope open "https://0xrlawrence.github.io/envelope/claim#e1.BSc7nv0…"`;

const STATUS = `envelope status 0x7e43138dca13d7ab1cfd1e892bdcdcf8d49258ead6ea29aa395ef5559ef0797 --id`;

const PIPE = `LINK=$(envelope seal --amount 1 --json | jq -r .claimLink)
curl -X POST "$WEBHOOK" -d "{\\"pay\\": \\"$LINK\\"}"`;

const DRY = `envelope seal --amount 1 --dry-run --json`;

const SDK = `import { buildPublicFundCalls, encodeClaimLink, generateEnvelopeKey } from "strk20-envelope";

const claim = generateEnvelopeKey();
const refund = generateEnvelopeKey();

const calls = buildPublicFundCalls({
  anonymizer, token, amount: 1_000_000_000_000_000_000n,
  claimPublicKey: claim.publicKey,
  refundPublicKey: refund.publicKey,
  expiry: Math.floor(Date.now() / 1000) + 86_400,
});

await account.execute(calls);
const link = encodeClaimLink(origin, claim.privateKey);`;

export default function AgentPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6 sm:py-10">
      <h1 className="headline">Pay an agent that has no account.</h1>

      <p className="mt-3 max-w-[62ch] text-[0.78rem] leading-snug text-[var(--paper-dim)] sm:mt-5 sm:text-base sm:leading-normal">
        A transfer needs somewhere to send it. An envelope does not: it seals value
        against a key that exists only in a link, and whoever holds the link takes the
        contents. There is nothing to register, no viewing key to exchange and no
        address to ask for, which is what makes it something one agent can hand
        another before they know anything about each other.
      </p>

      <section className="mt-6 sm:mt-10">
        <Eyebrow>Install</Eyebrow>
        <Snippet>{INSTALL}</Snippet>
        <Snippet label="Environment">{SETUP}</Snippet>
        <p className="mt-2 text-[0.72rem] leading-snug text-[var(--paper-faint)] sm:text-xs">
          The key is read from the environment and never written to disk. Whatever
          process holds it holds the money.
        </p>
      </section>

      <section className="mt-7 sm:mt-12">
        <Eyebrow>Send</Eyebrow>
        <Snippet>{SEAL}</Snippet>
        <Snippet language="json" label="stdout">
          {SEAL_JSON}
        </Snippet>
        <p className="mt-2 max-w-[62ch] text-[0.72rem] leading-snug text-[var(--paper-faint)] sm:text-xs">
          Output is JSON whenever stdout is not a terminal, so a program calling this
          never has to read prose. Anyone holding the claim link can take the contents,
          so pass it the way you would pass cash. Keep the return link: after the
          window shuts it is the only way to get the money back, and it cannot be
          regenerated.
        </p>
      </section>

      <section className="mt-7 sm:mt-12">
        <Eyebrow>Receive</Eyebrow>
        <Snippet>{OPEN}</Snippet>
        <Snippet>{STATUS}</Snippet>
        <p className="mt-2 max-w-[62ch] text-[0.72rem] leading-snug text-[var(--paper-faint)] sm:text-xs">
          <code className="font-mono">open</code> claims to your own account unless{" "}
          <code className="font-mono">--to</code> says otherwise.{" "}
          <code className="font-mono">status</code> reads the contract and takes either a
          claim link or, with <code className="font-mono">--id</code>, an envelope id.
        </p>
      </section>

      <section className="mt-7 sm:mt-12">
        <Eyebrow>In a pipeline</Eyebrow>
        <Snippet>{PIPE}</Snippet>
        <Snippet label="Rehearse">{DRY}</Snippet>
        <p className="mt-2 max-w-[62ch] text-[0.72rem] leading-snug text-[var(--paper-faint)] sm:text-xs">
          <code className="font-mono">--dry-run</code> builds and prints the transaction
          without signing or sending it. Worth doing once before wiring this into
          anything that spends on its own.
        </p>
      </section>

      <section className="mt-7 sm:mt-12">
        <Eyebrow>Or the library</Eyebrow>
        <Snippet language="ts" label="strk20-envelope">
          {SDK}
        </Snippet>
      </section>

      {/*
        * Stated on the page rather than discovered at runtime.
        *
        * Three things need a wallet that can prove a STRK20 action for its own
        * account class, and a bare private key cannot. Leaving that to be found
        * out by a failing transaction would be the worst way to learn it, and
        * the privacy claim is the whole product: it has to be exact about
        * which leg is private and which is not.
        */}
      <section className="mt-7 border-t border-[var(--ink-line)] pt-5 sm:mt-12 sm:pt-6">
        <Eyebrow>What a key alone cannot do</Eyebrow>
        <dl className="mt-3 space-y-3 text-[0.78rem] leading-snug sm:text-sm sm:leading-normal">
          <div>
            <dt className="text-[var(--paper)]">Fund privately</dt>
            <dd className="text-[var(--paper-dim)]">
              The CLI funds from your address, in the open: the amount and the funder
              are on-chain. Everything else is unchanged, including that a recipient
              claiming into a shielded balance is still unobservable.
            </dd>
          </div>
          <div>
            <dt className="text-[var(--paper)]">Claim into a shielded balance</dt>
            <dd className="text-[var(--paper-dim)]">
              <code className="font-mono">open</code> pays to an address, which puts the
              recipient on-chain.
            </dd>
          </div>
          <div>
            <dt className="text-[var(--paper)]">Return an expired envelope</dt>
            <dd className="text-[var(--paper-dim)]">
              The contract only accepts a refund from the pool, so the return link has
              to be opened in this app.
            </dd>
          </div>
        </dl>
        <p className="mt-3 max-w-[62ch] text-[0.72rem] leading-snug text-[var(--paper-faint)] sm:text-xs">
          All three need a wallet that can prove a STRK20 action for its own account
          class, which a private key on its own cannot do.{" "}
          <code className="font-mono">envelope whoami</code> prints this list next to the
          account in use, so a caller can check rather than assume.
        </p>
      </section>
    </div>
  );
}
