/**
 * BIP-137 message-signing wire helpers.
 *
 * `@caravan/messages`'s BIP-137 namespace. Direct-transport keystores
 * (Ledger/Trezor/Jade-direct/BitBox) sign BIP-137 too, but their SDKs
 * own the wire format internally; the helpers here cover the cases
 * where caravan has to build the request and parse the response
 * itself.
 *
 * Current export: the text envelope used by airgap QR signers. The
 * shape was first defined by Specter Desktop and adopted by Sparrow
 * Wallet ("Sign by QR"), Jade (QR mode), Keystone3, and SeedSigner
 * (with PR #874):
 *
 *     signmessage {bip32Path} ascii:{message}
 *
 * Devices reply with a bare base64 signature. Loose-mode verification
 * in `verify.ts` accepts both BIP-137 and BIP-322 Simple signature
 * payloads over this envelope (the dpinkerton claim that SeedSigner
 * emits BIP-322 Simple is unverified and contradicts the embit source,
 * but the verifier handles both shapes anyway).
 *
 * These helpers are transport-format only — they neither know the
 * keystore identity nor perform cryptographic verification. There is
 * no formal spec for the envelope; treat the firmware sources as
 * authoritative (e.g. Jade's QR handler grep's the literal
 * `signmessage` prefix in `qrmode.c`).
 *
 * Future BIP-137 transports (alternative text envelopes, NFC, etc.)
 * land here as additional exports without breaking the namespace.
 * BIP-322 FULL / Proof-of-Reserves is PSBT-shaped and is a separate
 * concern outside this file.
 */

const REQUEST_PREFIX = "signmessage";
const ENCODING_TOKEN = "ascii";

/**
 * Upper bound for a scanned signature payload. BIP-137 is ~88 chars;
 * BIP-322 Simple typically lands in ~110-180. 512 is comfortably above
 * both while rejecting payloads that obviously aren't a signature.
 */
export const MAX_SIGNATURE_LENGTH = 512;

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Printable ASCII is 0x20-0x7E (space through tilde). On-device text
 * parsers reject anything outside this range; caravan rejects up-front
 * so callers fail fast rather than at the device.
 */
const PRINTABLE_ASCII_PATTERN = /^[\x20-\x7E]*$/;

export function isPrintableAscii(value: string): boolean {
  return PRINTABLE_ASCII_PATTERN.test(value);
}

/**
 * Build the BIP-137 sign-message request string for the airgap QR
 * text envelope.
 *
 * @throws Error when `message` contains any non-printable-ASCII byte.
 *   The envelope declares `ascii:` as the encoding and on-device
 *   parsers do not accept UTF-8.
 */
export function encodeSignmessageRequest(args: {
  bip32Path: string;
  message: string;
}): string {
  const { bip32Path, message } = args;
  if (!isPrintableAscii(message)) {
    throw new Error(
      "BIP-137 signmessage request: message must be printable ASCII (0x20-0x7E).",
    );
  }
  return `${REQUEST_PREFIX} ${bip32Path} ${ENCODING_TOKEN}:${message}`;
}

/**
 * Validate the shape of a scanned base64 signature returned by an
 * airgap signer. Strips surrounding whitespace; rejects empty input,
 * non-base64-alphabet characters, and grossly oversized payloads.
 *
 * Cryptographic verification of the recovered signature against an
 * expected pubkey is the caller's responsibility — typically via
 * `verifyMessageSignature`, which handles both BIP-137 and BIP-322
 * Simple via loose-mode `bip322-js`.
 */
export function parseSignmessageResponse(scanned: string): string {
  if (typeof scanned !== "string") {
    throw new Error("Expected scanned signature to be a string.");
  }
  const stripped = scanned.trim();
  if (stripped.length === 0) {
    throw new Error("Empty scanned signature.");
  }
  if (stripped.length > MAX_SIGNATURE_LENGTH) {
    throw new Error(
      `Scanned signature exceeds maximum length (${stripped.length} > ${MAX_SIGNATURE_LENGTH}).`,
    );
  }
  if (!BASE64_PATTERN.test(stripped)) {
    throw new Error(
      `Scanned signature is not base64 (got "${stripped.slice(0, 16)}…").`,
    );
  }
  return stripped;
}
