import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'

dotenv.config()

export class WasabiClient {
  private client: S3Client
  private bucket: string
  private region: string

  constructor() {
    this.bucket = process.env.WASABI_BUCKET || ''
    this.region = process.env.WASABI_REGION || 'ca-central-1'
    const endpoint = process.env.WASABI_ENDPOINT || 'https://s3.ca-central-1.wasabisys.com'
    
    if (!process.env.WASABI_ACCESS || !process.env.WASABI_SECRET) {
      throw new Error('WASABI_ACCESS and WASABI_SECRET environment variables are required')
    }

    // Initialize S3 client with Wasabi configuration
    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.WASABI_ACCESS,
        secretAccessKey: process.env.WASABI_SECRET,
      },
      endpoint: endpoint, // Configurable endpoint (Wasabi or MinIO)
      forcePathStyle: true, // Required for Wasabi/MinIO
    })

    console.log(`Wasabi client initialized for region: ${this.region}, endpoint: ${endpoint}`)
  }

  /**
   * Download a file from Wasabi
   * @param filePath - The key/path of the file in the bucket
   * @returns Promise<Buffer> - The file data as a buffer
   */
  async downloadFile(filePath: string): Promise<Buffer> {
    console.log(`Downloading file from Wasabi bucket=${this.bucket} key=${filePath}`)
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: filePath,
      })

      const response = await this.client.send(command)
      
      if (!response.Body) {
        throw new Error('No body in response')
      }

      // Convert the readable stream to buffer
      const chunks: Uint8Array[] = []
      const reader = response.Body.transformToWebStream().getReader()
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      const buffer = Buffer.concat(chunks)
      console.log(`Successfully downloaded file: ${filePath}`)
      return buffer
    } catch (error) {
      console.error(`Failed to download file from bucket=${this.bucket} key=${filePath}:`, error)
      throw new Error(`Failed to download file from bucket=${this.bucket} key=${filePath}: ${error}`)
    }
  }

  /**
   * Download a file from Wasabi as a proper Node.js stream
   * @param filePath - The key/path of the file in the bucket
   * @returns Promise<{stream: NodeJS.ReadableStream, contentLength: number}> - The file stream and size
   */
  async downloadFileStream(filePath: string): Promise<{stream: NodeJS.ReadableStream, contentLength: number}> {
    console.log(`Downloading file stream from Wasabi bucket=${this.bucket} key=${filePath}`)
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: filePath,
      })

      const response = await this.client.send(command)
      
      if (!response.Body) {
        throw new Error('No body in response')
      }

      const contentLength = response.ContentLength || 0
      
      // Create a true streaming implementation that reads chunks on-demand
      console.log(`Creating streaming reader for: ${filePath}`)
      
      const { Readable } = await import('stream')
      const webStream = response.Body.transformToWebStream()
      const reader = webStream.getReader()
      
      // Create a custom Readable stream that reads from AWS on-demand
      class AWSStreamReader extends Readable {
        private reader: ReadableStreamDefaultReader<Uint8Array>
        private isReading = false
        private drainHandler: (() => void) | null = null
        
        constructor(reader: ReadableStreamDefaultReader<Uint8Array>) {
          super()
          this.reader = reader
          
          // Set up a single, persistent drain handler
          this.drainHandler = () => {
            this.isReading = false
            this._read()
          }
          
          // Increase max listeners to prevent warnings during high-throughput scenarios
          this.setMaxListeners(20)
        }
        
        _read() {
          if (this.isReading) return
          this.isReading = true
          this._readNextChunk()
        }
        
        private async _readNextChunk() {
          try {
            const { done, value } = await this.reader.read()
            if (done) {
              this.isReading = false
              this.push(null) // End of stream
              return
            }
            
            // Push the chunk - if buffer is full, this will pause
            if (!this.push(Buffer.from(value))) {
              // Add drain listener only if not already present
              if (this.listenerCount('drain') === 0) {
                this.on('drain', this.drainHandler!)
              }
            } else {
              // Continue reading next chunk
              this.isReading = false
              this._readNextChunk()
            }
          } catch (error) {
            this.isReading = false
            this.destroy(error instanceof Error ? error : new Error(String(error)))
          }
        }
        
        _destroy(error: Error | null, callback: (error: Error | null) => void) {
          // Remove drain listener
          if (this.drainHandler) {
            this.off('drain', this.drainHandler)
          }
          
          // Clean up the reader when stream is destroyed
          if (this.reader) {
            this.reader.releaseLock();
          }
          callback(error);
        }
      }
      
      const stream = new AWSStreamReader(reader)
      console.log(`Stream created, will read chunks on-demand: ${filePath}`)
      
      console.log(`Successfully created file stream: ${filePath} (${contentLength} bytes)`)
      return { stream, contentLength }
    } catch (error) {
      console.error(`Failed to download file stream from bucket=${this.bucket} key=${filePath}:`, error)
      throw new Error(`Failed to download file stream from bucket=${this.bucket} key=${filePath}: ${error}`)
    }
  }

}

// Export a singleton instance
export const wasabiClient = new WasabiClient() 