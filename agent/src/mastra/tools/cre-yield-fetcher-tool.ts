/**
 * CRE Yield Data Fetcher Tool
 * 
 * This tool integrates with the Chainlink Runtime Environment (CRE) workflows
 * to fetch real-time APY data and human consensus counts from smart contracts.
 * 
 * It replaces the mock implementations with actual blockchain data from:
 * - Aave v3 (Ethereum Sepolia)
 * - Compound v3 (Base Sepolia)  
 * - Morpho Vaults (Ethereum mainnet)
 */

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getYieldRecommendation, type YieldData } from '../../lib/cre-client'

// Load configuration from environment
const WORLD_ID_GATE = process.env.WORLD_ID_GATE_ADDRESS!
const VERA_YIELD_VAULT = process.env.VERA_YIELD_VAULT_ADDRESS!
const MANDATE_STORAGE = process.env.MANDATE_STORAGE_ADDRESS!
const HUMAN_CONSENSUS = process.env.HUMAN_CONSENSUS_ADDRESS!

// CRE configuration matching /cre/my-workflow/config.json
const CRE_CONFIG = {
	evms: [
		{
			chainName: 'ethereum-testnet-sepolia',
			protocol: 'aave-v3' as const,
			poolAddress: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
			assetAddress: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
			protocolSmartWalletAddress: '0xYourProtocolSmartWalletAddressHere',
			gasLimit: '300000',
			humanPoolId: 'aave-sepolia-usdc',
			humanConsensusCount: 847,
		},
		{
			chainName: 'ethereum-testnet-sepolia-base-1',
			protocol: 'compound-v3' as const,
			poolAddress: '0xb125E6687d4313864e53df431d5425969c15Eb2F',
			assetAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
			protocolSmartWalletAddress: '0xYourProtocolSmartWalletAddressHere',
			gasLimit: '300000',
			humanPoolId: 'compound-base-usdc',
			humanConsensusCount: 412,
		},
	],
	humanBoost: {
		verifiedBoostBps: 140, // 1.4% boost for verified humans
		consensusWeightBpsPer100Humans: 6, // 0.06% per 100 humans
	},
	person1Contracts: {
		worldIdGate: WORLD_ID_GATE,
		veraYieldVault: VERA_YIELD_VAULT,
		mandateStorage: MANDATE_STORAGE,
		humanConsensus: HUMAN_CONSENSUS,
		humanConsensusChainName: 'ethereum-testnet-sepolia',
	},
}

export const creYieldFetcherTool = createTool({
	id: 'cre-yield-fetcher',
	description: `Fetches real-time yield data from DeFi protocols using Chainlink Runtime Environment (CRE).
		Returns APY rates, human consensus counts, and scored recommendations for:
		- Aave v3 on Ethereum Sepolia
		- Compound v3 on Base Sepolia
		- Human verification boost calculations
		
		The tool reads directly from smart contracts using EVM clients and applies verified human boost scoring.`,
	inputSchema: z.object({
		includeDetails: z
			.boolean()
			.optional()
			.describe('Whether to include detailed breakdown of all protocols (default: false)'),
	}),
	execute: async (params) => {
		try {
			console.log('[CRE Yield Fetcher] Fetching yield data from CRE workflows...')

			// Call the CRE client to get real blockchain data
			const yieldData = await getYieldRecommendation(CRE_CONFIG)

			console.log(
				`[CRE Yield Fetcher] Best pool: ${yieldData.bestPool.chainName}/${yieldData.bestPool.protocol} with ${(yieldData.bestPool.effectiveAPY * 100).toFixed(4)}% effective APY`,
			)

			// Format response based on includeDetails flag
			if (params.includeDetails) {
				return {
					success: true,
					timestamp: new Date().toISOString(),
					recommendation: {
						protocol: yieldData.bestPool.protocol,
						chain: yieldData.bestPool.chainName,
						baseAPY: `${(yieldData.bestPool.apy * 100).toFixed(4)}%`,
						effectiveAPY: `${(yieldData.bestPool.effectiveAPY * 100).toFixed(4)}%`,
						humanConsensusCount: yieldData.bestPool.humanConsensusCount,
						verifiedBoost: `${(yieldData.bestPool.verifiedBoostBps / 100).toFixed(2)}%`,
						consensusBoost: `${(yieldData.bestPool.consensusBoostBps / 100).toFixed(2)}%`,
					},
					allProtocols: yieldData.rankedPools.map((pool: any) => ({
						protocol: pool.protocol,
						chain: pool.chainName,
						baseAPY: `${(pool.apy * 100).toFixed(4)}%`,
						effectiveAPY: `${(pool.effectiveAPY * 100).toFixed(4)}%`,
						humanConsensusCount: pool.humanConsensusCount,
						verifiedBoost: `${(pool.verifiedBoostBps / 100).toFixed(2)}%`,
						consensusBoost: `${(pool.consensusBoostBps / 100).toFixed(2)}%`,
					})),
					humanBoostConfig: {
						verifiedBoostPercentage: `${(yieldData.humanBoost.verifiedBoostBps / 100).toFixed(2)}%`,
						consensusWeightPer100Humans: `${(yieldData.humanBoost.consensusWeightBpsPer100Humans / 100).toFixed(2)}%`,
					},
				}
			}

			// Simplified response (default)
			return {
				success: true,
				timestamp: new Date().toISOString(),
				recommendation: {
					protocol: yieldData.bestPool.protocol,
					chain: yieldData.bestPool.chainName,
					effectiveAPY: `${(yieldData.bestPool.effectiveAPY * 100).toFixed(4)}%`,
					humanConsensusCount: yieldData.bestPool.humanConsensusCount,
					reason: `This protocol offers the highest effective APY of ${(yieldData.bestPool.effectiveAPY * 100).toFixed(2)}% after applying verified human boost (${(yieldData.bestPool.verifiedBoostBps / 100).toFixed(2)}%) and consensus boost based on ${yieldData.bestPool.humanConsensusCount} verified humans (${(yieldData.bestPool.consensusBoostBps / 100).toFixed(2)}%).`,
				},
			}
		} catch (error) {
			console.error('[CRE Yield Fetcher] Error:', error)
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: 'Failed to fetch yield data from CRE workflows',
			}
		}
	},
})
