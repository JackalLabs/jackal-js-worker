// Import logger first to replace console.log globally
// import './logger'

import { Client } from 'pg'
import dotenv from 'dotenv'
import { promises as fs } from 'fs'

dotenv.config()

export interface JackalWorker {
  id: number
  address: string
  seed: string
  created_at: Date
  updated_at: Date
}

export interface JackalFile {
  id: number
  file_path: string
  task_id: string
  bundle_id: string
  js_worker_id: string
  created_at: Date
  updated_at: Date
}

class Database {
  private client: Client | null = null

  private async validatePEMFile(filePath: string): Promise<boolean> {
    try {
      if (!filePath || filePath.trim() === '' || filePath === 'undefined') {
        return false
      }
      
      const content = await fs.readFile(filePath, 'utf8')
      return content.trim() !== '' && content.includes('-----BEGIN')
    } catch (error) {
      console.log(`Certificate file ${filePath} is not accessible or invalid:`, error)
      return false
    }
  }

  async connect(): Promise<void> {
    let config: any = {}
    
    try {
      config = {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || '5432'),
      }

      
      // Check if SSL should be forced off
      if (process.env.DB_FORCE_NO_SSL === 'true' || process.env.DB_FORCE_NO_SSL === '1') {
        config.ssl = false
      } else {
        // Validate SSL certificates by checking file content
        const hasValidRootCert = await this.validatePEMFile(process.env.DB_ROOT_CERT || '')
        const hasValidClientCert = await this.validatePEMFile(process.env.DB_CERT || '')
        const hasValidClientKey = await this.validatePEMFile(process.env.DB_KEY || '')

        if (hasValidRootCert && hasValidClientCert && hasValidClientKey) {
          
          // Read certificate file contents
          const rootCertContent = await fs.readFile(process.env.DB_ROOT_CERT!, 'utf8')
          const clientCertContent = await fs.readFile(process.env.DB_CERT!, 'utf8')
          const clientKeyContent = await fs.readFile(process.env.DB_KEY!, 'utf8')
          
          config.ssl = {
            rejectUnauthorized: false,
            ca: rootCertContent,
            cert: clientCertContent,
            key: clientKeyContent,
          }
        } else {
          console.log('SSL certificates are invalid or missing, attempting non-SSL connection')
          config.ssl = false
        }
      }

      this.client = new Client(config)

      await this.client.connect()
      console.log('Connected to PostgreSQL database')
    } catch (error) {
      console.error('Failed to connect to database:', error)
      
      // If SSL connection failed, try without SSL as fallback
      if (error instanceof Error && error.message && error.message.includes('PEM routines') && config.ssl) {
        console.log('SSL connection failed due to invalid certificates, retrying without SSL...')
        try {
          config.ssl = false
          this.client = new Client(config)
          await this.client.connect()
          console.log('Connected to PostgreSQL database without SSL')
        } catch (fallbackError) {
          console.error('Fallback connection also failed:', fallbackError)
          
          // If the database requires SSL but we can't provide valid certificates, give helpful error
          if (fallbackError instanceof Error && fallbackError.message && 
              fallbackError.message.includes('pg_hba.conf rejects connection') &&
              fallbackError.message.includes('no encryption')) {
            
          }
          
          throw fallbackError
        }
      } else {
        throw error
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end()
      this.client = null
      console.log('Disconnected from PostgreSQL database')
    }
  }

  async getJackalWorker(id: number): Promise<JackalWorker | null> {
    if (!this.client) {
      throw new Error('Database not connected')
    }

    try {
      const result = await this.client.query(
        'SELECT id, address, seed, created_at, updated_at FROM jackal_workers WHERE id = $1',
        [id]
      )

      if (result.rows.length === 0) {
        return null
      }

      return result.rows[0] as JackalWorker
    } catch (error) {
      console.error('Failed to get Jackal worker:', error)
      throw error
    }
  }

  async getJackalWorkerByAddress(address: string): Promise<JackalWorker | null> {
    if (!this.client) {
      throw new Error('Database not connected')
    }

    try {
      const result = await this.client.query(
        'SELECT id, address, seed, created_at, updated_at FROM jackal_workers WHERE address = $1',
        [address]
      )

      if (result.rows.length === 0) {
        return null
      }

      return result.rows[0] as JackalWorker
    } catch (error) {
      console.error('Failed to get Jackal worker by address:', error)
      throw error
    }
  }

  async saveJackalFile(filePath: string, taskId: string, bundleId: string, jsWorkerId: string): Promise<JackalFile> {
    if (!this.client) {
      throw new Error('Database not connected')
    }

    try {
      const result = await this.client.query(
        'INSERT INTO jackal_files (file_path, task_id, bundle_id, js_worker_id, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *',
        [filePath, taskId, bundleId, jsWorkerId]
      )

      return result.rows[0] as JackalFile
    } catch (error) {
      console.error('Failed to save Jackal file:', error)
      throw error
    }
  }
}

export const database = new Database()
