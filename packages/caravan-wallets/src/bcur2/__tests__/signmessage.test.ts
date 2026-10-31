import { Network, TEST_FIXTURES } from "@caravan/bitcoin";

import { BCUR2, SignMessage } from "../..";
import { BCUR2SignMessage } from "../interactions";

const FIXTURE = TEST_FIXTURES.multisigs[0];

// Lives in its own file rather than interactions.test.ts so the default
// BCUR2Encoder construction path runs unmocked — interactions.test.ts
// mocks `../encoder` at module scope, which would replace the encoder
// used here with a stub that has no `qrFragments` getter.
describe("SignMessage factory (BCUR2 case)", () => {
  it("dispatches to BCUR2SignMessage and produces a valid Specter QR", () => {
    const interaction = SignMessage({
      keystore: BCUR2,
      network: Network.TESTNET,
      bip32Path: FIXTURE.bip32Path,
      message: FIXTURE.signedMessages.message,
      pubkey: FIXTURE.publicKey,
    });

    expect(interaction).toBeInstanceOf(BCUR2SignMessage);
    expect((interaction as BCUR2SignMessage).workflow).toEqual([
      "request",
      "parse",
    ]);
    expect((interaction as BCUR2SignMessage).request().qrCodeFrames).toEqual([
      `signmessage ${FIXTURE.bip32Path} ascii:${FIXTURE.signedMessages.message}`,
    ]);
  });
});
