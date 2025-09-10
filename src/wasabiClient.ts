import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Sanitizes a path for S3 compatibility by replacing special characters
 * with their text equivalents to avoid S3 key issues
 * @param path - The path to sanitize
 * @returns The sanitized path safe for S3 keys
 */
function sanitizeS3Path(path: string): string {
  const replacements: Record<string, string> = {
    '+': 'PLUS',
    '=': 'EQUALS',
    ':': 'COLON',
    '\\': 'BACKSLASH',
    '{': 'LBRACE',
    '}': 'RBRACE',
    '^': 'CARET',
    '%': 'PERCENT',
    '`': 'BACKTICK',
    '[': 'LBRACKET',
    ']': 'RBRACKET',
    '"': 'QUOTE',
    '~': 'TILDE',
    '|': 'PIPE',
    '<': 'LT',
    '>': 'GT',
    ';': 'SEMICOLON',
    ',': 'COMMA',
    '?': 'QUESTION',
    '*': 'ASTERISK',
    '&': 'AMPERSAND',
    '$': 'DOLLAR',
    '@': 'AT',
  }
  
  let result = path
  for (const [oldChar, newChar] of Object.entries(replacements)) {
    result = result.split(oldChar).join(newChar)
  }
  
  return result
}

export class WasabiClient {
  private client: S3Client
  private bucket: string
  private region: string

  constructor() {
    this.bucket = process.env.WASABI_BUCKET || ''
    this.region = process.env.WASABI_REGION || 'us-east-1' // Default to us-east-1 for MinIO compatibility
    const endpoint = process.env.WASABI_ENDPOINT || 'http://localhost:9000' // Default to MinIO local endpoint
    
    if (!process.env.WASABI_ACCESS || !process.env.WASABI_SECRET) {
      throw new Error('WASABI_ACCESS and WASABI_SECRET environment variables are required')
    }

    // Initialize S3 client with Wasabi/MinIO configuration
    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.WASABI_ACCESS,
        secretAccessKey: process.env.WASABI_SECRET,
      },
      endpoint: endpoint, // Configurable endpoint (Wasabi or MinIO)
      forcePathStyle: true, // Required for Wasabi/MinIO
    })

    console.log(`S3 client initialized for region: ${this.region}, endpoint: ${endpoint}`)
  }

  /**
   * Download a file from Wasabi
   * @param filePath - The key/path of the file in the bucket
   * @returns Promise<Buffer> - The file data as a buffer
   */
  async downloadFile(filePath: string): Promise<Buffer> {
    const sanitizedPath = sanitizeS3Path(filePath)
    console.log(`Downloading file from Wasabi bucket=${this.bucket} key=${sanitizedPath} (original: ${filePath})`)
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: sanitizedPath,
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
      console.log(`Successfully downloaded file: ${sanitizedPath}`)
      return buffer
    } catch (error) {
      console.error(`Failed to download file from bucket=${this.bucket} key=${sanitizedPath} endpoint=${this.client.config.endpoint}:`, error)
      throw new Error(`Failed to download file from bucket=${this.bucket} key=${sanitizedPath} endpoint=${this.client.config.endpoint}: ${error}`)
    }
  }

  /**
   * Download a file from Wasabi as a proper Node.js stream
   * @param filePath - The key/path of the file in the bucket
   * @returns Promise<{stream: NodeJS.ReadableStream, contentLength: number}> - The file stream and size
   */
  async downloadFileStream(filePath: string): Promise<{stream: NodeJS.ReadableStream, contentLength: number}> {
    const sanitizedPath = sanitizeS3Path(filePath)
    console.log(`Downloading file stream from Wasabi bucket=${this.bucket} key=${sanitizedPath} (original: ${filePath})`)
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: sanitizedPath,
      })

      const response = await this.client.send(command)
      
      if (!response.Body) {
        throw new Error('No body in response')
      }

      const contentLength = response.ContentLength || 0
      
      // Create a true streaming implementation that reads chunks on-demand
      console.log(`Creating streaming reader for: ${sanitizedPath}`)
      
      const { Readable } = await import('stream')
      const webStream = response.Body.transformToWebStream()
      const reader = webStream.getReader()
      
      // Create a custom Readable stream that reads from AWS on-demand
      class AWSStreamReader extends Readable {
        private reader: ReadableStreamDefaultReader<Uint8Array>
        private isReading = false
        private isDestroyed = false
        
        constructor(reader: ReadableStreamDefaultReader<Uint8Array>) {
          super({
            highWaterMark: 64 * 1024, // 64KB buffer
            objectMode: false
          })
          this.reader = reader
          
          // Increase max listeners to prevent warnings during high-throughput scenarios
          this.setMaxListeners(20)
        }
        
        _read() {
          if (this.isReading || this.isDestroyed) return
          this.isReading = true
          this._readNextChunk()
        }
        
        private async _readNextChunk() {
          if (this.isDestroyed) return
          
          try {
            const { done, value } = await this.reader.read()
            if (done) {
              this.isReading = false
              this.push(null) // End of stream
              return
            }
            
            // Push the chunk
            const buffer = Buffer.from(value)
            const pushed = this.push(buffer)
            
            if (pushed) {
              // Continue reading next chunk immediately
              this.isReading = false
              setImmediate(() => this._readNextChunk())
            } else {
              // Buffer is full, wait for drain event
              this.isReading = false
              this.once('drain', () => {
                if (!this.isDestroyed) {
                  this._readNextChunk()
                }
              })
            }
          } catch (error) {
            this.isReading = false
            this.destroy(error instanceof Error ? error : new Error(String(error)))
          }
        }
        
        _destroy(error: Error | null, callback: (error: Error | null) => void) {
          this.isDestroyed = true
          
          // Clean up the reader when stream is destroyed
          if (this.reader) {
            this.reader.releaseLock();
          }
          callback(error);
        }
      }
      
      const stream = new AWSStreamReader(reader)
      console.log(`Stream created, will read chunks on-demand: ${sanitizedPath}`)
      
      console.log(`Successfully created file stream: ${sanitizedPath} (${contentLength} bytes)`)
      return { stream, contentLength }
    } catch (error) {
      console.error(`Failed to download file stream from bucket=${this.bucket} key=${sanitizedPath} endpoint=${this.client.config.endpoint}:`, error)
      throw new Error(`Failed to download file stream from bucket=${this.bucket} key=${sanitizedPath} endpoint=${this.client.config.endpoint}: ${error}`)
    }
  }

}

// Export a singleton instance
export const wasabiClient = new WasabiClient() 