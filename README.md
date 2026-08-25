# Crypto Token Risk API (real x402 payments)

An x402-metered HTTP API that scores a token's rug-pull / honeypot risk by
combining live DEX liquidity (DexScreener) with on-chain contract security
flags (GoPlus). Unlike a "check if a header exists" version, this one uses
the official `x402-express` middleware, which genuinely verifies and settles
payment with a facilitator before your route ever runs.

## 0. Reality check before you build

- This is a genuine, small, working piece of infra. It is **not** a
  guaranteed income stream. The code is the easy 20%; getting agents to
  actually discover and pay for your endpoint is the hard 80%.
- Start on **testnet** (`base-sepolia`) with fake USDC. Only switch to
  mainnet (`base`) once you've verified a real paid call end-to-end.
- Free tiers (DexScreener, GoPlus) are rate-limited and can change without
  notice — don't build something business-critical on them without a
  fallback plan.

## 1. Install the toolchain

1. [Node.js LTS](https://nodejs.org/) (v20+)
2. [Git](https://git-scm.com/)
3. A free [GitHub](https://github.com/) account
4. [VS Code](https://code.visualstudio.com/) (optional but convenient)
5. A Base-compatible wallet you control (e.g. Coinbase Wallet or MetaMask) —
   this is where your USDC earnings land. Write down the public address.

## 2. Get the project running locally

```bash
git clone <your-repo-url> risk-api      # or unzip this folder
cd risk-api
npm install
cp .env.example .env
```

Edit `.env`:

- `PAYMENT_WALLET` — your real wallet address.
- `X402_NETWORK=base-sepolia` — keep this for now (testnet).
- Leave `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` blank for local testnet
  testing against the public facilitator.

Run it:

```bash
npm start
# Micro-API server running on port 3000 (network: base-sepolia)
```

## 3. Confirm the payment gate is real

```bash
curl -i "http://localhost:3000/api/v1/risk-score?tokenAddress=0x4200000000000000000000000000000000000006"
```

You should get back an **HTTP 402** with a JSON `accepts` array describing
the exact payment the facilitator will require (amount, asset, network,
`payTo`). That structured challenge — not a simple "is there a header"
check — is what a real x402 client parses and signs against. Nothing after
this point runs until a facilitator confirms a valid payment.

To test a full paid round trip, use one of Coinbase's example x402 clients
(`x402/examples/typescript/clients/fetch` or `.../axios` in the
[coinbase/x402 repo](https://github.com/coinbase/x402)) pointed at your
local server with testnet USDC from the [CDP faucet](https://portal.cdp.coinbase.com/).

## 4. Get a CDP account for mainnet

1. Sign up at [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com/).
2. Create a project → generate an API key ID + secret.
3. Put them in `.env` as `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET`.
4. Change `X402_NETWORK=base` in `.env` once you're ready for real USDC.

The CDP facilitator handles verifying the client's signed payment and
settling it on-chain to `PAYMENT_WALLET` — you never touch raw blockchain
calls yourself.

## 5. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: x402 token risk API"
```

Create a **private** repo first (it will contain your deployed service's
logic — make it public later if you want, but there's no rush). Push using
the commands GitHub shows you after creating the repo. **Never commit your
`.env` file** — it's already excluded via `.gitignore` below.

## 6. Deploy for free on Render

1. Sign up at [render.com](https://render.com/).
2. **New +** → **Web Service** → connect your GitHub repo.
3. Settings: Environment = Node, Build = `npm install`, Start = `npm start`,
   Instance = Free.
4. Under **Environment Variables**, add `PAYMENT_WALLET`, `X402_NETWORK`,
   `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET` (same values as your `.env`).
5. Deploy. Render gives you a public HTTPS URL — that's your live endpoint.

Free-tier Render services spin down when idle and take a few seconds to
wake on the next request; fine for testing, worth upgrading once you have
real traffic.

## 7. Make the tool discoverable

There are two *separate* discovery paths — don't conflate them:

- **x402-native trading bots**: these discover paid endpoints through the
  facilitator's **Bazaar** listing, not a random `mcp.json` in your repo.
  See the "discoverable" flag in the 402 response above and the Bazaar docs
  in the [coinbase/x402 repo](https://github.com/coinbase/x402) for how to
  get listed.
- **MCP-aware assistants/agent frameworks** (e.g. Claude Desktop, a LangChain
  agent someone configured by hand): these use `mcp/server.js` in this
  project, a real MCP server (built with `@modelcontextprotocol/sdk`), not
  a static manifest file. A human still has to add it to their MCP client
  config — it isn't auto-discovered the way the x402 Bazaar is. Run it with
  `npm run mcp`.

## 8. What I'd validate before spending more time on this

1. One real testnet call, end to end, using an actual x402 client.
2. One real mainnet call for $0.002 of real USDC, to confirm settlement
   lands in your wallet.
3. Only then think about listing, marketing, or scaling — the earlier
   quoted revenue table ($6/mo at 100 calls/day up to $60k/mo at 1M/day)
   is entirely dependent on getting *any* paying traffic, which is the
   actual open problem, not the code.

## Files in this project

- `src/server.js` — Express app + real x402 payment middleware + the route
- `src/riskEngine.js` — DexScreener + GoPlus data fetch and scoring logic
- `mcp/server.js` — optional MCP server for assistant/agent tool-calling
- `.env.example` — required environment variables
