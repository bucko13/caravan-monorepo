/**
 * @module bcur2
 * This module provides functionality for encoding Bitcoin transaction data into BCUR2 (Bitcoin URIs) QR codes,
 * specifically focused on PSBT (Partially Signed Bitcoin Transaction) format used by hardware wallets.
 */

import { Bytes, CryptoPSBT, RegistryItem } from "@keystonehq/bc-ur-registry";

/**
 * Factory function type for creating RegistryItem instances
 */
export type RegistryItemFactory = (buffer: Buffer) => RegistryItem;

/**
 * Single-QR text-mode capacity ceiling, measured in UTF-8 encoded
 * bytes. Byte-mode QR v15 holds ~535 bytes at error-correction level L;
 * cap below that with margin so callers can't silently produce a
 * "text" payload that no scanner can decode. Non-ASCII characters
 * count for more than one byte each.
 */
export const BCUR2_TEXT_MAX_LENGTH = 500;

/**
 * Class for encoding Bitcoin transaction data into BCUR2 QR codes.
 * Supports encoding of:
 * - PSBT: Partially Signed Bitcoin Transactions in base64 format
 * - Bytes: arbitrary UTF-8 wrapped in a `ur:bytes` registry item
 * - Text: raw string emitted as a single static QR with no UR framing.
 *         Required for airgap flows where the device's text parser
 *         (e.g. Specter ASCII signmessage) does not accept UR payloads.
 */
export class BCUR2Encoder {
  private _data: string;

  // `_buffer` and `registryItemFactory` are only populated for UR
  // registry modes ("crypto-psbt", "bytes"). Text mode emits `_data`
  // verbatim and never reaches the private `encoder` getter, so both
  // fields stay undefined in that mode by design.
  private _buffer?: Buffer;

  private _maxFragmentLength: number;

  private _registryType: "crypto-psbt" | "bytes" | "text";

  private registryItemFactory?: RegistryItemFactory;

  /**
   * Creates a new BCUR2 encoder instance
   * @param data - The data to encode (e.g., base64 PSBT string, UTF-8 text, or plain text)
   * @param maxFragmentLength - Maximum length of each QR code fragment (default: 100).
   *                            Ignored for `"text"` mode (single-frame, no fragmentation).
   * @param registyType - Wire format selection. `"text"` emits `data` verbatim into a
   *                      single QR with no UR framing; throws if `data.length` exceeds
   *                      single-QR byte-mode capacity (`BCUR2_TEXT_MAX_LENGTH`).
   */
  constructor(
    data: string,
    maxFragmentLength: number = 100,
    registyType: "crypto-psbt" | "bytes" | "text" = "crypto-psbt",
  ) {
    this._data = data;
    this._maxFragmentLength = maxFragmentLength;
    this._registryType = registyType;
    switch (registyType) {
      case "crypto-psbt":
        this._buffer = Buffer.from(data.trim(), "base64");
        this.registryItemFactory = (buffer) => new CryptoPSBT(buffer);
        break;
      case "bytes":
        this._buffer = Buffer.from(data.trim(), "utf8");
        this.registryItemFactory = (buffer) => new Bytes(buffer);
        break;
      case "text": {
        const byteLength = Buffer.byteLength(data, "utf8");
        if (byteLength > BCUR2_TEXT_MAX_LENGTH) {
          throw new Error(
            `Text-mode payload exceeds single-QR capacity (${byteLength} > ${BCUR2_TEXT_MAX_LENGTH} bytes).`,
          );
        }
        // No `_buffer` / `registryItemFactory` assignment: text mode
        // skips the UR registry entirely and `qrFragments` /
        // `estimateFragmentCount` short-circuit before the private
        // `encoder` getter is ever called.
        break;
      }
      default:
        throw new Error(`Unsupported registry type: ${registyType}`);
    }
  }

  /**
   * Encodes a PSBT (Partially Signed Bitcoin Transaction) into BCUR2 QR code fragments
   * @returns Array of QR code fragments as strings
   * @throws Error if the encoder was constructed for a non-PSBT registry type, or if encoding fails.
   */
  encodePSBT(): string[] {
    if (this._registryType !== "crypto-psbt") {
      throw new Error(
        `BCUR2Encoder.encodePSBT called on a "${this._registryType}"-mode encoder; use qrFragments for non-PSBT registries.`,
      );
    }
    try {
      return this.qrFragments;
    } catch (err: any) {
      throw new Error(`Failed to encode PSBT: ${err.message}`);
    }
  }

  /**
   * Sets new data to encode. For `"text"` mode, the same single-QR
   * capacity ceiling applied at construction is enforced here so that
   * later reassignments cannot smuggle in an oversized payload.
   */
  set data(data: string) {
    if (this._registryType === "text") {
      const byteLength = Buffer.byteLength(data, "utf8");
      if (byteLength > BCUR2_TEXT_MAX_LENGTH) {
        throw new Error(
          `Text-mode payload exceeds single-QR capacity (${byteLength} > ${BCUR2_TEXT_MAX_LENGTH} bytes).`,
        );
      }
    }
    this._data = data;
  }

  /**
   * Gets the current data
   */
  get data(): string {
    return this._data;
  }

  /**
   * Sets the maximum fragment length for QR codes
   */
  set maxFragmentLength(length: number) {
    this._maxFragmentLength = length;
  }

  /**
   * Gets the current maximum fragment length
   */
  get maxFragmentLength(): number {
    return this._maxFragmentLength;
  }

  private get encoder(): ReturnType<RegistryItem["toUREncoder"]> {
    // Callers (`qrFragments`, `estimateFragmentCount`, `encodePSBT`)
    // short-circuit for text mode before reaching here. If a future
    // change wires a new accessor in without that guard, this assert
    // surfaces the bug at the seam instead of throwing TypeError on
    // `undefined`.
    if (!this._buffer || !this.registryItemFactory) {
      throw new Error(
        `BCUR2Encoder.encoder accessed in "${this._registryType}" mode, which has no UR registry encoder.`,
      );
    }
    return this.registryItemFactory(this._buffer).toUREncoder(
      this._maxFragmentLength,
    );
  }

  get qrFragments(): string[] {
    if (this._registryType === "text") {
      return [this._data];
    }
    return this.encoder.encodeWhole();
  }

  /**
   * Estimates the number of QR code fragments that will be generated
   * @returns Estimated number of fragments
   */
  estimateFragmentCount(): number {
    if (this._registryType === "text") {
      return 1;
    }
    try {
      return this.encoder.fragmentsLength;
    } catch (err: any) {
      throw new Error(`Failed to estimate fragment count: ${err.message}`);
    }
  }
}
