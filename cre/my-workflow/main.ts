import {
	bytesToHex,
	type CronPayload,
	cre,
	encodeCallMsg,
	EVMClient,
	getNetwork,
	hexToBase64,
	LATEST_BLOCK_NUMBER,
	Runner,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import {
	type Address,
	decodeFunctionResult,
	encodeAbiParameters,
	encodeFunctionData,
	formatUnits,
	Hex,
	parseAbiParameters,
	zeroAddress,
} from 'viem'
import { z } from 'zod'
import { HumanConsensus, MockPool, AggregatorV3Interface } from '../contracts/abi'

const SUPPORTED_PROTOCOLS = ['aave-v3', 'compound-v3', 'morpho-vault'] as const
const protocolSchema = z.enum(SUPPORTED_PROTOCOLS)
type Protocol = (typeof SUPPORTED_PROTOCOLS)[number]

const configSchema = z.object({
	schedule: z.string(),
	minBPSDeltaForRebalance: z.number().min(0),
	userNullifier: z.string().optional(),
	humanBoost: z.object({
		verifiedBoostBps: z.number().min(0),
		consensusWeightBpsPer100Humans: z.number().min(0),
	}),
	person1Contracts: z.object({
		worldIdGate: z.string(),
		veraYieldVault: z.string(),
		mandateStorage: z.string(),
		humanConsensus: z.string(),
		humanConsensusChainName: z.string().optional(),
	}),
	evms: z.array(
		z.object({
			protocol: protocolSchema,
			assetAddress: z.string(),
			poolAddress: z.string(),
			protocolSmartWalletAddress: z.string(),
			chainName: z.string(),
			gasLimit: z.string(),
			manualAPRRay: z.string().optional(),
			humanPoolId: z.string().optional(),
			humanConsensusCount: z.number().min(0).optional(),
		}),
	),
})

type Config = z.infer<typeof configSchema>
type EVMConfig = z.infer<typeof configSchema.shape.evms.element>

/** ===== Math Helpers ===== **/

const aprInRAYToAPR = (apr: bigint): number => parseFloat(formatUnits(apr, 27))
const aprInRAYToAPY = (apr: bigint): number => Math.exp(parseFloat(formatUnits(apr, 27))) - 1
const RAY_TO_BPS_DIVISOR = 100000000000000000000000n
const aprDiffToBps = (diffRay: bigint): bigint => diffRay / RAY_TO_BPS_DIVISOR
const WAD_TO_RAY_MULTIPLIER = 1000000000n
const SECONDS_PER_YEAR = 31536000n
const bpsToPct = (bps: number): number => bps / 10000
const pctDiffToBps = (maxPct: number, curPct: number): number =>
	Math.max(0, Math.round((maxPct - curPct) * 10000))

/** ===== Domain Types ===== **/

type Pool = {
	chainName: string
	protocol: Protocol
	APR: bigint
	APY: number
	protocolSmartWalletAddress: string
	balance: bigint
}

type ScoredPool = Pool & {
	humanConsensusCount: number
	verifiedBoostBps: number
	consensusBoostBps: number
	effectiveAPY: number
}

type MarketGuard = {
	ethUsd: number
	usdcUsd: number
	ethUpdatedAt: number
	usdcUpdatedAt: number
	isStable: boolean
	staleness: boolean
}

/** ===== Chainlink Data Feeds ===== **/

// Sepolia testnet addresses — verified from Chainlink official docs
const DATA_FEEDS = {
	ETH_USD:  '0x694AA1769357215DE4FAC081bf1f309aDC325306',
	USDC_USD: '0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E',
} as const

const readDataFeed = (
	runtime: Runtime<Config>,
	feedAddress: string,
	label: string,
): { price: number; updatedAt: number; decimals: number } => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: 'ethereum-testnet-sepolia',
		isTestnet: true,
	})
	if (!network) throw new Error('Sepolia network not found for Data Feed read')

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)

	// 1) Read decimals
	const decimalsCall = encodeFunctionData({
		abi: AggregatorV3Interface,
		functionName: 'decimals',
	})
	const decimalsResult = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: feedAddress as Address, data: decimalsCall }),
			blockNumber: LATEST_BLOCK_NUMBER,
		})
		.result()
	const decimals = Number(
		decodeFunctionResult({
			abi: AggregatorV3Interface,
			functionName: 'decimals',
			data: bytesToHex(decimalsResult.data),
		}) as unknown as bigint,
	)

	// 2) Read latestRoundData
	const roundCall = encodeFunctionData({
		abi: AggregatorV3Interface,
		functionName: 'latestRoundData',
	})
	const roundResult = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: feedAddress as Address, data: roundCall }),
			blockNumber: LATEST_BLOCK_NUMBER,
		})
		.result()
	const roundData = decodeFunctionResult({
    abi: AggregatorV3Interface,
    functionName: 'latestRoundData',
    data: bytesToHex(roundResult.data),
}) as readonly [bigint, bigint, bigint, bigint, bigint]
// [roundId, answer, startedAt, updatedAt, answeredInRound]

const price = Number(roundData[1]) / Math.pow(10, decimals)
const updatedAt = Number(roundData[3])

	runtime.log(
		`DataFeed [${label}] price=${price.toFixed(6)} decimals=${decimals} updatedAt=${updatedAt}`,
	)

	return { price, updatedAt, decimals }
}

const checkMarketGuard = (runtime: Runtime<Config>): MarketGuard => {
	runtime.log('Checking Chainlink Data Feeds for market stability...')

	const eth  = readDataFeed(runtime, DATA_FEEDS.ETH_USD,  'ETH/USD')
	const usdc = readDataFeed(runtime, DATA_FEEDS.USDC_USD, 'USDC/USD')

	const nowSec   = Math.floor(Date.now() / 1000)
	const ethAge   = nowSec - eth.updatedAt
	const usdcAge  = nowSec - usdc.updatedAt
	// was: const staleness = ethAge > 3600 || usdcAge > 3600
	const staleness = ethAge > 86400 || usdcAge > 86400  // 24 hours for testnet

	// USDC depeg guard: below $0.995 = danger zone
	const usdcPegged = usdc.price >= 0.995
	const ethAlive   = eth.price > 0
	const isStable   = usdcPegged && ethAlive && !staleness

	runtime.log(
		`MarketGuard | ETH/USD=$${eth.price.toFixed(2)} (age=${ethAge}s) | USDC/USD=$${usdc.price.toFixed(4)} (age=${usdcAge}s) | pegged=${usdcPegged} | stale=${staleness} | STABLE=${isStable}`,
	)

	return {
		ethUsd: eth.price,
		usdcUsd: usdc.price,
		ethUpdatedAt: eth.updatedAt,
		usdcUpdatedAt: usdc.updatedAt,
		isStable,
		staleness,
	}
}

/** ===== EVM/Contract Helpers ===== **/

const getEvmClientForChain = (evmCfg: EVMConfig) => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: evmCfg.chainName,
		isTestnet: true,
	})
	if (!network) {
		throw new Error(`Network not found for chain selector name: ${evmCfg.chainName}`)
	}
	return new cre.capabilities.EVMClient(network.chainSelector.selector)
}

const readCurrentLiquidityRate = (
	runtime: Runtime<Config>,
	evmCfg: EVMConfig,
	evmClient: EVMClient,
): bigint => {
	const callData = encodeFunctionData({
		abi: MockPool,
		functionName: 'getReserveData',
		args: [evmCfg.assetAddress as Hex],
	})

	const callResult = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: evmCfg.poolAddress as Address,
				data: callData,
			}),
			blockNumber: LATEST_BLOCK_NUMBER,
		})
		.result()

	const reserveData = decodeFunctionResult({
		abi: MockPool,
		functionName: 'getReserveData',
		data: bytesToHex(callResult.data),
	})

	return reserveData.currentLiquidityRate as bigint
}

const readCompoundAPRRay = (
	runtime: Runtime<Config>,
	evmCfg: EVMConfig,
	evmClient: EVMClient,
): bigint => {
	try {
		const cometAbi = [
			{
				type: 'function',
				name: 'totalSupply',
				inputs: [],
				outputs: [{ type: 'uint256' }],
				stateMutability: 'view',
			},
			{
				type: 'function',
				name: 'totalBorrow',
				inputs: [],
				outputs: [{ type: 'uint256' }],
				stateMutability: 'view',
			},
			{
				type: 'function',
				name: 'getSupplyRate',
				inputs: [{ name: 'utilization', type: 'uint256' }],
				outputs: [{ type: 'uint64' }],
				stateMutability: 'view',
			},
		] as const

		const supplyCall = encodeFunctionData({ abi: cometAbi, functionName: 'totalSupply' })
		const supplyResult = evmClient
			.callContract(runtime, {
				call: encodeCallMsg({ from: zeroAddress, to: evmCfg.poolAddress as Address, data: supplyCall }),
				blockNumber: LATEST_BLOCK_NUMBER,
			})
			.result()
		const totalSupply = decodeFunctionResult({
			abi: cometAbi,
			functionName: 'totalSupply',
			data: bytesToHex(supplyResult.data),
		}) as bigint

		const borrowCall = encodeFunctionData({ abi: cometAbi, functionName: 'totalBorrow' })
		const borrowResult = evmClient
			.callContract(runtime, {
				call: encodeCallMsg({ from: zeroAddress, to: evmCfg.poolAddress as Address, data: borrowCall }),
				blockNumber: LATEST_BLOCK_NUMBER,
			})
			.result()
		const totalBorrow = decodeFunctionResult({
			abi: cometAbi,
			functionName: 'totalBorrow',
			data: bytesToHex(borrowResult.data),
		}) as bigint

		if (totalSupply === BigInt(0)) {
			runtime.log(`Compound pool empty, returning APR=0`)
			return BigInt(0)
		}

		const utilization = (totalBorrow * BigInt(1000000000000000000)) / totalSupply

		const rateCall = encodeFunctionData({
			abi: cometAbi,
			functionName: 'getSupplyRate',
			args: [utilization],
		})
		const rateResult = evmClient
			.callContract(runtime, {
				call: encodeCallMsg({ from: zeroAddress, to: evmCfg.poolAddress as Address, data: rateCall }),
				blockNumber: LATEST_BLOCK_NUMBER,
			})
			.result()
		const supplyRatePerSecondWad = decodeFunctionResult({
			abi: cometAbi,
			functionName: 'getSupplyRate',
			data: bytesToHex(rateResult.data),
		}) as bigint

		const annualRateWad = supplyRatePerSecondWad * SECONDS_PER_YEAR
		const annualRateRay = annualRateWad * WAD_TO_RAY_MULTIPLIER

		runtime.log(
			`Compound rate [${evmCfg.chainName}] totalSupply=${totalSupply} totalBorrow=${totalBorrow} utilization=${utilization} APR_RAY=${annualRateRay}`,
		)

		return annualRateRay
	} catch (error) {
		runtime.log(
			`Compound adapter fallback [${evmCfg.chainName}] primary call failed: ${
				error instanceof Error ? error.message : String(error)
			}`,
		)

		if (evmCfg.manualAPRRay) {
			const aprRay = BigInt(evmCfg.manualAPRRay)
			runtime.log(`Compound adapter fallback [${evmCfg.chainName}] using manualAPRRay=${aprRay}`)
			return aprRay
		}

		throw new Error(`Compound APR read failed`)
	}
}

const readMorphoAPRRay = (runtime: Runtime<Config>, evmCfg: EVMConfig): bigint => {
	if (!evmCfg.manualAPRRay) {
		throw new Error(
			`Morpho adapter requires manualAPRRay for now (chain ${evmCfg.chainName}). Provide it in config until Morpho onchain rate ABI is integrated.`,
		)
	}
	const aprRay = BigInt(evmCfg.manualAPRRay)
	runtime.log(`Morpho fallback APR [${evmCfg.chainName}] from config manualAPRRay=${aprRay}`)
	return aprRay
}

const readAPRRayForProtocol = (
	runtime: Runtime<Config>,
	evmCfg: EVMConfig,
	evmClient: EVMClient,
): bigint => {
	switch (evmCfg.protocol) {
		case 'aave-v3':
			return readCurrentLiquidityRate(runtime, evmCfg, evmClient)
		case 'compound-v3':
			return readCompoundAPRRay(runtime, evmCfg, evmClient)
		case 'morpho-vault':
			return readMorphoAPRRay(runtime, evmCfg)
		default:
			throw new Error(`Unsupported protocol for APY read: ${evmCfg.protocol}`)
	}
}

const readBalanceInPool = (
	runtime: Runtime<Config>,
	evmCfg: EVMConfig,
	evmClient: EVMClient,
): bigint => {
	if (evmCfg.protocol === 'compound-v3') {
		const abi = [
			{
				type: 'function',
				name: 'balanceOf',
				inputs: [{ name: 'account', type: 'address' }],
				outputs: [{ name: '', type: 'uint256' }],
				stateMutability: 'view',
			},
		] as const

		const callData = encodeFunctionData({
			abi,
			functionName: 'balanceOf',
			args: [evmCfg.protocolSmartWalletAddress as Hex],
		})
		const callResult = evmClient
			.callContract(runtime, {
				call: encodeCallMsg({ from: zeroAddress, to: evmCfg.poolAddress as Address, data: callData }),
				blockNumber: LATEST_BLOCK_NUMBER,
			})
			.result()
		return decodeFunctionResult({
			abi,
			functionName: 'balanceOf',
			data: bytesToHex(callResult.data),
		}) as bigint
	}

	// Aave V3 — get aToken address first, then balanceOf
	const reserveCall = encodeFunctionData({
		abi: MockPool,
		functionName: 'getReserveData',
		args: [evmCfg.assetAddress as Hex],
	})
	const reserveResult = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: evmCfg.poolAddress as Address, data: reserveCall }),
			blockNumber: LATEST_BLOCK_NUMBER,
		})
		.result()
	const reserveData = decodeFunctionResult({
		abi: MockPool,
		functionName: 'getReserveData',
		data: bytesToHex(reserveResult.data),
	})
	const aToken = reserveData.aTokenAddress

	const erc20Abi = [
		{
			type: 'function',
			name: 'balanceOf',
			inputs: [{ name: 'account', type: 'address' }],
			outputs: [{ name: '', type: 'uint256' }],
			stateMutability: 'view',
		},
	] as const

	const callData = encodeFunctionData({
		abi: erc20Abi,
		functionName: 'balanceOf',
		args: [evmCfg.protocolSmartWalletAddress as Hex],
	})
	const balanceResult = evmClient
		.callContract(runtime, {
			call: encodeCallMsg({ from: zeroAddress, to: aToken as Address, data: callData }),
			blockNumber: LATEST_BLOCK_NUMBER,
		})
		.result()
	return decodeFunctionResult({
		abi: erc20Abi,
		functionName: 'balanceOf',
		data: bytesToHex(balanceResult.data),
	}) as bigint
}

const buildPoolForChain = (runtime: Runtime<Config>, evmCfg: EVMConfig): Pool => {
	runtime.log(
		`Reading APY for protocol ${evmCfg.protocol} on chain ${evmCfg.chainName} | pool ${evmCfg.poolAddress} | asset ${evmCfg.assetAddress}`,
	)

	const evmClient = getEvmClientForChain(evmCfg)
	const currentLiquidityRate = readAPRRayForProtocol(runtime, evmCfg, evmClient)
	runtime.log(`APR in RAY [${evmCfg.chainName}/${evmCfg.protocol}]: ${currentLiquidityRate}`)

	const balanceInPool = readBalanceInPool(runtime, evmCfg, evmClient)
	runtime.log(`Balance in pool [${evmCfg.chainName}]: ${balanceInPool}`)

	const apy = aprInRAYToAPY(currentLiquidityRate)
	const apr = aprInRAYToAPR(currentLiquidityRate)
	runtime.log(
		`Supply yield [${evmCfg.chainName}] APY%: ${(apy * 100).toFixed(6)}, APR%: ${(apr * 100).toFixed(6)}`,
	)

	return {
		chainName: evmCfg.chainName,
		protocol: evmCfg.protocol,
		APR: currentLiquidityRate,
		APY: apy,
		protocolSmartWalletAddress: evmCfg.protocolSmartWalletAddress,
		balance: balanceInPool,
	}
}

const scorePoolForVerifiedHumans = (
	pool: Pool,
	humanConsensusCount: number,
	config: Config,
	runtime: Runtime<Config>,
): ScoredPool => {
	const verifiedBoostBps = config.humanBoost.verifiedBoostBps
	const consensusBoostBps = Math.round(
		(humanConsensusCount / 100) * config.humanBoost.consensusWeightBpsPer100Humans,
	)
	const effectiveAPY = pool.APY + bpsToPct(verifiedBoostBps + consensusBoostBps)

	runtime.log(
		`Human boost [${pool.chainName}/${pool.protocol}] baseAPY%=${(pool.APY * 100).toFixed(4)} verifiedBoostBps=${verifiedBoostBps} consensusCount=${humanConsensusCount} consensusBoostBps=${consensusBoostBps} effectiveAPY%=${(effectiveAPY * 100).toFixed(4)}`,
	)

	return { ...pool, humanConsensusCount, verifiedBoostBps, consensusBoostBps, effectiveAPY }
}

const findBestScoredPool = (pools: ScoredPool[], log: (m: string) => void): ScoredPool => {
	let best: ScoredPool | null = null
	for (const p of pools) {
		if (!best || p.effectiveAPY > best.effectiveAPY) {
			best = p
		} else if (best && p.effectiveAPY === best.effectiveAPY) {
			log(
				`Found tie in effective APY between ${best.chainName}/${best.protocol} and ${p.chainName}/${p.protocol}, keeping existing best.`,
			)
		}
	}
	if (!best || best.effectiveAPY <= 0) throw new Error('Best effective APY unset or <= 0')
	return best
}

const getChainSelectorFor = (chainName: string): bigint => {
	const network = getNetwork({ chainFamily: 'evm', chainSelectorName: chainName, isTestnet: true })
	if (!network) throw new Error(`Could not find network for chain ${chainName}`)
	return network.chainSelector.selector
}

const readHumanConsensusCount = (
	runtime: Runtime<Config>,
	config: Config,
	evmCfg: EVMConfig,
): number => {
	const fallbackCount = evmCfg.humanConsensusCount ?? 0
	if (!evmCfg.humanPoolId) {
		runtime.log(
			`HumanConsensus fallback [${evmCfg.chainName}/${evmCfg.protocol}] missing humanPoolId, using configured count=${fallbackCount}`,
		)
		return fallbackCount
	}

	const consensusChain = config.person1Contracts.humanConsensusChainName ?? evmCfg.chainName
	const network = getNetwork({ chainFamily: 'evm', chainSelectorName: consensusChain, isTestnet: true })

	if (!network) {
		runtime.log(
			`HumanConsensus fallback [${evmCfg.chainName}/${evmCfg.protocol}] unknown chain ${consensusChain}, using configured count=${fallbackCount}`,
		)
		return fallbackCount
	}

	try {
		const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
		const callData = encodeFunctionData({
			abi: HumanConsensus,
			functionName: 'getHumanCount',
			args: [evmCfg.humanPoolId],
		})
		const callResult = evmClient
			.callContract(runtime, {
				call: encodeCallMsg({
					from: zeroAddress,
					to: config.person1Contracts.humanConsensus as Address,
					data: callData,
				}),
				blockNumber: LATEST_BLOCK_NUMBER,
			})
			.result()
		const decoded = decodeFunctionResult({
			abi: HumanConsensus,
			functionName: 'getHumanCount',
			data: bytesToHex(callResult.data),
		}) as bigint

		const count = Number(decoded)
		runtime.log(
			`HumanConsensus onchain [${evmCfg.chainName}/${evmCfg.protocol}] poolId=${evmCfg.humanPoolId} count=${count}`,
		)
		return Number.isFinite(count) ? count : fallbackCount
	} catch (error) {
		runtime.log(
			`HumanConsensus fallback [${evmCfg.chainName}/${evmCfg.protocol}] onchain read failed: ${
				error instanceof Error ? error.message : String(error)
			}. Using configured count=${fallbackCount}`,
		)
		return fallbackCount
	}
}

const verifyUserNullifier = (
	runtime: Runtime<Config>,
	config: Config,
	nullifier: string | undefined,
): { verified: boolean; reason: string } => {
	if (!nullifier) {
		return { verified: false, reason: 'No nullifier provided' }
	}

	// Basic nullifier format validation
	const isValidFormat = (
		nullifier.startsWith('0x') && /^0x[a-fA-F0-9]{64}$/.test(nullifier)
	) || /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(nullifier)

	if (!isValidFormat) {
		return { verified: false, reason: 'Invalid nullifier format (expected hex or UUID)' }
	}

	// TODO: Check against WorldIDGate.isVerifiedHuman or HumanConsensus contract
	// For now, we accept any properly formatted nullifier as verified
	// In production, you would:
	// 1. Convert nullifier to uint256 hash if needed
	// 2. Call WorldIDGate.nullifierUsed[hash] or addressNullifier mapping
	// 3. Or check HumanConsensus for this specific user

	runtime.log(`✓ User nullifier format validated: ${nullifier.slice(0, 20)}...`)
	return { verified: true, reason: 'Nullifier format valid (onchain verification pending)' }
}

const shouldRebalanceByEffectiveAPY = (
	maxEffectiveAPY: number,
	curEffectiveAPY: number,
	minBpsDelta: number,
): { ok: boolean; diffBps: number } => {
	const diffBps = pctDiffToBps(maxEffectiveAPY, curEffectiveAPY)
	return { ok: diffBps >= minBpsDelta, diffBps }
}

const performRebalance = (
	runtime: Runtime<Config>,
	evmCfg: EVMConfig,
	amount: bigint,
	bestChainSelector: bigint,
	bestProtocolSmartWallet: string,
): void => {
	const evmClient = getEvmClientForChain(evmCfg)

	const reportData = encodeAbiParameters(
		parseAbiParameters(
			'address asset, uint256 amount, uint64 destinationChainSelector, address destinationProtocolSmartWallet',
		),
		[evmCfg.assetAddress as Hex, amount, bestChainSelector, bestProtocolSmartWallet as Hex],
	)

	const reportResponse = runtime
		.report({
			encodedPayload: hexToBase64(reportData),
			encoderName: 'evm',
			signingAlgo: 'ecdsa',
			hashingAlgo: 'keccak256',
		})
		.result()

	const resp = evmClient
		.writeReport(runtime, {
			receiver: evmCfg.protocolSmartWalletAddress,
			report: reportResponse,
			gasConfig: { gasLimit: evmCfg.gasLimit },
		})
		.result()

	if (resp.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`Failed to write report: ${resp.errorMessage || resp.txStatus}`)
	}

	const txHash = resp.txHash || new Uint8Array(32)
	runtime.log(
		`Write report transaction succeeded on ${evmCfg.chainName} txHash: ${bytesToHex(txHash)}`,
	)
}

/** ===== Orchestration ===== **/

const doHighestSupplyAPY = (runtime: Runtime<Config>): string => {
	const config = runtime.config
	runtime.log(
		`Using Person 1 contracts | WorldIDGate: ${config.person1Contracts.worldIdGate} | VeraYieldVault: ${config.person1Contracts.veraYieldVault} | MandateStorage: ${config.person1Contracts.mandateStorage} | HumanConsensus: ${config.person1Contracts.humanConsensus}`,
	)

	// ===== STEP 0: Verify User is Verified Human =====
	runtime.log('\n🔐 Verifying user World ID...')
	const verification = verifyUserNullifier(runtime, config, config.userNullifier)
	
	if (!verification.verified) {
		runtime.log(`❌ User verification FAILED: ${verification.reason}`)
		runtime.log('⚠️  Only World ID verified humans can execute this workflow')
		return JSON.stringify({
			timestamp: new Date().toISOString(),
			verificationFailed: true,
			reason: verification.reason,
			userNullifier: config.userNullifier || 'not_provided',
			message: 'User must verify with World ID before executing workflow',
			person1Contracts: config.person1Contracts,
		})
	}
	
	runtime.log(`✅ User verified as human: ${config.userNullifier?.slice(0, 20)}...`)
	runtime.log(`   Reason: ${verification.reason}\n`)

	if (config.evms.length < 2) {
		throw new Error('At least two EVM configurations are required to compare supply APYs')
	}

	// ===== STEP 1: Chainlink Data Feeds — Market Guard =====
	// Check ETH/USD price and USDC peg BEFORE doing any pool reads or rebalancing.
	// If market is unstable (USDC depeg or stale oracle), abort immediately to protect funds.
	const market = checkMarketGuard(runtime)

	if (!market.isStable) {
		const reason = market.staleness
			? 'stale_oracle'
			: `usdc_depeg_${market.usdcUsd.toFixed(4)}`

		runtime.log(
			`⚠️ MarketGuard BLOCKED rebalance | reason=${reason} | ETH=$${market.ethUsd.toFixed(2)} | USDC=$${market.usdcUsd.toFixed(4)}`,
		)

		return JSON.stringify({
			timestamp: new Date().toISOString(),
			rebalanceBlocked: true,
			reason,
			marketGuard: {
				ethUsd: market.ethUsd,
				usdcUsd: market.usdcUsd,
				isStable: market.isStable,
				staleness: market.staleness,
				checkedAt: new Date().toISOString(),
			},
			person1Contracts: config.person1Contracts,
		})
	}

	runtime.log(
		`✅ MarketGuard passed | ETH=$${market.ethUsd.toFixed(2)} | USDC=$${market.usdcUsd.toFixed(4)} — proceeding with rebalance`,
	)

	// ===== STEP 2: Read APYs from all pools =====
	runtime.log('Reading supply APYs...')
	const pools: Pool[] = config.evms.map((e) => buildPoolForChain(runtime, e))

	// ===== STEP 3: Score pools with World ID human boost =====
	const scoredPools: ScoredPool[] = pools.map((pool) => {
		const evmCfg = config.evms.find(
			(e) => e.chainName === pool.chainName && e.protocol === pool.protocol,
		)
		if (!evmCfg) throw new Error(`EVM config not found for pool ${pool.chainName}/${pool.protocol}`)
		const humanConsensusCount = readHumanConsensusCount(runtime, config, evmCfg)
		return scorePoolForVerifiedHumans(pool, humanConsensusCount, config, runtime)
	})

	// ===== STEP 4: Find best pool by effective APY =====
	const bestPool = findBestScoredPool(scoredPools, runtime.log)
	runtime.log(
		`Found best effective APY: ${(bestPool.effectiveAPY * 100).toFixed(6)}% on chain ${bestPool.chainName} protocol ${bestPool.protocol}`,
	)

	const bestChainSelector = getChainSelectorFor(bestPool.chainName)
	let newBestBalance = bestPool.balance
	let totalRebalancedAmount = 0n

	// ===== STEP 5: Rebalance from suboptimal pools via CCIP =====
	for (const evmCfg of config.evms) {
		if (evmCfg.chainName === bestPool.chainName) continue

		runtime.log(
			`Rebalancing from ${evmCfg.chainName} -> ${bestPool.chainName} (selector ${bestChainSelector})`,
		)

		const evmClient = getEvmClientForChain(evmCfg)
		const balance = readBalanceInPool(runtime, evmCfg, evmClient)

		if (balance === 0n) {
			runtime.log(`No balance to rebalance on chain ${evmCfg.chainName}, skipping.`)
			continue
		}

		const curPool = scoredPools.find(
			(p) => p.chainName === evmCfg.chainName && p.protocol === evmCfg.protocol,
		)
		if (!curPool) throw new Error(`Pool info not found for chain ${evmCfg.chainName}`)

		const { ok, diffBps } = shouldRebalanceByEffectiveAPY(
			bestPool.effectiveAPY,
			curPool.effectiveAPY,
			config.minBPSDeltaForRebalance,
		)

		if (!ok) {
			runtime.log(
				`APY diff below threshold: diff=${diffBps}, min=${config.minBPSDeltaForRebalance} → skipping.`,
			)
			continue
		}

		runtime.log(
			`Rebalancing supply from ${evmCfg.chainName} to ${bestPool.chainName} | balance=${balance}`,
		)

		performRebalance(runtime, evmCfg, balance, bestChainSelector, bestPool.protocolSmartWalletAddress)

		newBestBalance += balance
		totalRebalancedAmount += balance
	}

	runtime.log(
		`Rebalancing complete | Old balance: ${bestPool.balance} | New balance: ${newBestBalance} | Amount rebalanced: ${totalRebalancedAmount} | Chain: ${bestPool.chainName}`,
	)

	// ===== Final output =====
	return JSON.stringify({
		timestamp: new Date().toISOString(),
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
			totalRebalancedAmount: totalRebalancedAmount.toString(),
			newBestBalance: newBestBalance.toString(),
			minBPSDeltaForRebalance: config.minBPSDeltaForRebalance,
		},
		humanBoost: config.humanBoost,
		marketGuard: {
			ethUsd: market.ethUsd,
			usdcUsd: market.usdcUsd,
			isStable: market.isStable,
			checkedAt: new Date().toISOString(),
		},
		person1Contracts: config.person1Contracts,
	})
}

/** ===== Workflow ===== **/

const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
	if (!payload.scheduledExecutionTime) {
		throw new Error('Scheduled execution time is required')
	}
	runtime.log('Running CronTrigger for supply APY rebalance')
	return doHighestSupplyAPY(runtime)
}

const initWorkflow = (config: Config) => {
	const cron = new cre.capabilities.CronCapability()
	return [
		cre.handler(
			cron.trigger({ schedule: config.schedule }),
			onCronTrigger,
		),
	]
}

export async function main() {
	const runner = await Runner.newRunner<Config>({ configSchema })
	await runner.run(initWorkflow)
}

main()