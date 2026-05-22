import { TEST_FIXTURES } from "@caravan/bitcoin";

import {
  encodeSignmessageRequest,
  isPrintableAscii,
  MAX_SIGNATURE_LENGTH,
  parseSignmessageResponse,
} from "./signmessage";

const FIXTURE = TEST_FIXTURES.multisigs[0];

describe("encodeSignmessageRequest", () => {
  it("produces the exact Specter ASCII envelope for a BIP-48 cosigner path", () => {
    expect(
      encodeSignmessageRequest({
        bip32Path: "m/48'/1'/0'/2'/0/0",
        message: "hello",
      }),
    ).toBe("signmessage m/48'/1'/0'/2'/0/0 ascii:hello");
  });

  it("preserves spaces and punctuation in the ASCII message", () => {
    expect(
      encodeSignmessageRequest({
        bip32Path: "m/45'/0/0",
        message: "Hello, world! 1+2=3.",
      }),
    ).toBe("signmessage m/45'/0/0 ascii:Hello, world! 1+2=3.");
  });

  it("preserves the default smoke-test message used by the test runner", () => {
    expect(
      encodeSignmessageRequest({
        bip32Path: FIXTURE.bip32Path,
        message: "caravan message-signing smoke test",
      }),
    ).toBe(
      `signmessage ${FIXTURE.bip32Path} ascii:caravan message-signing smoke test`,
    );
  });

  it("throws on non-ASCII characters", () => {
    expect(() =>
      encodeSignmessageRequest({ bip32Path: "m/0/0", message: "héllo" }),
    ).toThrow(/printable ASCII/);
  });

  it("throws on control characters embedded in the message", () => {
    expect(() =>
      encodeSignmessageRequest({ bip32Path: "m/0/0", message: "a\nb" }),
    ).toThrow(/printable ASCII/);
    expect(() =>
      encodeSignmessageRequest({ bip32Path: "m/0/0", message: "a\x00b" }),
    ).toThrow(/printable ASCII/);
  });
});

describe("parseSignmessageResponse", () => {
  it("returns the stripped sig for a BIP-137 fixture", () => {
    const bip137 = FIXTURE.signedMessages.bip137;
    expect(parseSignmessageResponse(bip137)).toBe(bip137);
  });

  it("returns the stripped sig for a BIP-322 Simple fixture", () => {
    const bip322 = FIXTURE.signedMessages.bip322;
    expect(parseSignmessageResponse(bip322)).toBe(bip322);
  });

  it("strips surrounding whitespace and newlines", () => {
    const bip137 = FIXTURE.signedMessages.bip137;
    expect(parseSignmessageResponse(`  \n${bip137}\n  `)).toBe(bip137);
  });

  it("throws on empty or whitespace-only input", () => {
    expect(() => parseSignmessageResponse("")).toThrow(/empty/i);
    expect(() => parseSignmessageResponse("   ")).toThrow(/empty/i);
  });

  it("throws on non-base64 characters", () => {
    expect(() => parseSignmessageResponse("not base64!!!")).toThrow(/base64/);
  });

  it("throws on payloads beyond the length ceiling", () => {
    expect(() =>
      parseSignmessageResponse("A".repeat(MAX_SIGNATURE_LENGTH + 1)),
    ).toThrow(/maximum length/);
  });
});

describe("isPrintableAscii", () => {
  it("accepts ASCII printable characters", () => {
    expect(isPrintableAscii("Hello, World! 0123456789 ~")).toBe(true);
  });

  it("accepts the empty string", () => {
    expect(isPrintableAscii("")).toBe(true);
  });

  it("rejects control characters", () => {
    expect(isPrintableAscii("a\nb")).toBe(false);
    expect(isPrintableAscii("a\tb")).toBe(false);
    expect(isPrintableAscii("a\x00b")).toBe(false);
    expect(isPrintableAscii("a\x7fb")).toBe(false);
  });

  it("rejects non-ASCII characters", () => {
    expect(isPrintableAscii("héllo")).toBe(false);
    expect(isPrintableAscii("café")).toBe(false);
    expect(isPrintableAscii("日本語")).toBe(false);
  });
});
