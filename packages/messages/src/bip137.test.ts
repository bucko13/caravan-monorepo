import { TEST_FIXTURES } from "@caravan/bitcoin";

import {
  encodeSignmessageRequest,
  isPrintableAscii,
  MAX_SIGNATURE_LENGTH,
  parseSignmessageResponse,
} from "./bip137";

const FIXTURE = TEST_FIXTURES.multisigs[0];

describe("encodeSignmessageRequest", () => {
  it.each([
    [
      "BIP-48 cosigner path with simple ASCII",
      { bip32Path: "m/48'/1'/0'/2'/0/0", message: "hello" },
      "signmessage m/48'/1'/0'/2'/0/0 ascii:hello",
    ],
    [
      "preserves spaces and punctuation",
      { bip32Path: "m/45'/0/0", message: "Hello, world! 1+2=3." },
      "signmessage m/45'/0/0 ascii:Hello, world! 1+2=3.",
    ],
    [
      "default smoke-test message",
      {
        bip32Path: FIXTURE.bip32Path,
        message: "caravan message-signing smoke test",
      },
      `signmessage ${FIXTURE.bip32Path} ascii:caravan message-signing smoke test`,
    ],
  ])("%s", (_label, args, expected) => {
    expect(encodeSignmessageRequest(args)).toBe(expected);
  });

  it.each([
    ["non-ASCII letters", "héllo"],
    ["newline", "a\nb"],
    ["NUL byte", "a\x00b"],
    ["tab", "a\tb"],
    ["DEL", "a\x7fb"],
  ])("throws on %s", (_label, message) => {
    expect(() =>
      encodeSignmessageRequest({ bip32Path: "m/0/0", message }),
    ).toThrow(/printable ASCII/);
  });
});

describe("parseSignmessageResponse", () => {
  const bip137 = FIXTURE.signedMessages.bip137;
  const bip322 = FIXTURE.signedMessages.bip322;

  it.each([
    ["BIP-137 sig passes through", bip137, bip137],
    ["BIP-322 Simple sig passes through", bip322, bip322],
    ["strips surrounding whitespace", `  \n${bip137}\n  `, bip137],
  ])("%s", (_label, input, expected) => {
    expect(parseSignmessageResponse(input)).toBe(expected);
  });

  it.each([
    ["empty", "", /empty/i],
    ["whitespace-only", "   ", /empty/i],
    ["non-base64 characters", "not base64!!!", /base64/],
    ["oversized", "A".repeat(MAX_SIGNATURE_LENGTH + 1), /maximum length/],
  ])("throws on %s", (_label, input, pattern) => {
    expect(() => parseSignmessageResponse(input)).toThrow(pattern);
  });
});

describe("isPrintableAscii", () => {
  it.each([
    ["printable ASCII", "Hello, World! 0123456789 ~"],
    ["empty string", ""],
  ])("accepts %s", (_label, value) => {
    expect(isPrintableAscii(value)).toBe(true);
  });

  it.each([
    ["newline", "a\nb"],
    ["tab", "a\tb"],
    ["NUL", "a\x00b"],
    ["DEL", "a\x7fb"],
    ["accented Latin", "héllo"],
    ["non-Latin script", "日本語"],
  ])("rejects %s", (_label, value) => {
    expect(isPrintableAscii(value)).toBe(false);
  });
});
