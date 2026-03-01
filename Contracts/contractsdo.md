
WorldIDGate — 0x0bfB6f131A99D5aaA3071618FFBD5bb3ea87C619
The bouncer. Verifies World ID ZK proofs against the WorldIDRouter. Stores used nullifiers so the same human can't verify twice. Marks a wallet as isVerifiedHuman = true after passing. Every other contract should check this before allowing actions.

VeraYieldVault — 0x522748669646A1a099474cd7f98060968A80E812
The ledger. Stores each user's current yield position — how much USDC they deposited, which protocol (e.g. "aave-arbitrum"), their receipt token, and when they deposited. The Mini App reads this to show the dashboard. CRE writes to it after a rebalance.

MandateStorage — 0x94768a15Cd37e07eEcc02eDe47D134A26C1ecB3f
The instruction store. Users write "keep me above 15% APY" here. Stored as basis points (1500 = 15%) per wallet. The CRE cron workflow reads this every 24 hours — if current APY falls below threshold, rebalance triggers automatically. User sets it once and forgets.

HumanConsensus — 0x68283AAa8899A4aA299141ca6f04dF8e5802509f
The trust signal. Counts verified humans per protocol pool. Increments when a verified human deposits into "aave-arbitrum", decrements when they withdraw. Produces the "847 verified humans in Aave Arbitrum" number. The Gemini AI agent reads this to boost confidence scores — bots can never fake this count.