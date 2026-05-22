---
"@caravan/wallets": minor
"caravan-coordinator": minor
---

Add BCUR2 to the per-cosigner BIP-137 sign-message keystore family.
`BCUR2SignMessage` emits a single-frame Specter Desktop ASCII QR
request and accepts a bare base64 signature in response. The
coordinator's `/#/test` BCUR2 suite now includes message-signing tests.

Device support:

- **Jade (QR mode)**: supported — source-verified.
- **Keystone3**: supported — source-verified.
- **SeedSigner**: requires firmware with PR #874 merged or a fork.
  Mainline rejects BIP-48 cosigner paths in the on-board path parser.
- **Foundation Passport**: untested. The Specter parser is documented
  in firmware sources, but the QR-decode → parser call chain and the
  signature-header behavior on `m/48'` paths have not been
  hardware-verified.

Messages are restricted to printable ASCII (0x20–0x7E) at construction
because device-side text parsers reject UTF-8.
