# Crypto Token Risk API

A paid HTTP API that scores Base tokens for rug-pull, honeypot, and contract security risk. It combines live DEX liquidity data (DexScreener) with on-chain security flags (GoPlus) and settles payments automatically via the x402 protocol.

Designed for **AI agents**, trading bots, and crypto applications that need token-risk data before buying, swapping, transferring, or recommending a token.

## What it does

- **Risk scoring**: 0-100 `riskScore` + `riskRating` (`SAFE` / `CAUTION` / `HIGH_RISK` / `EXTREME_RISK`)
- **Security flags**: honeypot, mintable supply, hidden owner, blacklist, high taxes, and more
- **Liquidity data**: `liquidityUsd`, `volume24hUsd`, `priceUsd`, `priceChange24h`
- **Holder metrics**: `holderCount`, `top10HolderPct`, `lpLocked`
- **x402 payments**: no API keys, no accounts — x402 clients pay $0.002 USDC per request on Base

## Endpoint

```
GET /api/v1/risk-score?tokenAddress=TOKEN_ADDRESS
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `tokenAddress` | string | Base token contract address (required) |

## Pricing

**$0.002 USDC** per request via x402. No subscriptions, no API keys, no accounts.

## Example

```bash
npx agentcash@latest fetch "https://crypto-risk-api-jw3l.onrender.com/api/v1/risk-score?tokenAddress=TOKEN_ADDRESS" -m GET
```

### Example response

```json
{
  "token": "0xAnonymized",
  "symbol": "ANON",
  "riskScore": 45,
  "riskRating": "HIGH_RISK",
  "flags": [
    "Owner can mint new supply",
    "Hidden owner address",
    "Owner can directly change holder balances",
    "Liquidity pool tokens not locked"
  ],
  "liquidityUsd": 4702353.97,
  "volume24hUsd": 211565.06,
  "priceUsd": "0.7602",
  "priceChange24h": -4.3,
  "holderCount": 1021694,
  "top10HolderPct": 0.46,
  "buyTaxPct": 0,
  "sellTaxPct": 0,
  "lpLocked": false,
  "recommendedMaxSlippage": "0.5%",
  "timestamp": 1787731948189
}
```

> **Note**: This is a sample, anonymized response. Real values will vary by token.

## Links

- **Live demo**: https://crypto-risk-api-jw3l.onrender.com/
- **OpenAPI spec**: https://crypto-risk-api-jw3l.onrender.com/openapi.json
- **x402scan listing**: https://www.x402scan.com/server/759444cd-9f4f-4294-9f63-dc6fcb73fbde

## Disclaimer

Risk indicators are informational and do not guarantee that a token is safe or malicious. Always do your own research before making financial decisions.

## Self-hosting

1. `git clone` this repo and `npm install`
2. Copy `.env.example` to `.env` and set:
   - `PAYMENT_WALLET` — your Base wallet address
   - `X402_NETWORK=base-sepolia` for testnet, `base` for mainnet
   - `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` for mainnet (free at [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com/))
3. `npm start`

Deploy to Render or any Node.js host. See `.env.example` for all supported variables.

## Files

- `src/server.js` — Express app + x402 payment middleware + route
- `src/riskEngine.js` — DexScreener + GoPlus scoring logic
- `public/index.html` — static demo page
- `mcp/server.js` — optional MCP server for agent tool-calling
- `.env.example` — required environment variables
