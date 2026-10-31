import { Verifier, Address } from "bip322-js";

import { MessageSigningError } from "./types";

/**
 * Verify a base64 signature against the canonical P2WPKH address
 * derived from `pubkey`. Returns a boolean — never throws.
 *
 * Loose-mode `bip322-js`: strict mode rejects BIP-137 sigs over
 * P2WPKH, but caravan's cosigner paths canonicalize to P2WPKH so we
 * need to accept them. Address type is hardcoded P2WPKH.
 */
export function verifyMessageSignature(args: {
  message: string;
  signature: string;
  pubkey: string;
}): boolean {
  const { message, signature, pubkey } = args;
  if (!(/^[0-9a-fA-F]+$/).test(pubkey)) {
    return false;
  }
  const pubkeyBuf = Buffer.from(pubkey, "hex");
  if (pubkeyBuf.length !== 33) {
    return false;
  }
  let address: string;
  try {
    address = Address.convertPubKeyIntoAddress(pubkeyBuf, "p2wpkh").mainnet;
  } catch {
    return false;
  }
  try {
    return Verifier.verifySignature(address, message, signature, false);
  } catch {
    return false;
  }
}

/**
 * Throw `MalformedResponse` if the signature a device just produced
 * doesn't recover to the cosigner pubkey at the path we asked it to
 * sign at. Surfaces "wrong wallet loaded" / "firmware bug" failures
 * at the keystore boundary, before the SignMessageResult escapes to a
 * downstream consumer that would see only a silent verify=false.
 */
export function assertSignatureVerifies(
  keystore: string,
  args: { message: string; signature: string; pubkey: string },
): void {
  if (!verifyMessageSignature(args)) {
    throw new MessageSigningError({
      kind: "MalformedResponse",
      keystore,
      userMessage:
        "Device returned a signature that doesn't verify against the cosigner pubkey at this path.",
    });
  }
}
