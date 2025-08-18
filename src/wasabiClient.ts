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
      endpoint: 'https://s3.ca-central-1.wasabisys.com', // Wasabi endpoint
      forcePathStyle: true, // Required for Wasabi
    })

    console.log(`Wasabi client initialized for region: ${this.region}`)
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

}

// Export a singleton instance
export const wasabiClient = new WasabiClient() 