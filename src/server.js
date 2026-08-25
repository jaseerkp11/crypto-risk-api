import express from "express";
import dotenv from "dotenv";
import { paymentMiddleware } from "@x402/express";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createCdpAuthHeaders } from "@coinbase/x402";
import { analyzeToken } from "./riskEngine.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const PAYMENT_WALLET = process.env.PAYMENT_WALLET;
const NETWORK = process.env.X402_NETWORK || "base-sepolia";
const CAIP2_NETWORK = NETWORK === "base" ? "eip155:8453" : "eip155:84532";

if (!PAYMENT_WALLET || PAYMENT_WALLET.includes("YourBaseWalletAddressHere")) {
  console.warn(
    "WARNING: PAYMENT_WALLET is not set in .env — payments will fail until it is."
  );
}

// --- Public x402 discovery endpoint -----------------------------------------
// Listed in the x402 Bazaar so agents can discover this resource programmatically.
// No payment required — plain Express route placed BEFORE the payment middleware.
app.get("/.well-known/x402", (_req, res) => {
  res.json({
    version: 1,
    resources: [
      "https://crypto-risk-api-jw3l.onrender.com/api/v1/risk-score"
    ]
  });
});

// --- Public OpenAPI spec for x402 discovery ---------------------------------
// Modern x402 discovery (@agentcash/discovery) reads this spec instead of
// the legacy /.well-known/x402 JSON document.
app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.0.0",
    info: {
      title: "Crypto Token Risk API",
      version: "1.0.0",
      description:
        "Real-time token risk score, whale concentration, and honeypot check",
      contact: {
        email: "poormyraa@gmail.com"
      }
    },
    paths: {
      "/api/v1/risk-score": {
        get: {
          summary: "Get token risk score",
          parameters: [
            {
              name: "tokenAddress",
              in: "query",
              required: true,
              schema: { type: "string" }
            }
          ],
          responses: {
            "200": { description: "Risk score data" },
            "402": { description: "Payment required" }
          },
          "x-payment-info": {
            protocols: ["x402"],
            price: { mode: "fixed", currency: "USD", amount: "0.002" }
          }
        }
      }
    }
  });
});

// --- Real x402 payment gate (v2) ---------------------------------------------
// This middleware (not a hand-rolled header check) actually:
//   1. Returns HTTP 402 with signed payment requirements if no payment is attached
//   2. Sends the client's payment payload to the facilitator to VERIFY it on-chain
//   3. Settles the payment (moves the USDC to PAYMENT_WALLET) before your route runs
// If verification fails, the middleware short-circuits with an error response —
// your route handler below only ever runs for a genuinely paid request.
const createAuthHeaders = createCdpAuthHeaders();

const facilitatorClient = NETWORK === "base"
  ? new HTTPFacilitatorClient({
      url: "https://api.cdp.coinbase.com/platform/v2/x402",
      createAuthHeaders: createAuthHeaders,
    })
  : new HTTPFacilitatorClient({
      url: "https://x402.org/facilitator",
    });

const x402Server = new x402ResourceServer(facilitatorClient);
x402Server.register("eip155:*", new ExactEvmScheme());

app.use(
  paymentMiddleware(
    {
      "GET /api/v1/risk-score": {
        accepts: [
          {
            scheme: "exact",
            payTo: PAYMENT_WALLET,
            price: "$0.002",
            network: CAIP2_NETWORK,
          },
        ],
        description:
          "Real-time token risk score, whale concentration, and honeypot check",
        mimeType: "application/json",
      },
    },
    x402Server
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
