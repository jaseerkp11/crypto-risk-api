import axios from "axios";

// Base mainnet chain id, used for the GoPlus lookup.
// Change this (or make it a query param) if you want to support other chains.
const GOPLUS_CHAIN_ID = "8453";

/**
 * Pulls live liquidity/volume data from DexScreener (free, no key required).
 */
async function getDexData(tokenAddress) {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
  const { data } = await axios.get(url, { timeout: 8000 });
  const pairs = data?.pairs || [];
  if (pairs.length === 0) return null;

  // Use the pair with the deepest liquidity, not just the first one returned.
  const mainPair = pairs.reduce((best, p) =>
    (p.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? p : best
  );

  return {
    symbol: mainPair.baseToken?.symbol || "UNKNOWN",
    priceUsd: mainPair.priceUsd,
    liquidityUsd: mainPair.liquidity?.usd || 0,
    volume24hUsd: mainPair.volume?.h24 || 0,
    priceChange24h: mainPair.priceChange?.h24 ?? null,
    pairCount: pairs.length,
    dexId: mainPair.dexId,
  };
}

/**
 * Pulls contract-level security flags from GoPlus (free tier, optional key).
 * Docs: https://docs.gopluslabs.io/reference/token-security-api
 */
async function getContractSecurity(tokenAddress) {
  const url = `https://api.gopluslabs.io/api/v1/token_security/${GOPLUS_CHAIN_ID}`;
  const params = { contract_addresses: tokenAddress.toLowerCase() };
  if (process.env.GOPLUS_APP_KEY) {
    // GoPlus key/secret auth is optional and only raises your rate limit;
    // see their docs if you want to add the signed-auth flow.
    params.app_key = process.env.GOPLUS_APP_KEY;
  }

  const { data } = await axios.get(url, { params, timeout: 8000 });
  const result = data?.result?.[tokenAddress.toLowerCase()];
  if (!result) return null;

  const topHolderPct = (result.holders || [])
    .filter((h) => !h.is_locked || h.is_locked === "0")
    .slice(0, 10)
    .reduce((sum, h) => sum + parseFloat(h.percent || "0"), 0);

  return {
    isOpenSource: result.is_open_source === "1",
    isHoneypot: result.is_honeypot === "1",
    isMintable: result.is_mintable === "1",
    isProxy: result.is_proxy === "1",
    hiddenOwner: result.hidden_owner === "1",
    canTakeBackOwnership: result.can_take_back_ownership === "1",
    ownerChangeBalance: result.owner_change_balance === "1",
    transferPausable: result.transfer_pausable === "1",
    isBlacklisted: result.is_blacklisted === "1",
    buyTax: parseFloat(result.buy_tax || "0"),
    sellTax: parseFloat(result.sell_tax || "0"),
    holderCount: parseInt(result.holder_count || "0", 10),
    top10HolderPct: Number(topHolderPct.toFixed(2)),
    lpLocked: (result.lp_holders || []).some(
      (lp) => lp.is_locked === 1 || lp.is_locked === "1"
    ),
  };
}

/**
 * Combines liquidity data + contract security flags into one composite score.
 * This is a starting heuristic, not financial advice -- tune the weights
 * against tokens you already know are safe/scammy before trusting it.
 */
function scoreToken(dex, security) {
  let score = 100;
  const flags = [];

  if (!dex) {
    return { score: 0, rating: "NO_LIQUIDITY", flags: ["No DEX pair found"] };
  }

  // --- Liquidity / volume signals ---
  if (dex.liquidityUsd < 5000) {
    score -= 35;
    flags.push("Liquidity under $5k");
  } else if (dex.liquidityUsd < 25000) {
    score -= 20;
    flags.push("Liquidity under $25k");
  } else if (dex.liquidityUsd < 75000) {
    score -= 8;
  }

  if (dex.volume24hUsd < 1000) {
    score -= 10;
    flags.push("Very low 24h volume");
  }

  // --- Contract security signals ---
  if (security) {
    if (security.isHoneypot) {
      score -= 100;
      flags.push("Flagged as honeypot (cannot sell)");
    }
    if (!security.isOpenSource) {
      score -= 15;
      flags.push("Contract not verified/open source");
    }
    if (security.isMintable) {
      score -= 10;
      flags.push("Owner can mint new supply");
    }
    if (security.hiddenOwner) {
      score -= 15;
      flags.push("Hidden owner address");
    }
    if (security.canTakeBackOwnership) {
      score -= 10;
      flags.push("Ownership can be reclaimed after renouncing");
    }
    if (security.ownerChangeBalance) {
      score -= 20;
      flags.push("Owner can directly change holder balances");
    }
    if (security.transferPausable) {
      score -= 10;
      flags.push("Transfers can be paused");
    }
    if (security.isBlacklisted) {
      score -= 15;
      flags.push("Blacklist function present");
    }
    if (security.buyTax > 10 || security.sellTax > 10) {
      score -= 15;
      flags.push(`High tax (buy ${security.buyTax}% / sell ${security.sellTax}%)`);
    }
    if (security.top10HolderPct > 50) {
      score -= 20;
      flags.push(`Top 10 wallets hold ${security.top10HolderPct}% of supply`);
    } else if (security.top10HolderPct > 30) {
      score -= 10;
      flags.push(`Top 10 wallets hold ${security.top10HolderPct}% of supply`);
    }
    if (!security.lpLocked) {
      score -= 10;
      flags.push("Liquidity pool tokens not locked");
    }
  } else {
    score -= 10;
    flags.push("Contract security data unavailable");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let rating = "SAFE";
  if (score < 30) rating = "EXTREME_RISK";
  else if (score < 55) rating = "HIGH_RISK";
  else if (score < 75) rating = "CAUTION";

  return { score, rating, flags };
}

export async function analyzeToken(tokenAddress) {
  const [dex, security] = await Promise.all([
    getDexData(tokenAddress).catch(() => null),
    getContractSecurity(tokenAddress).catch(() => null),
  ]);

  const { score, rating, flags } = scoreToken(dex, security);

  return {
    token: tokenAddress,
    symbol: dex?.symbol || null,
    riskScore: score,
    riskRating: rating,
    flags,
    liquidityUsd: dex?.liquidityUsd ?? null,
    volume24hUsd: dex?.volume24hUsd ?? null,
    priceUsd: dex?.priceUsd ?? null,
    priceChange24h: dex?.priceChange24h ?? null,
    holderCount: security?.holderCount ?? null,
    top10HolderPct: security?.top10HolderPct ?? null,
    buyTaxPct: security?.buyTax ?? null,
    sellTaxPct: security?.sellTax ?? null,
    lpLocked: security?.lpLocked ?? null,
    recommendedMaxSlippage: (dex?.liquidityUsd ?? 0) < 50000 ? "2.5%" : "0.5%",
    timestamp: Date.now(),
  };
}
