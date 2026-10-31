export type { SignMessageResult, MessageSigningErrorKind } from "./types";
export { MessageSigningError } from "./types";
export { MAX_MESSAGE_BYTES, validateMessage } from "./validate";
export { assertSignatureVerifies, verifyMessageSignature } from "./verify";
export {
  MAX_SIGNATURE_LENGTH,
  encodeSignmessageRequest,
  isPrintableAscii,
  parseSignmessageResponse,
} from "./bip137";
