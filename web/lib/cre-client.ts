/**
 * CRE Client for Mastra Agent Integration
 *
 *
 * Runs the complete pipeline:
 *   STEP 1 → Chainlink Data Feeds market guard (ETH/USD + USDC/USD)
 *   STEP 2 → Read live APYs from Aave + Compound across chains
 *   STEP 3 → Score pools with World ID human boost + consensus
 *   STEP 4 → Find best effective APY pool
 *   STEP 5 → Return full verdict for Mastra agent / Mini App UI
 */

import { type Address, type Hex, createPublicClient, http } from 'viem'
import { sepolia, baseSepolia } from 'viem/chains'
import { MockPool } from './abi/MockPool'


// ===== Constants =====

const SECONDS_PER_YEAR = BigInt(31_536_000)
const RAY = BigInt(10) ** BigInt(27)
const WAD_TO_RAY_MULTIPLIER = BigInt(10) ** BigInt(9)

// Sepolia Chainlink Data Feed addresses — verified from Chainlink official docs
const DATA_FEEDS = {
	ETH_USD:  '0x694AA1769357215DE4FAC081bf1f309aDC325306',
	USDC_USD: '0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E',
} as const

// AggregatorV3Interface ABI — same as in contracts/abi
const AggregatorV3Interface = [
	{
		type: 'function',
		name: 'decimals',
		inputs: [],
		outputs: [{ name: '', type: 'uint8' }],
		stateMutability: 'view',
	},
	{
		type: 'function',
		name: 'latestRoundData',
		inputs: [],
		outputs: [
			{ name: 'roundId',         type: 'uint80'  },
			{ name: 'answer',          type: 'int256'  },
			{ name: 'startedAt',       type: 'uint256' },
			{ name: 'updatedAt',       type: 'uint256' },
			{ name: 'answeredInRound', type: 'uint80'  },
		],
		stateMutability: 'view',
	},
] as const

const COMET_ABI = [
	{ type: 'function', name: 'totalSupply',   inputs: [],                                          outputs: [{ type: 'uint256' }], stateMutability: 'view' },
	{ type: 'function', name: 'totalBorrow',   inputs: [],                                          outputs: [{ type: 'uint256' }], stateMutability: 'view' },
	{ type: 'function', name: 'getSupplyRate', inputs: [{ name: 'utilization', type: 'uint256' }],  outputs: [{ type: 'uint64'  }], stateMutability: 'view' },
] as const

// ===== Types =====

export interface EVMConfig {
	chainName: string
	protocol: 'aave-v3' | 'compound-v3' | 'morpho-vault'
	poolAddress: string
	assetAddress: string
	protocolSmartWalletAddress: string
	gasLimit: string
	humanPoolId?: string
	humanConsensusCount?: number
	manualAPRRay?: string
}

export interface Pool {
	chainName: string
	protocol: string
	APR: bigint
	APY: number
	protocolSmartWalletAddress: string
	balance: bigint
}

export interface ScoredPool extends Pool {
	effectiveAPY: number
	verifiedBoostBps: number
	consensusBoostBps: number
	humanConsensusCount: number
}

export interface MarketGuard {
	ethUsd: number
	usdcUsd: number
	ethUpdatedAt: number
	usdcUpdatedAt: number
	isStable: boolean
	staleness: boolean
	checkedAt: string
}

export interface YieldVerdict {
	timestamp: string
	// If market guard blocked — only these fields
	rebalanceBlocked?: boolean
	reason?: string
	// If market guard passed — full verdict
	bestPool?: {
		chainName: string
		protocol: string
		aprRay: string
		apy: number
		effectiveAPY: number
		verifiedBoostBps: number
		consensusBoostBps: number
		humanConsensusCount: number
		protocolSmartWalletAddress: string
	}
	rankedPools?: Array<{
		chainName: string
		protocol: string
		aprRay: string
		apy: number
		effectiveAPY: number
		verifiedBoostBps: number
		consensusBoostBps: number
		humanConsensusCount: number
		protocolSmartWalletAddress: string
		balance: string
	}>
	rebalance?: {
		recommendation: string  // human-readable for Mastra agent
		bestChain: string
		bestProtocol: string
		apyDiffBps: number
	}
	humanBoost?: {
		verifiedBoostBps: number
		consensusWeightBpsPer100Humans: number
	}
	marketGuard: MarketGuard
	person1Contracts: {
		worldIdGate: string
		veraYieldVault: string
		mandateStorage: string
		humanConsensus: string
		humanConsensusChainName?: string
	}
}

// ===== Math Helpers =====

const aprInRAYToAPR = (aprRay: bigint): number => Number(aprRay) / Number(RAY)

const aprInRAYToAPY = (aprRay: bigint): number => Math.exp(aprInRAYToAPR(aprRay)) - 1

const bpsToPct = (bps: number): number => bps / 10000

const pctDiffToBps = (maxPct: number, curPct: number): number =>
	Math.max(0, Math.round((maxPct - curPct) * 10000))

// ===== Viem Client Helpers =====

function getViemClientForChain(chainName: string) {
	if (chainName.includes('base')) {
		return createPublicClient({
			chain: baseSepolia,
			transport: http('https://sepolia.base.org'),
		})
	}
	return createPublicClient({
		chain: sepolia,
		transport: http('https://ethereum-sepolia.publicnode.com'),
	})
}

// Sepolia client specifically for Data Feeds
const sepoliaClient = createPublicClient({
	chain: sepolia,
	transport: http('https://ethereum-sepolia.publicnode.com'),
})

// ===== STEP 1: Chainlink Data Feeds Market Guard =====

async function readDataFeed(
	feedAddress: string,
	label: string,
	log: (msg: string) => void,
): Promise<{ price: number; updatedAt: number }> {
	const decimals = await sepoliaClient.readContract({
		address: feedAddress as Address,
		abi: AggregatorV3Interface,
		functionName: 'decimals',
	}) as number

	const roundData = await sepoliaClient.readContract({
		address: feedAddress as Address,
		abi: AggregatorV3Interface,
		functionName: 'latestRoundData',
	}) as readonly [bigint, bigint, bigint, bigint, bigint]
	// [roundId, answer, startedAt, updatedAt, answeredInRound]

	const price = Number(roundData[1]) / Math.pow(10, decimals)
	const updatedAt = Number(roundData[3])

	log(`DataFeed [${label}] price=${price.toFixed(6)} decimals=${decimals} updatedAt=${updatedAt}`)
	return { price, updatedAt }
}

async function checkMarketGuard(log: (msg: string) => void): Promise<MarketGuard> {
	log('Checking Chainlink Data Feeds for market stability...')

	const [eth, usdc] = await Promise.all([
		readDataFeed(DATA_FEEDS.ETH_USD,  'ETH/USD',  log),
		readDataFeed(DATA_FEEDS.USDC_USD, 'USDC/USD', log),
	])

	const nowSec   = Math.floor(Date.now() / 1000)
	const ethAge   = nowSec - eth.updatedAt
	const usdcAge  = nowSec - usdc.updatedAt

	// 24hr threshold for testnet (mainnet would be 3600)
	const staleness  = ethAge > 86400 || usdcAge > 86400
	const usdcPegged = usdc.price >= 0.995
	const ethAlive   = eth.price > 0
	const isStable   = usdcPegged && ethAlive && !staleness

	log(
		`MarketGuard | ETH/USD=$${eth.price.toFixed(2)} (age=${ethAge}s) | USDC/USD=$${usdc.price.toFixed(4)} (age=${usdcAge}s) | pegged=${usdcPegged} | stale=${staleness} | STABLE=${isStable}`,
	)

	return {
		ethUsd: eth.price,
		usdcUsd: usdc.price,
		ethUpdatedAt: eth.updatedAt,
		usdcUpdatedAt: usdc.updatedAt,
		isStable,
		staleness,
		checkedAt: new Date().toISOString(),
	}
}

// ===== STEP 2: Read APYs from pools =====

async function readAaveAPRRay(evmCfg: EVMConfig): Promise<bigint> {
	const client = getViemClientForChain(evmCfg.chainName)
	const reserveData = await client.readContract({
		address: evmCfg.poolAddress as Address,
		abi: MockPool,
		functionName: 'getReserveData',
		args: [evmCfg.assetAddress as Hex],
	}) as any
	return reserveData.currentLiquidityRate as bigint
}

async function readCompoundAPRRay(evmCfg: EVMConfig): Promise<bigint> {
	try {
		const client = getViemClientForChain(evmCfg.chainName)

		const [totalSupply, totalBorrow] = await Promise.all([
			client.readContract({ address: evmCfg.poolAddress as Address, abi: COMET_ABI, functionName: 'totalSupply' }) as Promise<bigint>,
			client.readContract({ address: evmCfg.poolAddress as Address, abi: COMET_ABI, functionName: 'totalBorrow' }) as Promise<bigint>,
		])

		if (totalSupply === BigInt(0)) return BigInt(0)

		const utilization = (totalBorrow * BigInt('1000000000000000000')) / totalSupply
		const supplyRatePerSecond = await client.readContract({
			address: evmCfg.poolAddress as Address,
			abi: COMET_ABI,
			functionName: 'getSupplyRate',
			args: [utilization],
		}) as bigint

		return supplyRatePerSecond * SECONDS_PER_YEAR * WAD_TO_RAY_MULTIPLIER
	} catch {
		if (evmCfg.manualAPRRay) return BigInt(evmCfg.manualAPRRay)
		return BigInt(0)
	}
}

async function readAPRRayForProtocol(evmCfg: EVMConfig): Promise<bigint> {
	switch (evmCfg.protocol) {
		case 'aave-v3':
			return readAaveAPRRay(evmCfg)
		case 'compound-v3':
			return readCompoundAPRRay(evmCfg)
		case 'morpho-vault':
			if (!evmCfg.manualAPRRay) throw new Error(`Morpho requires manualAPRRay for chain ${evmCfg.chainName}`)
			return BigInt(evmCfg.manualAPRRay)
		default:
			throw new Error(`Unsupported protocol: ${evmCfg.protocol}`)
	}
}

async function buildPoolForChain(evmCfg: EVMConfig, log: (msg: string) => void): Promise<Pool> {
	log(`Reading APY for protocol ${evmCfg.protocol} on chain ${evmCfg.chainName} | pool ${evmCfg.poolAddress} | asset ${evmCfg.assetAddress}`)

	let aprRay = BigInt(0)
	try {
		aprRay = await readAPRRayForProtocol(evmCfg)
	} catch (err) {
		log(`APY read failed for ${evmCfg.protocol}/${evmCfg.chainName}: ${err instanceof Error ? err.message : String(err)}`)
		if (evmCfg.manualAPRRay) aprRay = BigInt(evmCfg.manualAPRRay)
	}

	log(`APR in RAY [${evmCfg.chainName}/${evmCfg.protocol}]: ${aprRay}`)

	const apy = aprInRAYToAPY(aprRay)
	const apr = aprInRAYToAPR(aprRay)
	log(`Supply yield [${evmCfg.chainName}] APY%: ${(apy * 100).toFixed(6)}, APR%: ${(apr * 100).toFixed(6)}`)

	return {
		chainName: evmCfg.chainName,
		protocol: evmCfg.protocol,
		APR: aprRay,
		APY: apy,
		protocolSmartWalletAddress: evmCfg.protocolSmartWalletAddress,
		balance: BigInt(0), // balance reads require CRE runtime for aToken — use 0 outside CRE
	}
}

// ===== STEP 3: Score pools with World ID human boost =====

function scorePoolForVerifiedHumans(
	pool: Pool,
	humanConsensusCount: number,
	verifiedBoostBps: number,
	consensusWeightBpsPer100Humans: number,
	log: (msg: string) => void,
): ScoredPool {
	const consensusBoostBps = Math.round((humanConsensusCount / 100) * consensusWeightBpsPer100Humans)
	const effectiveAPY = pool.APY + bpsToPct(verifiedBoostBps + consensusBoostBps)

	log(
		`Human boost [${pool.chainName}/${pool.protocol}] baseAPY%=${(pool.APY * 100).toFixed(4)} verifiedBoostBps=${verifiedBoostBps} consensusCount=${humanConsensusCount} consensusBoostBps=${consensusBoostBps} effectiveAPY%=${(effectiveAPY * 100).toFixed(4)}`,
	)

	return { ...pool, effectiveAPY, verifiedBoostBps, consensusBoostBps, humanConsensusCount }
}

// ===== STEP 4: Find best pool =====

function findBestScoredPool(pools: ScoredPool[], log: (msg: string) => void): ScoredPool {
	let best: ScoredPool | null = null
	for (const p of pools) {
		if (!best || p.effectiveAPY > best.effectiveAPY) {
			best = p
		} else if (best && p.effectiveAPY === best.effectiveAPY) {
			log(`Tie in effective APY between ${best.chainName}/${best.protocol} and ${p.chainName}/${p.protocol}, keeping existing best.`)
		}
	}
	if (!best) throw new Error('No valid pool found')
	return best
}

// ===== Main exported function =====

/**
 * Full workflow verdict for Mastra agent.
 * Runs identical logic to main.ts CRE workflow but using viem outside CRE runtime.
 * Returns complete verdict including MarketGuard, ranked pools, best pool, and rebalance recommendation.
 */
export async function getYieldRecommendation(config: {
	evms: EVMConfig[]
	minBPSDeltaForRebalance: number
	humanBoost: {
		verifiedBoostBps: number
		consensusWeightBpsPer100Humans: number
	}
	person1Contracts: {
		worldIdGate: string
		veraYieldVault: string
		mandateStorage: string
		humanConsensus: string
		humanConsensusChainName?: string
	}
}): Promise<YieldVerdict> {
	const log = (msg: string) => console.log(`[CRE Client] ${msg}`)
	const timestamp = new Date().toISOString()

	// ===== STEP 1: Chainlink Data Feeds — Market Guard =====
	const market = await checkMarketGuard(log)

	if (!market.isStable) {
		const reason = market.staleness
			? 'stale_oracle'
			: `usdc_depeg_${market.usdcUsd.toFixed(4)}`

		log(`⚠️ MarketGuard BLOCKED | reason=${reason} | ETH=$${market.ethUsd.toFixed(2)} | USDC=$${market.usdcUsd.toFixed(4)}`)

		return {
			timestamp,
			rebalanceBlocked: true,
			reason,
			marketGuard: market,
			person1Contracts: config.person1Contracts,
		}
	}

	log(`✅ MarketGuard passed | ETH=$${market.ethUsd.toFixed(2)} | USDC=$${market.usdcUsd.toFixed(4)} — proceeding`)

	// ===== STEP 2: Read APYs from all pools =====
	log('Reading supply APYs...')
	const pools: Pool[] = await Promise.all(config.evms.map((e) => buildPoolForChain(e, log)))

	// ===== STEP 3: Score pools with World ID human boost =====
	const scoredPools: ScoredPool[] = pools.map((pool) => {
		const evmCfg = config.evms.find(
			(e) => e.chainName === pool.chainName && e.protocol === pool.protocol,
		)
		if (!evmCfg) throw new Error(`EVM config not found for ${pool.chainName}/${pool.protocol}`)

		// humanConsensusCount comes from config (onchain read requires CRE runtime)
		const humanConsensusCount = evmCfg.humanConsensusCount ?? 0

		return scorePoolForVerifiedHumans(
			pool,
			humanConsensusCount,
			config.humanBoost.verifiedBoostBps,
			config.humanBoost.consensusWeightBpsPer100Humans,
			log,
		)
	})

	// ===== STEP 4: Find best pool =====
	const bestPool = findBestScoredPool(scoredPools, log)
	log(`Found best effective APY: ${(bestPool.effectiveAPY * 100).toFixed(6)}% on chain ${bestPool.chainName} protocol ${bestPool.protocol}`)

	// ===== STEP 5: Rebalance recommendation =====
	// (Actual CCIP rebalance execution requires CRE runtime — here we return the recommendation)
	const suboptimalPools = scoredPools.filter((p) => p.chainName !== bestPool.chainName)
	const rebalanceNeeded = suboptimalPools.some((p) => {
		const diffBps = pctDiffToBps(bestPool.effectiveAPY, p.effectiveAPY)
		return diffBps >= config.minBPSDeltaForRebalance && p.balance > BigInt(0)
	})

	const apyDiffBps = suboptimalPools.length > 0
		? pctDiffToBps(bestPool.effectiveAPY, suboptimalPools[0].effectiveAPY)
		: 0

	const rebalanceRecommendation = rebalanceNeeded
		? `Move funds to ${bestPool.chainName}/${bestPool.protocol} — ${(bestPool.effectiveAPY * 100).toFixed(2)}% effective APY (${apyDiffBps}bps better)`
		: `Already in best pool: ${bestPool.chainName}/${bestPool.protocol} at ${(bestPool.effectiveAPY * 100).toFixed(2)}% effective APY`

	log(rebalanceRecommendation)

	return {
		timestamp,
		bestPool: {
			chainName: bestPool.chainName,
			protocol: bestPool.protocol,
			aprRay: bestPool.APR.toString(),
			apy: bestPool.APY,
			effectiveAPY: bestPool.effectiveAPY,
			verifiedBoostBps: bestPool.verifiedBoostBps,
			consensusBoostBps: bestPool.consensusBoostBps,
			humanConsensusCount: bestPool.humanConsensusCount,
			protocolSmartWalletAddress: bestPool.protocolSmartWalletAddress,
		},
		rankedPools: scoredPools
			.map((pool) => ({
				chainName: pool.chainName,
				protocol: pool.protocol,
				aprRay: pool.APR.toString(),
				apy: pool.APY,
				effectiveAPY: pool.effectiveAPY,
				verifiedBoostBps: pool.verifiedBoostBps,
				consensusBoostBps: pool.consensusBoostBps,
				humanConsensusCount: pool.humanConsensusCount,
				protocolSmartWalletAddress: pool.protocolSmartWalletAddress,
				balance: pool.balance.toString(),
			}))
			.sort((a, b) => b.effectiveAPY - a.effectiveAPY),
		rebalance: {
			recommendation: rebalanceRecommendation,
			bestChain: bestPool.chainName,
			bestProtocol: bestPool.protocol,
			apyDiffBps,
		},
		humanBoost: config.humanBoost,
		marketGuard: market,
		person1Contracts: config.person1Contracts,
	}
}