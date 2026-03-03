# VeraYield AI Agent

AI-powered yield optimization agent built with [Mastra](https://mastra.ai) and [Chainlink Runtime Environment (CRE)](https://chain.link/cre) for the VeraYield platform.

## Overview

The VeraYield AI Agent provides intelligent yield recommendations by:
- **Fetching real-time APY data** from blockchain using Chainlink CRE workflows
- **Reading human consensus** from HumanConsensus.sol contract deployed on World Chain
- **Applying verified human boost scoring** (+1.4% base boost + consensus weight)
- **Generating personalized yield strategies** via Groq LLM (llama-3.3-70b-versatile)
- **Monitoring positions** and alerting users to better opportunities

## Architecture

### CRE Integration
The agent uses **Chainlink Runtime Environment (CRE)** to interact with smart contracts across multiple chains:
- **Aave v3** on Ethereum Sepolia
- **Compound v3** on Base Sepolia
- Real-time APR/APY reading from protocol contracts
- Human consensus count from HumanConsensus contract on World Chain

CRE provides:
- Multi-chain EVM client for contract calls
- CCIP integration for cross-chain rebalancing
- Scheduled cron workflows (every 5 minutes)
- Production-grade contract interaction

### Agent
- **`yieldAgent`**: Main AI agent powered by Groq (llama-3.3-70b-versatile), provides natural language yield advice with real blockchain data

### Tools
- **`creYieldFetcherTool`**: Unified tool that calls CRE workflows to fetch:
  - Real-time APY from Aave/Compound pools
  - Human consensus counts from HumanConsensus contract
  - Scored recommendations with verified human boost

### Workflows
- **`yieldRecommendationWorkflow`**: Complete recommendation pipeline powered by CRE:
  1. **Fetch**: Get real blockchain data via CRE client
  2. **Analyze**: Apply human boost scoring (verified + consensus)
  3. **Recommend**: Format and return best protocol

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment variables:**
```bash
cp .env.example .env
```

Edit `.env` and add your configuration:
```env
GROQ_API_KEY=your_groq_api_key_here
WORLD_CHAIN_RPC=https://worldchain-mainnet.g.alchemy.com/public

# VeraYield Smart Contracts (World Chain)
WORLD_ID_GATE_ADDRESS=0x0bfB6f131A99D5aaA3071618FFBD5bb3ea87C619
VERA_YIELD_VAULT_ADDRESS=0x522748669646A1a099474cd7f98060968A80E812
MANDATE_STORAGE_ADDRESS=0x94768a15Cd37e07eEcc02eDe47D134A26C1ecB3f
HUMAN_CONSENSUS_ADDRESS=0x68283AAa8899A4aA299141ca6f04dF8e5802509f
```

3. **Configure CRE RPC endpoints:**

Edit `/cre/project.yaml` to add your RPC URLs for:
- Ethereum Sepolia (for Aave)
- Base Sepolia (for Compound)
- World Chain (for HumanConsensus)

4. **Run the development server:**
```bash
npm run dev
```

The agent will run on [http://localhost:3001](http://localhost:3001) (frontend runs on port 3000).

## Usage

### Query the Agent

The agent now uses real blockchain data via CRE:

```typescript
import { mastra } from './src/mastra';

const agent = mastra.getAgent('yield-agent');

const response = await agent.generate({
  messages: [
    {
      role: 'user',
      content: 'What's the best yield for my $500 USDC?'
    }
  ]
});

console.log(response.text);
// Agent will call creYieldFetcherTool to get real APY data from contracts
```

### Run the Workflow

```typescript
import { mastra } from './src/mastra';

const workflow = mastra.getWorkflow('yield-recommendation');

const result = await workflow.execute({
  triggerData: {
    asset: 'USDC',
    userAmount: 500
  }
});

console.log(result);
// Returns:
// {
//   message: "🎯 Best Yield: aave-v3 on ethereum-testnet-sepolia...",
//   data: {
//     bestProtocol: "aave-v3",
//     chain: "ethereum-testnet-sepolia",
//     baseAPY: 0.0542,
//     effectiveAPY: 0.0682, // includes verified + consensus boost
//     humanCount: 847,
//     verifiedBoost: 140, // bps
//     consensusBoost: 50,  // bps
//     reasoning: "...",
//     alternatives: [...]
//   }
// }
```

### Direct CRE Client Usage

You can also call the CRE client directly:

```typescript
import { getYieldRecommendation } from './cre/shared/cre-client';

const yieldData = await getYieldRecommendation({
  evms: [...], // EVM configs
  humanBoost: { 
    verifiedBoostBps: 140, 
    consensusWeightBpsPer100Humans: 6 
  },
  person1Contracts: {...}
});

console.log(yieldData.bestPool);
console.log(yieldData.rankedPools);
```

## Smart Contracts

The agent interacts with deployed contracts:

### World Chain (Human Consensus)
| Contract | Address |
|---|---|
| HumanConsensus | `0x68283AAa8899A4aA299141ca6f04dF8e5802509f` |
| VeraYieldVault | `0x522748669646A1a099474cd7f98060968A80E812` |
| MandateStorage | `0x94768a15Cd37e07eEcc02eDe47D134A26C1ecB3f` |
| WorldIDGate | `0x0bfB6f131A99D5aaA3071618FFBD5bb3ea87C619` |

### Protocol Pools (via CRE)
| Protocol | Chain | Pool Address |
|---|---|---|
| Aave v3 | Ethereum Sepolia | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` |
| Compound v3 | Base Sepolia | `0xb125E6687d4313864e53df431d5425969c15Eb2F` |

## Development

**Project structure:**
```
src/mastra/
├── agents/
│   └── yield-agent.ts                    # Main AI agent (uses CRE tool)
├── tools/
│   └── cre-yield-fetcher-tool.ts        # Unified CRE integration
├── workflows/
│   └── yield-recommendation-workflow.ts  # Full pipeline with CRE
└── index.ts                              # Mastra configuration

/cre/
├── shared/
│   └── cre-client.ts                     # Shared CRE functions
├── my-workflow/
│   ├── main.ts                           # CRE workflow (cron-based rebalancing)
│   ├── config.json                       # Protocol configs & human boost settings
│   └── workflow.yaml                     # CRE workflow settings
└── project.yaml                          # RPC endpoints
```

## Human Boost Scoring

The agent applies a verified human boost system:

**Base Formula:**
```
Effective APY = Base APY + Verified Boost + Consensus Boost
```

**Verified Boost:** +140 BPS (1.4%) for all verified humans

**Consensus Boost:** +6 BPS per 100 humans in the protocol
```
Consensus Boost = (Human Count / 100) * 6 BPS
```

**Example:**
- Aave Base APY: 5.42%
- Verified Boost: +1.40%
- Consensus (847 humans): +5.08%
- **Effective APY: 11.90%**

This rewards protocols that gain trust from verified humans collectively.

## CRE Workflow Integration

The agent and CRE workflow work together:

1. **Agent (on-demand)**: User asks for recommendation → Agent calls CRE client → Returns real-time data
2. **CRE Workflow (scheduled)**: Runs every 5 minutes → Checks APY changes → Auto-rebalances if threshold exceeded (50 BPS)

Both use the same `/cre/shared/cre-client.ts` module for consistency.

## Production Checklist

- [x] Real APY data from protocol contracts via CRE
- [x] Human consensus reading from HumanConsensus.sol
- [x] Verified human boost scoring implementation
- [x] Multi-chain support (Sepolia, Base Sepolia)
- [x] Groq LLM integration for natural language
- [ ] Production RPC endpoints (currently using public/testnet)
- [ ] CCIP cross-chain rebalancing (CRE workflow ready)
- [ ] Rate limiting and caching
- [ ] Monitoring and alerting
- [ ] Frontend integration with Mini App

## Learn More

- [Mastra Documentation](https://mastra.ai/docs)
- [Chainlink CRE Documentation](https://docs.chain.link/cre)
- [VeraYield Project Overview](../README.md)
- [Next.js Documentation](https://nextjs.org/docs)

