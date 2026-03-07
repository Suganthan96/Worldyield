/**
 * CRE Config Updater
 * 
 * Utility to update the userNullifier in the CRE workflow config.json file
 * when a user successfully verifies with World ID.
 */

import { promises as fs } from 'fs'
import path from 'path'

const CRE_CONFIG_PATH = path.resolve(process.cwd(), '../cre/my-workflow/config.json')

interface CREConfig {
  schedule: string
  minBPSDeltaForRebalance: number
  userNullifier: string
  humanBoost: {
    verifiedBoostBps: number
    consensusWeightBpsPer100Humans: number
  }
  person1Contracts: {
    worldIdGate: string
    veraYieldVault: string
    mandateStorage: string
    humanConsensus: string
    humanConsensusChainName: string
  }
  evms: Array<any>
}

/**
 * Updates the userNullifier in the CRE config.json file
 * @param nullifier - The World ID nullifier hash to set
 * @returns Promise<boolean> - True if successful, false otherwise
 */
export async function updateCREConfigNullifier(nullifier: string): Promise<{
  success: boolean
  message: string
  error?: string
}> {
  try {
    // Validate nullifier format
    if (!nullifier || typeof nullifier !== 'string') {
      return {
        success: false,
        message: 'Invalid nullifier',
        error: 'Nullifier must be a non-empty string'
      }
    }

    // Validate nullifier format (hex or UUID)
    const isHex = /^0x[a-fA-F0-9]{64}$/.test(nullifier)
    const isUUID = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(nullifier)
    
    if (!isHex && !isUUID) {
      return {
        success: false,
        message: 'Invalid nullifier format',
        error: 'Nullifier must be a hex string (0x...) or UUID format'
      }
    }

    // Check if config file exists
    try {
      await fs.access(CRE_CONFIG_PATH)
    } catch (err) {
      return {
        success: false,
        message: 'CRE config file not found',
        error: `Config file does not exist at: ${CRE_CONFIG_PATH}`
      }
    }

    // Read current config
    const configContent = await fs.readFile(CRE_CONFIG_PATH, 'utf-8')
    const config: CREConfig = JSON.parse(configContent)

    // Store old nullifier for logging
    const oldNullifier = config.userNullifier

    // Update nullifier
    config.userNullifier = nullifier

    // Write back to file with pretty formatting
    await fs.writeFile(
      CRE_CONFIG_PATH,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    )

    console.log('[CRE Config] Updated userNullifier')
    console.log(`  Old: ${oldNullifier?.slice(0, 20)}...`)
    console.log(`  New: ${nullifier.slice(0, 20)}...`)
    console.log(`  Path: ${CRE_CONFIG_PATH}`)

    return {
      success: true,
      message: `CRE config updated successfully. Nullifier: ${nullifier.slice(0, 10)}...`
    }
  } catch (error) {
    console.error('[CRE Config] Error updating config:', error)
    return {
      success: false,
      message: 'Failed to update CRE config',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Reads the current userNullifier from CRE config
 * @returns Promise<string | null> - The current nullifier or null if not found
 */
export async function getCurrentCRENullifier(): Promise<string | null> {
  try {
    const configContent = await fs.readFile(CRE_CONFIG_PATH, 'utf-8')
    const config: CREConfig = JSON.parse(configContent)
    return config.userNullifier || null
  } catch (error) {
    console.error('[CRE Config] Error reading config:', error)
    return null
  }
}
