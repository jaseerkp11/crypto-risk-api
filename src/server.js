import express from "express";
import dotenv from "dotenv";
import { paymentMiddleware } from "x402-express";
import { facilitator } from "@coinbase/x402";
import { analyzeToken } from "./riskEngine.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const PAYMENT_WALLET = process.env.PAYMENT_WALLET;
const NETWORK = process.env.X402_NETWORK || "base-sepolia";

if (!PAYMENT_WALLET || PAYMENT_WALLET.includes("YourBaseWalletAddressHere")) {
  console.warn(
    "WARNING: PAYMENT_WALLET is not set in .env — payments will fail until it is."
  );
}

// --- Real x402 payment gate -------------------------------------------------
// This middleware (not a hand-rolled header check) actually:
//   1. Returns HTTP 402 with signed payment requirements if no payment is attached
//   2. Sends the client's payment payload to the facilitator to VERIFY it on-chain
//   3. Settles the payment (moves the USDC to PAYMENT_WALLET) before your route runs
// If verification fails, the middleware short-circuits with an error response —
// your route handler below only ever runs for a genuinely paid request.
app.use(
  paymentMiddleware(
    PAYMENT_WALLET,
    {
      "/api/v1/risk-score": {
        price: "$0.002",
        network: NETWORK, // "base-sepolia" for testing, "base" for real USDC
        config: {
          description:
            "Real-time token risk score, whale concentration, and honeypot check",
        },
      },
    },
    // Use the default public facilitator (https://x402.org/facilitator).
    // This works for base-sepolia testnet without CDP API keys.
    // When you switch to mainnet (X402_NETWORK=base), import the CDP
    // facilitator from @coinbase/x402 and set CDP_API_KEY_ID/SECRET in .env.
       NETWORK === "base" ? facilitator : undefined
  )
);

// --- The actual paid endpoint -----------------------------------------------
app.get("/api/v1/risk-score", async (req, res) => {
  const { tokenAddress } = req.query;

  if (!tokenAddress) {
    return res
      .status(400)
      .json({ error: "Missing required parameter: tokenAddress" });
  }

  try {
    const result = await analyzeToken(tokenAddress);
    return res.status(200).json(result);
  } catch (err) {
    console.error("risk-score error:", err.message);
    return res.status(500).json({ error: "Failed to analyze token" });
  }
});

// Unpaid health check so you (and monitoring) can confirm the server is up
// without spending a micro-payment on every check.
app.get("/health", (req, res) => {
  res.json({ status: "ok", network: NETWORK });
});

app.listen(PORT, () => {
  console.log(`Micro-API server running on port ${PORT} (network: ${NETWORK})`);
});
