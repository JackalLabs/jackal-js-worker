// Import logger first to replace console.log globally
// import './logger'

import express, { Request, Response, Application } from 'express'
import { Server } from 'http'
import { database } from './database'
import { localJjs } from './jackalClient'
import { CAFDeserializer } from './cafSerializer'
import { promises as fs } from 'fs'
import path from 'path'
import { hostname } from 'os'
import { FileProof } from '@jackallabs/jackal.js'

// Type definitions
interface JackalFileRecord {
  id: number
  file_path: string
  task_id: string
  bundle_id: string
  js_worker_id: string
  created_at: Date
  updated_at: Date
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  workerId: string
  timestamp: string
}

interface FileInfoResponse {
  filePath: string
  taskId: string
  bundleId: string
  jsWorkerId: string
  createdAt: Date
  updatedAt: Date
}

interface ErrorResponse {
  error: string
  message?: string
  taskId?: string
  filePath?: string
}

interface ProofInfoResponse {
  proofs: FileProof[]
}

interface WebServerConfig {
  port: number
  workerId: string
  tempDir: string
  downloadTimeoutMs: number
  keepCafFiles: boolean
}

interface ProofCacheEntry {
  proofs: FileProof[]
  timestamp: number
}

export class WebServer {
  private app: Application
  private server: Server | null = null
  private readonly config: WebServerConfig
  private jjs: localJjs | null = null
  private proofCache: Map<string, ProofCacheEntry> = new Map()
  private readonly CACHE_TTL_MS = 60 * 1000 // 1 minute in milliseconds

  constructor(port: number = 3000) {
    this.config = {
      port,
      workerId: process.env.JACKAL_WORKER_ID || '1',
      tempDir: process.env.TEMP_DIR || '/tmp',
      downloadTimeoutMs: parseInt(process.env.DOWNLOAD_TIMEOUT_MS || '300000'), // 5 minutes
      keepCafFiles: process.env.KEEP_CAF_FILES === 'true' // Default to false (clean up after use)
    }

    localJjs.init().then(jjs =>   {
      this.jjs = jjs
    })
    
    this.app = express()
    this.setupMiddleware()
    this.setupRoutes()
    this.startCacheCleanup()
  }

  private setupMiddleware(): void {
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))
    
    // CORS middleware
    this.app.use((req: Request, res: Response, next: any) => {
      // Get the origin from the request
      const origin = req.headers.origin
      
      // Define allowed origins (same as the main server)
      const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://respawnit.com',
        'https://www.respawnit.com',
        'https://demo.respawnit.com'
      ]
      
      // Check if the origin is allowed
      if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin)
      } else {
        // For requests without origin (like direct API calls), allow localhost
        res.header('Access-Control-Allow-Origin', 'http://localhost:5173')
      }
      
      res.header('Access-Control-Allow-Credentials', 'true')
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie')
      res.header('Access-Control-Expose-Headers', 'Set-Cookie')
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200)
      } else {
        next()
      }
    })
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response<HealthResponse>) => {
      res.json({
        status: 'healthy',
        workerId: this.config.workerId,
        timestamp: new Date().toISOString()
      })
    })

    // Get file from CAF bundle endpoint
    this.app.get('/file/:taskId/:filePath(*)', async (req: Request, res: Response<Buffer | ErrorResponse>) => {
      try {
        const { taskId, filePath } = req.params
        
        // Validate parameters
        if (!taskId || !filePath) {
          return res.status(400).json({
            error: 'Missing required parameters: taskId and filePath'
          })
        }

        // Basic validation for taskId (should be alphanumeric)
        if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) {
          return res.status(400).json({
            error: 'Invalid taskId format'
          })
        }

        // Basic validation for filePath (should not contain dangerous characters)
        if (filePath.includes('..') || filePath.includes('~') || filePath.startsWith('/')) {
          return res.status(400).json({
            error: 'Invalid filePath format'
          })
        }

        // Look up the bundle ID for this task and file path
        console.log(`Looking up file in database: taskId=${taskId}, filePath=${filePath}`)
        const jackalFile = await this.getJackalFileFromDatabase(taskId, filePath)
        if (!jackalFile) {
          console.log(`File not found in database: taskId=${taskId}, filePath=${filePath}`)
          return res.status(404).json({
            error: 'File not found in database',
            taskId,
            filePath
          })
        }
        console.log(`Found file in database: bundleId=${jackalFile.bundle_id}, jsWorkerId=${jackalFile.js_worker_id}`)

        // Download the CAF bundle from Jackal
        const cafPath = await this.downloadCAFFromJackal(jackalFile.bundle_id)
        console.log(`CAF downloaded to: ${cafPath}`)
        
        // Extract the specific file from the CAF
        const fileContent = await this.extractFileFromCAF(cafPath, filePath, taskId)
        console.log(`Extracted file content size: ${fileContent.length} bytes`)
        
        // Clean up the temporary CAF file if not configured to keep it
        if (!this.config.keepCafFiles) {
          await this.cleanupTempFile(cafPath)
        } else {
          console.log(`Keeping CAF file for future use: ${cafPath}`)
        }

        // Set appropriate headers and send the file
        const fileName = path.basename(filePath)
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Content-Length', fileContent.length.toString())
        console.log(`Sending file response: ${fileName} (${fileContent.length} bytes)`)
        res.send(fileContent)

      } catch (error) {
        console.error('Error retrieving file:', error)
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Get file info endpoint (without downloading)
    this.app.get('/file-info/:taskId/:filePath(*)', async (req: Request, res: Response<FileInfoResponse | ErrorResponse>) => {
      try {
        const { taskId, filePath } = req.params
        
        // Validate parameters
        if (!taskId || !filePath) {
          return res.status(400).json({
            error: 'Missing required parameters: taskId and filePath'
          })
        }

        // Basic validation for taskId (should be alphanumeric)
        if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) {
          return res.status(400).json({
            error: 'Invalid taskId format'
          })
        }

        // Basic validation for filePath (should not contain dangerous characters)
        if (filePath.includes('..') || filePath.includes('~') || filePath.startsWith('/')) {
          return res.status(400).json({
            error: 'Invalid filePath format'
          })
        }

        const jackalFile = await this.getJackalFileFromDatabase(taskId, filePath)
        if (!jackalFile) {
          return res.status(404).json({
            error: 'File not found in database',
            taskId,
            filePath
          })
        }

        res.json({
          filePath: jackalFile.file_path,
          taskId: jackalFile.task_id,
          bundleId: jackalFile.bundle_id,
          jsWorkerId: jackalFile.js_worker_id,
          createdAt: jackalFile.created_at,
          updatedAt: jackalFile.updated_at
        })

      } catch (error) {
        console.error('Error getting file info:', error)
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Get file proof info endpoint
    this.app.get('/file-proof/:taskId/:filePath(*)', async (req: Request, res: Response<ProofInfoResponse | ErrorResponse>) => {
      try {
        const { taskId, filePath } = req.params
        
        // Validate parameters
        if (!taskId || !filePath) {
          return res.status(400).json({
            error: 'Missing required parameters: taskId and filePath'
          })
        }

        // Basic validation for taskId (should be alphanumeric)
        if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) {
          return res.status(400).json({
            error: 'Invalid taskId format'
          })
        }

        // Basic validation for filePath (should not contain dangerous characters)
        if (filePath.includes('..') || filePath.includes('~') || filePath.startsWith('/')) {
          return res.status(400).json({
            error: 'Invalid filePath format'
          })
        }

        const jackalFile = await this.getJackalFileFromDatabase(taskId, filePath)
        if (!jackalFile) {
          return res.status(404).json({
            error: 'File not found in database',
            taskId,
            filePath
          })
        }

        // Get proof information from Jackal
        const proofInfo = await this.getProofInfoFromJackal(jackalFile.bundle_id, filePath, taskId)

        res.json({
          proofs: proofInfo,
        })

      } catch (error) {
        console.error('Error getting file proof info:', error)
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })
  }

  private async getJackalFileFromDatabase(taskId: string, filePath: string): Promise<JackalFileRecord | null> {
    try {
      // Access the database client through a public method or property
      const result = await (database as any).client!.query(
        'SELECT * FROM jackal_files WHERE task_id = $1 AND file_path = $2',
        [taskId, filePath]
      )

      return result.rows[0] || null
    } catch (error) {
      console.error('Database query error:', error)
      throw error
    }
  }

  private async downloadCAFFromJackal(bundleId: string): Promise<string> {
    const tempCafPath = path.join(this.config.tempDir, bundleId)
    
    // Check if CAF file already exists locally
    try {
      const stats = await fs.stat(tempCafPath)
      if (stats.isFile() && stats.size > 0) {
        console.log(`CAF file already exists locally: ${tempCafPath} (${stats.size} bytes)`)
        return tempCafPath
      } else {
        console.log(`CAF file exists but is empty or invalid, will re-download: ${tempCafPath}`)
        // Remove the invalid file
        await fs.unlink(tempCafPath)
      }
    } catch (error) {
      // File doesn't exist, which is expected for new downloads
      console.log(`CAF file not found locally, will download: ${tempCafPath}`)
    }
    
    console.log(`Downloading CAF from Jackal: ${tempCafPath}`)
    

    try {
      // Add timeout for download operation
      const downloadPromise = this.jjs?.downloadCAFFromJackal(bundleId, tempCafPath)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Download timeout')), this.config.downloadTimeoutMs)
      })
      
      await Promise.race([downloadPromise, timeoutPromise])
      
      // Verify the downloaded file exists and has content
      const stats = await fs.stat(tempCafPath)
      if (!stats.isFile() || stats.size === 0) {
        throw new Error('Downloaded CAF file is empty or invalid')
      }
      
      console.log(`Successfully downloaded CAF: ${tempCafPath} (${stats.size} bytes)`)
      
      // Try to validate the CAF file structure
      try {
        const testCaf = new CAFDeserializer(tempCafPath)
        await testCaf.loadIndex()
        const fileCount = testCaf.getFileList().length
        console.log(`CAF validation successful: ${fileCount} files in archive`)
      } catch (validationError) {
        console.error(`CAF validation failed:`, validationError)
        throw new Error(`Downloaded CAF file is corrupted: ${validationError}`)
      }
      
      return tempCafPath
    } catch (error) {
      console.error(`Failed to download CAF ${bundleId}:`, error)
      // Clean up partial file if it exists
      try {
        await fs.unlink(tempCafPath)
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw new Error(`Failed to download CAF bundle: ${bundleId}`)
    }
  }

  private async extractFileFromCAF(cafPath: string, targetFilePath: string, taskId: string): Promise<Buffer> {
    try {
      console.log(`Starting CAF extraction: ${cafPath}`)
      console.log(`Target file path: ${targetFilePath}`)
      console.log(`Task ID: ${taskId}`)
      
      const caf = new CAFDeserializer(cafPath)
      await caf.loadIndex()
      console.log(`CAF index loaded successfully`)
      
      const fileList = caf.getFileList()
      console.log(`CAF contains ${fileList.length} files:`, fileList)
      
      // The file in CAF has the task ID prepended, so construct the full path
      const fullFilePath = `${taskId}/${targetFilePath}`
      console.log(`Looking for file with full path: ${fullFilePath}`)
      
      const targetFile = fileList.find(file => file === fullFilePath)
      console.log(`Found target file: ${targetFile}`)
      
      if (!targetFile) {
        console.log(`File not found! Available files:`)
        fileList.forEach((file, index) => {
          console.log(`  ${index + 1}. ${file}`)
        })
        throw new Error(`File ${fullFilePath} not found in CAF archive`)
      }

      console.log(`Extracting file: ${targetFile}`)
      const fileContent = await caf.extractFile(targetFile)
      console.log(`Successfully extracted file: ${fileContent.length} bytes`)
      return fileContent
    } catch (error) {
      console.error(`Failed to extract file ${targetFilePath} from CAF:`, error)
      throw new Error(`Failed to extract file from CAF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath)
      console.log(`Cleaned up temporary file: ${filePath}`)
    } catch (error) {
      console.error(`Failed to cleanup temporary file ${filePath}:`, error)
      // Don't throw here as it's just cleanup
    }
  }

  private getCacheKey(bundleId: string, filePath: string, taskId: string): string {
    return `${bundleId}:${filePath}:${taskId}`
  }

  private isCacheEntryValid(entry: ProofCacheEntry): boolean {
    const now = Date.now()
    return (now - entry.timestamp) < this.CACHE_TTL_MS
  }

  private getCachedProofs(bundleId: string, filePath: string, taskId: string): FileProof[] | null {
    const cacheKey = this.getCacheKey(bundleId, filePath, taskId)
    const entry = this.proofCache.get(cacheKey)
    
    if (entry && this.isCacheEntryValid(entry)) {
      console.log(`Cache HIT for bundle: ${bundleId}, file: ${filePath}`)
      return entry.proofs
    }
    
    if (entry) {
      console.log(`Cache EXPIRED for bundle: ${bundleId}, file: ${filePath}`)
      this.proofCache.delete(cacheKey)
    }
    
    return null
  }

  private setCachedProofs(bundleId: string, filePath: string, taskId: string, proofs: FileProof[]): void {
    const cacheKey = this.getCacheKey(bundleId, filePath, taskId)
    this.proofCache.set(cacheKey, {
      proofs,
      timestamp: Date.now()
    })
    console.log(`Cache SET for bundle: ${bundleId}, file: ${filePath}`)
  }

  private startCacheCleanup(): void {
    // Clean up expired cache entries every 30 seconds
    setInterval(() => {
      const now = Date.now()
      let cleanedCount = 0
      
      for (const [key, entry] of this.proofCache.entries()) {
        if (!this.isCacheEntryValid(entry)) {
          this.proofCache.delete(key)
          cleanedCount++
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`Cache cleanup: removed ${cleanedCount} expired entries. Cache size: ${this.proofCache.size}`)
      }
    }, 30000) // Run every 30 seconds
  }

  private async getProofInfoFromJackal(bundleId: string, filePath: string, taskId: string): Promise<FileProof[]> {
    try {
      // Check cache first
      const cachedProofs = this.getCachedProofs(bundleId, filePath, taskId)
      if (cachedProofs) {
        return cachedProofs
      }

      console.log(`Getting proof info for bundle: ${bundleId}, file: ${filePath}`)
            
      // Extract proof information from the CAF
      const proofs = await this.jjs?.getProofs(bundleId)
      const result = proofs || []
      
      // Cache the result
      this.setCachedProofs(bundleId, filePath, taskId, result)
      
      return result
    } catch (error) {
      console.error(`Failed to get proof info for bundle ${bundleId}:`, error)
      throw new Error(`Failed to retrieve proof information: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  public async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server = this.app.listen(this.config.port, () => {
        console.log(`Web server started on port ${this.config.port}`)
        console.log(`Worker ID: ${this.config.workerId}`)
        console.log(`Health check: http://localhost:${this.config.port}/health`)
        console.log(`File endpoint: http://localhost:${this.config.port}/file/:taskId/:filePath`)
        console.log(`File info endpoint: http://localhost:${this.config.port}/file-info/:taskId/:filePath`)
        console.log(`File proof endpoint: http://localhost:${this.config.port}/file-proof/:taskId/:filePath`)
        resolve()
      })

      this.server.on('error', (error: Error) => {
        console.error('Web server error:', error)
        reject(error)
      })
    })
  }

  public async stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Web server stopped')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}
