#!/usr/bin/env node
/**
 * CRE Config Sync Script
 * 
 * Standalone script to sync World ID nullifier from frontend to CRE config.json
 * 
 * Usage:
 *   node scripts/sync-cre-nullifier.js [nullifier]
 *   
 * Without argument: Fetches nullifier from API and updates config
 * With argument: Updates config with provided nullifier
 */

const fs = require('fs').promises
const path = require('path')

const CRE_CONFIG_PATH = path.resolve(__dirname, '../../cre/my-workflow/config.json')
const API_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

async function updateConfig(nullifier) {
  try {
    // Validate nullifier format
    const isHex = /^0x[a-fA-F0-9]{64}$/.test(nullifier)
    const isUUID = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(nullifier)
    
    if (!isHex && !isUUID) {
      console.error('❌ Invalid nullifier format')
      console.error('   Expected: 0x... (hex) or UUID format')
      process.exit(1)
    }

    // Read config
    const configContent = await fs.readFile(CRE_CONFIG_PATH, 'utf-8')
    const config = JSON.parse(configContent)

    const oldNullifier = config.userNullifier

    // Update nullifier
    config.userNullifier = nullifier

    // Write back
    await fs.writeFile(
      CRE_CONFIG_PATH,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    )

    console.log('✅ CRE config updated successfully!')
    console.log('')
    console.log(`   Old nullifier: ${oldNullifier?.slice(0, 30)}...`)
    console.log(`   New nullifier: ${nullifier.slice(0, 30)}...`)
    console.log(`   Config path:   ${CRE_CONFIG_PATH}`)
    console.log('')
    console.log('💡 You can now run: cd cre && cre workflow simulate my-workflow')
    
  } catch (error) {
    console.error('❌ Error updating CRE config:', error.message)
    process.exit(1)
  }
}

async function fetchNullifier() {
  try {
    const response = await fetch(`${API_URL}/api/worldid`)
    const data = await response.json()

    if (!data.verified || !data.nullifier) {
      console.error('❌ No verified World ID nullifier found')
      console.error('   Please verify with World ID first at:', API_URL)
      process.exit(1)
    }

    return data.nullifier
  } catch (error) {
    console.error('❌ Error fetching nullifier from API:', error.message)
    console.error('   Make sure the frontend server is running at:', API_URL)
    process.exit(1)
  }
}

async function main() {
  console.log('🔄 CRE Config Sync Script')
  console.log('─'.repeat(50))
  console.log('')

  const providedNullifier = process.argv[2]

  if (providedNullifier) {
    console.log('📝 Using provided nullifier...')
    await updateConfig(providedNullifier)
  } else {
    console.log('🌐 Fetching nullifier from API...')
    const nullifier = await fetchNullifier()
    console.log(`✓ Found nullifier: ${nullifier.slice(0, 30)}...`)
    console.log('')
    await updateConfig(nullifier)
  }
}

main().catch(error => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
