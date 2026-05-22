/**
 * @module bcur2/signmessage
 *
 * Specter Desktop sign-message wire-format helpers.
 *
 * BCUR-adjacent airgap signers (SeedSigner, Jade in QR mode,
 * Keystone3, and per documentation Foundation Passport) all accept a
 * single plain-text QR request in the Specter Desktop format:
 *
 *     signmessage {bip32Path} ascii:{message}
 *
 * and reply with a bare base64 signature (BIP-137 wire form on
 * source-verified devices; loose-mode verification handles both BIP-137
 * and BIP-322 Simple at the consumer layer). The helpers in this
 * module are transport-layer only — they neither know the keystore
 * identity nor perform cryptographic verification.
 */

const SPECTER_REQUEST_PREFIX = "signmessage";
const SPECTER_ENCODING_TOKEN = "ascii";

/**
 * Upper bound for a scanned signature payload. BIP-137 is ~88 chars;
 * BIP-322 Simple typically lands in ~110-180. 512 is comfortably above
 * both while rejecting payloads that obviously aren't a signature.
 */
export const MAX_SIGNATURE_LENGTH = 512;

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Printable ASCII is 0x20-0x7E (space through tilde). On-device text
 * parsers on BCUR-adjacent signers reject anything outside this range;
 * caravan rejects up-front so callers fail fast rather than at the
 * device.
 */
const PRINTABLE_ASCII_PATTERN = /^[\x20-\x7E]*$/;

export function isPrintableAscii(value: string): boolean {
  return PRINTABLE_ASCII_PATTERN.test(value);
}

/**
 * Build the Specter Desktop sign-message request string.
 *
 * @throws Error when `message` contains any non-printable-ASCII byte.
 *   The Specter envelope declares `ascii:` as the encoding and devices'
 *   on-board parsers do not accept UTF-8.
 */
export function encodeSignmessageRequest(args: {
  bip32Path: string;
  message: string;
}): string {
  const { bip32Path, message } = args;
  if (!isPrintableAscii(message)) {
    throw new Error(
      "Specter signmessage request: message must be printable ASCII (0x20-0x7E).",
    );
  }
  return `${SPECTER_REQUEST_PREFIX} ${bip32Path} ${SPECTER_ENCODING_TOKEN}:${message}`;
}

/**
 * Validate the shape of a scanned base64 signature returned by an
 * airgap signer. Strips surrounding whitespace; rejects empty input,
 * non-base64-alphabet characters, and grossly oversized payloads.
 *
 * Cryptographic verification of the recovered signature against an
 * expected pubkey is the caller's responsibility — typically via
 * `verifyMessageSignature` from `@caravan/messages`, which handles
 * both BIP-137 and BIP-322 Simple via loose-mode `bip322-js`.
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
