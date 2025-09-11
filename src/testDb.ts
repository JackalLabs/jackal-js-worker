// Import logger first to replace console.log globally
// import './logger'

import dotenv from 'dotenv'
import { database } from './database'

dotenv.config()

async function testDatabase() {
  try {
    console.log('Testing database connection...')
    
    // Connect to database
    await database.connect()
    console.log('✅ Database connection successful')
    
    // Test getting a worker by ID
    const workerId = process.env.JACKAL_WORKER_ID
    if (workerId) {
      console.log(`Testing retrieval of worker ID: ${workerId}`)
      const worker = await database.getJackalWorker(parseInt(workerId))
      
      if (worker) {
        console.log('✅ Worker found:')
        console.log(`  ID: ${worker.id}`)
        console.log(`  Address: ${worker.address}`)
        console.log(`  Seed: ${worker.seed.substring(0, 20)}...`)
        console.log(`  Created: ${worker.created_at}`)
        console.log(`  Updated: ${worker.updated_at}`)
      } else {
        console.log('❌ Worker not found')
      }
    } else {
      console.log('⚠️  JACKAL_WORKER_ID not set, skipping worker test')
    }
    
    // Disconnect
    await database.disconnect()
    console.log('✅ Database disconnected')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

// Run the test
testDatabase()
