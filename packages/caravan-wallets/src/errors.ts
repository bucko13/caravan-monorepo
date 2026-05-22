import {
  type MessageSigningErrorKind,
  MessageSigningError,
  verifyMessageSignature,
} from "@caravan/messages";

/**
 * Wrap an arbitrary throw as a `MessageSigningError` with an explicit
 * `kind`. Pass-through for existing `MessageSigningError` instances so
 * callers can layer this around helpers that may themselves throw
 * either plain `Error` or a pre-classified `MessageSigningError`.
 *
 * Use this when the failure mode is known (envelope validation,
 * input precondition, etc.) — distinct from `wrapSdkError`, which
 * classifies unknown transport-layer SDK throws.
 */
export function wrapAsMessageSigningError(args: {
  keystore: string;
  kind: MessageSigningErrorKind;
  err: unknown;
}): MessageSigningError {
  const { keystore, kind, err } = args;
  if (err instanceof MessageSigningError) {
    return err;
  }
  const userMessage = err instanceof Error ? err.message : String(err);
  return new MessageSigningError({
    kind,
    keystore,
    userMessage,
    cause: err,
  });
}

/**
 * Translate a raw SDK throw into a `MessageSigningError`. Existing
 * `MessageSigningError` instances pass through unchanged.
 */
export function wrapSdkError(
  keystore: string,
  err: unknown,
): MessageSigningError {
  if (err instanceof MessageSigningError) {
    return err;
  }
  const errObj = err as { message?: unknown; statusCode?: unknown };
  const rawMessage =
    typeof errObj.message === "string" ? errObj.message : String(err);
  const statusCode =
    typeof errObj.statusCode === "number" ? errObj.statusCode : null;
  const lower = rawMessage.toLowerCase();
  const looksLikeRejection =
    statusCode === 0x6985 ||
    lower.includes("cancel") ||
    lower.includes("reject") ||
    lower.includes("denied") ||
    lower.includes("declined") ||
    lower.includes("aborted by user") ||
    lower.includes("user abort");
  return new MessageSigningError({
    kind: looksLikeRejection ? "DeviceRejected" : "TransportError",
    keystore,
    userMessage: looksLikeRejection
      ? "Signing was rejected on the device."
      : rawMessage || "Communication with the device failed.",
    cause: err,
  });
}

/**
 * Throw `MalformedResponse` if the signature a device just produced
 * doesn't recover to the cosigner pubkey at the path we asked it to
 * sign at. Surfaces "wrong wallet loaded" / "firmware bug" failures
 * at the keystore boundary, before the SignMessageResult escapes to a downstream
 * consumer that would see only a silent verify=false.
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
