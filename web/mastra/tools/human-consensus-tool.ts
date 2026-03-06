import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

interface HumanCount {
  protocol: string;
  chain: string;
  verifiedHumans: number;
  totalDeposited: number;
}

export const humanConsensusTool = createTool({
  id: 'get-human-consensus',
  description: 'Gets the number of World ID verified humans deposited in each protocol - serves as a trust signal',
  inputSchema: z.object({
    protocol: z.string().optional().describe('Specific protocol to query (optional, returns all if not specified)'),
  }),
  outputSchema: z.object({
    consensus: z.array(
      z.object({
        protocol: z.string(),
        chain: z.string(),
        verifiedHumans: z.number(),
        totalDeposited: z.number(),
        confidenceLevel: z.enum(['Low', 'Medium', 'High', 'Very High']),
      })
    ),
    timestamp: z.string(),
  }),
  execute: async (inputData) => {
    return await getHumanConsensus(inputData.protocol);
  },
});

const getHumanConsensus = async (protocolFilter?: string) => {
  // This reads from the HumanConsensus.sol contract deployed on World Chain
  // Contract address: 0x68283AAa8899A4aA299141ca6f04dF8e5802509f
  
  // TODO: Replace with actual contract reads using ethers.js/viem
  // Read from HumanConsensus.getHumanCount(protocolId)
  
  const mockData: HumanCount[] = [
    {
      protocol: 'Aave',
      chain: 'Arbitrum',
      verifiedHumans: 847,
      totalDeposited: 1250000, // $1.25M
    },
    {
      protocol: 'Compound',
      chain: 'Base',
      verifiedHumans: 623,
      totalDeposited: 890000, // $890K
    },
    {
      protocol: 'Morpho',
      chain: 'Ethereum',
      verifiedHumans: 411,
      totalDeposited: 670000, // $670K
    },
  ];

  let filtered = mockData;
  if (protocolFilter) {
    filtered = mockData.filter(d => 
      d.protocol.toLowerCase() === protocolFilter.toLowerCase()
    );
  }

  return {
    consensus: filtered.map(d => ({
      ...d,
      confidenceLevel: getConfidenceLevel(d.verifiedHumans),
    })),
    timestamp: new Date().toISOString(),
  };
};

function getConfidenceLevel(humanCount: number): 'Low' | 'Medium' | 'High' | 'Very High' {
  if (humanCount < 100) return 'Low';
  if (humanCount < 300) return 'Medium';
  if (humanCount < 600) return 'High';
  return 'Very High';
}

/**
 * Production implementation:
 * 
 * 1. Connect to World Chain RPC
 * 2. Read HumanConsensus contract at: 0x68283AAa8899A4aA299141ca6f04dF8e5802509f
 * 3. Call getHumanCount() for each protocol
 * 
 * Example with ethers.js:
 * ```typescript
 * import { ethers } from 'ethers';
 * 
 * const provider = new ethers.JsonRpcProvider(process.env.WORLD_CHAIN_RPC);
 * const contract = new ethers.Contract(
 *   '0x68283AAa8899A4aA299141ca6f04dF8e5802509f',
 *   HUMAN_CONSENSUS_ABI,
 *   provider
 * );
 * 
 * const aaveCount = await contract.getHumanCount(
 *   ethers.utils.id('Aave_Arbitrum')
 * );
 * ```
 */
