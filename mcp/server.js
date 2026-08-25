// Optional: a REAL MCP server (not just a static mcp.json file) that exposes
// your risk API as a tool to MCP-aware assistants (e.g. Claude Desktop, an
// agent framework). This is a DIFFERENT discovery path from the x402 Bazaar:
//   - x402 Bazaar / facilitator listing -> discovered by autonomous crypto
//     trading bots that pay per call automatically.
//   - This MCP server -> discovered by chat assistants / agent frameworks
//     that a human has configured, via stdio.
// A human (or the agent's own key) still needs to fund calls; this server
// does not sign payments on anyone's behalf.
//
// Run with: npm run mcp
// Then point an MCP client's config at this file, e.g. in Claude Desktop's
// claude_desktop_config.json:
//   "crypto-risk-api": { "command": "node", "args": ["mcp/server.js"] }

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.RISK_API_BASE || "http://localhost:3000";

const server = new McpServer({
  name: "crypto-risk-api",
  version: "1.0.0",
});

server.registerTool(
  "get_token_risk_score",
  {
    title: "Get token risk score",
    description:
      "Check DEX liquidity, contract security flags, and whale concentration for a token before trading it.",
    inputSchema: {
      tokenAddress: z.string().describe("The token's smart contract address"),
    },
  },
  async ({ tokenAddress }) => {
    const res = await fetch(
      `${API_BASE}/api/v1/risk-score?tokenAddress=${encodeURIComponent(tokenAddress)}`
    );

    if (res.status === 402) {
      const body = await res.json().catch(() => ({}));
      return {
        content: [
          {
            type: "text",
            text: `Payment required to call this API: ${JSON.stringify(body)}`,
          },
        ],
        isError: true,
      };
    }

    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
