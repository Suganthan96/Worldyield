#!/usr/bin/env node
/**
 * CRE Nullifier Watcher
 * 
 * Monitors for World ID verification events and automatically updates
 * the CRE config.json file when a new user verifies.
 * 
 * Usage:
 *   node scripts/watch-nullifier.js
 *   
 * Environment Variables:
 *   NULLIFIER_WATCH_INTERVAL - Check interval in ms (default: 5000)
 *   NEXT_PUBLIC_BASE_URL - API base URL (default: http://localhost:3000)
 */

const fs = require('fs').promises
const path = require('path')

const CRE_CONFIG_PATH = path.resolve(__dirname, '../../cre/my-workflow/config.json')
const API_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
const WATCH_INTERVAL = parseInt(process.env.NULLIFIER_WATCH_INTERVAL || '5000', 10)

let lastKnownNullifier = null
let watchCount = 0

async function readCurrentCREConfig() {
  try {
    const content = await fs.readFile(CRE_CONFIG_PATH, 'utf-8')
    const config = JSON.parse(content)
    return config.userNullifier
  } catch (error) {
    console.error('⚠️  Could not read CRE config:', error.message)
    return null
  }
}

async function updateCREConfig(nullifier) {
  try {
    const content = await fs.readFile(CRE_CONFIG_PATH, 'utf-8')
    const config = JSON.parse(content)
    
    config.userNullifier = nullifier
    
    await fs.writeFile(
      CRE_CONFIG_PATH,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    )
    
    return true
  } catch (error) {
    console.error('❌ Failed to update CRE config:', error.message)
    return false
  }
}

async function checkForNullifierUpdate() {
  try {
    watchCount++
    
    // Fetch current nullifier from API
    const response = await fetch(`${API_URL}/api/worldid`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    
    if (!response.ok) {
      console.error(`⚠️  API returned ${response.status}`)
      return
    }
    
    const data = await response.json()
    
    if (!data.verified || !data.nullifier) {
      // No verification yet
      if (watchCount % 12 === 0) { // Log every minute (12 * 5sec)
        console.log('⏳ Waiting for World ID verification...')
      }
      return
    }
    
    const currentNullifier = data.nullifier
    
    // Check if this is a new nullifier
    if (currentNullifier !== lastKnownNullifier) {
      console.log('')
      console.log('🆕 New World ID verification detected!')
      console.log(`   Nullifier: ${currentNullifier.slice(0, 40)}...`)
      console.log('')
      
      // Update CRE config
      console.log('📝 Updating CRE config.json...')
      const success = await updateCREConfig(currentNullifier)
      
      if (success) {
        console.log('✅ CRE config updated successfully!')
        console.log(`   Path: ${CRE_CONFIG_PATH}`)
        console.log('')
        console.log('💡 The CRE workflow will now use this verified human\'s nullifier')
        console.log('')
        
        lastKnownNullifier = currentNullifier
      }
    }
    
  } catch (error) {
    if (watchCount % 12 === 0) {
      console.error('⚠️  Watch error:', error.message)
    }
  }
}

async function main() {
  console.log('👁️  CRE Nullifier Watcher Started')
  console.log('─'.repeat(60))
  console.log('')
  console.log(`   API URL:        ${API_URL}`)
  console.log(`   CRE Config:     ${CRE_CONFIG_PATH}`)
  console.log(`   Check Interval: ${WATCH_INTERVAL}ms`)
  console.log('')
  console.log('Monitoring for World ID verifications...')
  console.log('Press Ctrl+C to stop')
  console.log('')
  
  // Load initial nullifier from CRE config
  lastKnownNullifier = await readCurrentCREConfig()
  if (lastKnownNullifier) {
    console.log(`📋 Current CRE nullifier: ${lastKnownNullifier.slice(0, 40)}...`)
    console.log('')
  }
  
  // Start watching
  setInterval(checkForNullifierUpdate, WATCH_INTERVAL)
  
  // Also check immediately
  await checkForNullifierUpdate()
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('')
  console.log('👋 Watcher stopped')
  console.log(`   Total checks: ${watchCount}`)
  process.exit(0)
})

main().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
