import React, { useState, useRef, useCallback, useMemo } from "react";
import { Box, Button, LinearProgress, Typography, Paper } from "@mui/material";
import { ExtendedPublicKeyData, BCUR2Decoder } from "@caravan/wallets";
import { BitcoinNetwork } from "@caravan/bitcoin";
import { QrReader } from "react-qr-reader";

type ScanMode = "xpub" | "psbt" | "text";

interface BCUR2ReaderBaseProps {
  onStart?: () => void;
  onClear: () => void;
  startText?: string;
  width?: string | number;
  autoStart?: boolean;
}

interface BCUR2ReaderXPubProps extends BCUR2ReaderBaseProps {
  mode: "xpub";
  network: BitcoinNetwork;
  onSuccess: (data: ExtendedPublicKeyData) => void;
}

interface BCUR2ReaderPSBTProps extends BCUR2ReaderBaseProps {
  mode: "psbt";
  onSuccess: (psbt: string) => void;
  network?: BitcoinNetwork; // Optional for PSBT mode
}

// Plain-text mode: forwards the first non-empty raw QR scan to onSuccess
// without going through BCUR2Decoder. Required for airgap flows where the
// device's response is a single bare payload with no UR framing
// (sign-message today; other plain-text exchanges in the future).
// Callers own the semantics of the payload — supply `startText` to label
// what is being scanned. No `network` prop — text mode bypasses the
// decoder and has no network-dependent behavior.
interface BCUR2ReaderTextProps extends BCUR2ReaderBaseProps {
  mode: "text";
  onSuccess: (text: string) => void;
}

type BCUR2ReaderProps =
  | BCUR2ReaderXPubProps
  | BCUR2ReaderPSBTProps
  | BCUR2ReaderTextProps;

// Type-safe decoder function based on mode. Not called for "text" mode,
// which bypasses BCUR2Decoder entirely.
const createDecodeHandler = (mode: ScanMode, network?: BitcoinNetwork) => {
  if (mode === "xpub") {
    return (decoder: BCUR2Decoder) => {
      const data = decoder.getDecodedData(network!);

      if (!data || typeof data === "string") {
        throw new Error("Failed to decode extended public key data.");
      }
      if (!data.bip32Path) {
        throw new Error(
          "BIP32 path is missing in the extended public key data",
        );
      }

      // Ensure the bip32Path starts with "m/"
      const processedData = {
        ...data,
        bip32Path: data.bip32Path.startsWith("m/")
          ? data.bip32Path
          : `m/${data.bip32Path}`,
      };
      return processedData;
    };
  } else {
    return (decoder: BCUR2Decoder) => {
      const data = decoder.getDecodedPSBT();

      if (!data) {
        throw new Error("Failed to decode PSBT data.");
      }
      return data;
    };
  }
};

/**
 * Unified BCUR2 reader component that handles both XPub and PSBT scanning.
 * Uses TypeScript discriminated unions for type safety based on mode.
 */
const BCUR2Reader: React.FC<BCUR2ReaderProps> = (props) => {
  const { onStart, onClear, startText, width = 400, autoStart = false } = props;

  const [isScanning, setIsScanning] = useState(autoStart);
  const [error, setError] = useState<string>("");
  const [progress, setProgress] = useState<string>("");
  const [progressValue, setProgressValue] = useState<number>(0);

  const statusRef = useRef<string>("idle");
  const decoder = useMemo(() => new BCUR2Decoder(), []);

  const decodeHandler = useMemo(
    () =>
      createDecodeHandler(
        props.mode,
        props.mode === "xpub" ? props.network : undefined,
      ),
    [props.mode, props.mode === "xpub" ? props.network : undefined],
  );

  const isTextMode = props.mode === "text";

  const startScanning = useCallback(() => {
    setIsScanning(true);
    setError("");
    setProgress("");
    setProgressValue(0);
    statusRef.current = "scanning";
    decoder.reset();
    onStart?.();
  }, [decoder, onStart]);

  const stopScanning = useCallback(() => {
    setIsScanning(false);
    setProgress("");
    setProgressValue(0);
    statusRef.current = "idle";
    decoder.reset();
    onClear();
  }, [decoder, onClear]);

  const handleScan = useCallback(
    (result: any) => {
      if (!result?.text || statusRef.current !== "scanning") return;

      // Plain-text mode short-circuits the UR decoder: the first
      // non-empty scan is forwarded verbatim to the caller, which is
      // responsible for any envelope/cryptographic validation. Used by
      // airgap sign-message flows whose response is a bare base64 sig.
      // Any exception raised by the caller propagates — it belongs to
      // the caller's flow, not the reader.
      if (isTextMode) {
        statusRef.current = "success";
        setIsScanning(false);
        setProgress("");
        setProgressValue(0);
        decoder.reset();
        (props.onSuccess as (text: string) => void)(result.text);
        return;
      }

      try {
        decoder.receivePart(result.text);

        const currentError = decoder.getError();
        if (currentError) {
          throw new Error(currentError);
        }

        const currentProgress = decoder.getProgress();
        setProgress(currentProgress);

        // Parse progress to get numeric value for progress bar
        // Progress format is typically "X of Y" or "X/Y" or percentage
        const progressMatch = currentProgress.match(
          /(\d+)\s*(?:of|\/)\s*(\d+)/,
        );
        if (progressMatch) {
          const [, current, total] = progressMatch;
          const progressPercent = (parseInt(current) / parseInt(total)) * 100;
          setProgressValue(progressPercent);
        } else {
          // Try to parse as percentage
          const percentMatch = currentProgress.match(/(\d+)%/);
          if (percentMatch) {
            setProgressValue(parseInt(percentMatch[1]));
          }
        }

        if (decoder.isComplete()) {
          const decodedData = decodeHandler(decoder);

          statusRef.current = "success";
          setIsScanning(false);
          setProgress("");
          setProgressValue(0);

          props.onSuccess(decodedData as any); // Type assertion safe due to discriminated union
          decoder.reset();
        }
      } catch (e) {
        statusRef.current = "error";
        setError(e instanceof Error ? e.message : String(e));
        setIsScanning(false);
        setProgress("");
        setProgressValue(0);
      }
    },
    [decoder, decodeHandler, isTextMode, props],
  );

  const getInfoText = () => {
    if (props.mode === "xpub") {
      return "Scan the QR code sequence from your device to import the extended public key.";
    } else if (props.mode === "text") {
      return "Scan the QR code from your device.";
    } else {
      return "Scan the signed PSBT QR code sequence from your device.";
    }
  };

  return (
    <Box display="flex" flexDirection="column" alignItems="center">
      {!isScanning && (
        <Box mb={2}>
          <Button
            variant="contained"
            color="primary"
            size="large"
            onClick={startScanning}
          >
            {startText || `Start ${props.mode.toUpperCase()} Scanning`}
          </Button>
        </Box>
      )}

      {isScanning && (
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          width="100%"
        >
          <Box
            mb={2}
            textAlign="center"
            display="flex"
            flexDirection="column"
            alignItems="center"
          >
            <Typography variant="body1" gutterBottom align="center">
              {getInfoText()}
            </Typography>
            <Paper
              elevation={3}
              sx={{
                width,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  aspectRatio: "1",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <QrReader
                  onResult={handleScan}
                  constraints={{ facingMode: "environment" }}
                  containerStyle={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                  scanDelay={200}
                />
              </Box>

              {/* Progress bar integrated within the camera box */}
              {progress && (
                <Box p={2}>
                  <Typography
                    variant="body2"
                    color="textSecondary"
                    gutterBottom
                    align="center"
                  >
                    {progress}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={progressValue}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: "rgba(76, 175, 80, 0.2)",
                      "& .MuiLinearProgress-bar": {
                        backgroundColor: "#4caf50",
                        borderRadius: 4,
                      },
                    }}
                  />
                </Box>
              )}
            </Paper>
          </Box>

          <Box display="flex" justifyContent="center" mb={2}>
            <Button
              variant="contained"
              color="secondary"
              onClick={stopScanning}
            >
              Stop Scanning
            </Button>
          </Box>
        </Box>
      )}

      {error && (
        <Box mt={2}>
          <Typography variant="body2" color="error">
            {error}
          </Typography>
          <Box display="flex" justifyContent="center" mt={1}>
            <Button variant="contained" color="primary" onClick={stopScanning}>
              Clear Error & Restart
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default BCUR2Reader;
