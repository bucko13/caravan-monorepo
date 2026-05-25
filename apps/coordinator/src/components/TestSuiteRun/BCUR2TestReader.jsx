import React from "react";
import PropTypes from "prop-types";
import { Box } from "@mui/material";

import { BCUR2Reader } from "../BCUR2";

// Routes a BCUR2 test's QR-scan flow through BCUR2Reader in the right
// mode. Three test shapes are supported behind the same `showQrReader`
// flag: signed PSBT, signed message, and xpub import. PSBT and
// signed-message scans pass through `test.interaction().parse()`
// before resolving (the test's `matches()` expects the parsed result,
// not the raw QR payload). Exceptions from `parse()` — e.g.
// MessageSigningError on a malformed sig — are caught and routed to
// `onError` so the test surfaces as Test.ERROR rather than crashing
// the reader.
const selectMode = (test) => {
  // Mode-selection signals must be mutually exclusive; mark the test
  // suite at fixture-build time and ensure only one of the recognized
  // BCUR2 reader shapes is in effect for this test.
  const isPsbt = Boolean(test.unsignedTransaction);
  const isSignMessage = Boolean(test.params.signMessage);
  if (isPsbt && isSignMessage) {
    throw new Error(
      "BCUR2TestReader: test sets both `unsignedTransaction` and `params.signMessage`; choose one.",
    );
  }
  if (isPsbt) return "psbt";
  if (isSignMessage) return "message";
  return "xpub";
};

// Test-level mode → underlying BCUR2Reader transport mode. "message" is
// the semantic name surfaced here; on the wire it rides the reader's
// generic "text" mode (single raw-QR scan, no UR framing).
const READER_MODE = {
  psbt: "psbt",
  message: "text",
  xpub: "xpub",
};

const BCUR2TestReader = ({ test, onStart, onResolve, onError, onReset }) => {
  const parseAndResolve = (raw) => {
    try {
      onResolve(test.interaction().parse(raw));
    } catch (e) {
      onError(e);
    }
  };

  const mode = selectMode(test);
  let startText;
  let onSuccess;

  switch (mode) {
    case "psbt":
      startText = "Scan the Signed PSBT QR Code Sequence";
      onSuccess = parseAndResolve;
      break;
    case "message":
      startText = "Scan the Signed Message QR Code";
      onSuccess = parseAndResolve;
      break;
    case "xpub":
      startText = "Scan the BCUR2 QR Code Sequence";
      onSuccess = onResolve;
      break;
    default:
      throw new Error(`Unhandled BCUR2 test mode: ${mode}`);
  }

  // `network` is required for xpub mode (used to decode the UR xpub
  // payload) and ignored by the other modes. Only thread it through
  // where the reader will actually use it.
  const networkProp =
    mode === "xpub" ? { network: test.interaction().network } : {};

  return (
    <Box>
      <BCUR2Reader
        onStart={onStart}
        onSuccess={onSuccess}
        onClear={onReset}
        startText={startText}
        mode={READER_MODE[mode]}
        {...networkProp}
      />
    </Box>
  );
};

BCUR2TestReader.propTypes = {
  test: PropTypes.shape({
    interaction: PropTypes.func.isRequired,
    unsignedTransaction: PropTypes.func,
    params: PropTypes.shape({
      signMessage: PropTypes.bool,
    }),
  }).isRequired,
  onStart: PropTypes.func.isRequired,
  onResolve: PropTypes.func.isRequired,
  onError: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
};

export default BCUR2TestReader;
