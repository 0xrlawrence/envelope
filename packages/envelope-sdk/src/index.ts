/**
 * Envelope: programmable private claim links for the STRK20 privacy pool.
 *
 * Three pieces, usable independently:
 *
 * - **keys / link**: mint an envelope key and put it in a URL fragment, so the
 *   bearer instrument never touches a server.
 * - **message**: the signed authorisation, pinned to the Cairo contract by a
 *   shared test vector.
 * - **actions**: the STRK20 action lists to hand to `strk20InvokeTransaction`.
 *
 * @packageDocumentation
 */

export {
  buildClaimToAddressCall,
  buildShieldActions,
  felt,
  feltTokens,
  buildClaimToNoteActions,
  buildFundActions,
  buildRefundActions,
  resolveOpenNoteId,
  type AnonymizerTarget,
  type ClaimToAddressParams,
  type ClaimToNoteParams,
  type FundEnvelopeParams,
  type PreparesInvokes,
  type RefundParams,
} from "./actions.js";
export {
  DOMAIN,
  MODE,
  OP,
  POOL_ADDRESS_MAINNET,
  STRK_ADDRESS,
  type ReleaseMode,
} from "./constants.js";
export { generateEnvelopeKey, toPublicKey, type EnvelopeKeyPair } from "./keys.js";
export {
  decodeLinkFragment,
  decodeRefundFragment,
  encodeClaimLink,
  encodeLinkFragment,
  encodeRefundLink,
  type LinkKind,
} from "./link.js";
export {
  releaseMessageHash,
  signRelease,
  type ReleaseMessage,
  type ReleaseSignature,
} from "./message.js";
export { readEnvelope, type EnvelopeState, type EnvelopeStatus } from "./read.js";
