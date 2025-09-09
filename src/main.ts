import amqp from 'amqplib/callback_api'
import dotenv from 'dotenv'
import { localJjs } from './jackalClient'
import { CAFSerializer } from './cafSerializer'
import { wasabiClient } from './wasabiClient'
import { database } from './database'
import { WebServer } from './webServer'

dotenv.config()

// CAF configuration constants
const CAF_MAX_SIZE_GB = 1.75
const CAF_TIMEOUT_MINUTES = parseInt(process.env.CAF_TIMEOUT_MINUTES || '5') // Finalize CAF after X minutes of inactivity

interface PendingMessage {
  msg: amqp.Message
  taskId: string
  filePath: string
} 

class SimpleCAFProcessor {
  private jjs: localJjs
  private database = database
  private currentCAF: CAFSerializer | null = null
  private readonly workerId: string
  private isUploading = false
  private cafTimeout: NodeJS.Timeout | null = null
  private currentChannel: amqp.Channel | null = null
  private processingMessages: PendingMessage[] = []

  constructor(jjs: localJjs) {
    this.jjs = jjs
    this.workerId = process.env.JACKAL_WORKER_ID || '1'
    console.log(`Worker ID: ${this.workerId}`)
    console.log(`CAF timeout: ${CAF_TIMEOUT_MINUTES} minutes`)
  }

  /**
   * Starts or resets the CAF timeout timer
   */
  private startCAFTimeout(): void {
    // Clear existing timeout
    if (this.cafTimeout) {
      clearTimeout(this.cafTimeout)
    }

    // Set new timeout
    this.cafTimeout = setTimeout(async () => {
      console.log(`CAF timeout reached (${CAF_TIMEOUT_MINUTES} minutes), finalizing CAF...`)
      if (this.currentCAF && this.currentChannel) {
        console.log('Finalizing CAF due to timeout...')
        await this.finalizeAndUploadCAF(this.currentChannel)
      } else if (this.currentCAF) {
        console.warn('CAF timeout reached but no channel available, CAF will be finalized on next message')
      }
    }, CAF_TIMEOUT_MINUTES * 60 * 1000) // Convert minutes to milliseconds

    console.log(`CAF timeout started: ${CAF_TIMEOUT_MINUTES} minutes`)
  }


  /**
   * Clears the CAF timeout timer
   */
  private clearCAFTimeout(): void {
    if (this.cafTimeout) {
      clearTimeout(this.cafTimeout)
      this.cafTimeout = null
      console.log('CAF timeout cleared')
    }
  }

  /**
   * Cleanup method to clear timeout when processor is destroyed
   */
  public cleanup(): void {
    this.clearCAFTimeout()
    this.currentChannel = null
    console.log('CAF processor cleaned up')
  }

  async processMessage(msg: amqp.Message, channel: amqp.Channel): Promise<void> {
    // Store the current channel for timeout use
    this.currentChannel = channel
    
    // Don't process new messages while uploading
    if (this.isUploading) {
      console.log('Currently uploading CAF, requeuing message...')
      channel.nack(msg, false, true)
      return
    }


    let stream: NodeJS.ReadableStream | null = null
    
    try {
      const messageContent = msg.content.toString()
      const msgJson = JSON.parse(messageContent)
      const filePath = msgJson.file_path
      const taskId = msgJson.task_id

      this.processingMessages.push({msg, taskId, filePath})

      console.log(`Processing: ${filePath}`)

      // Download file stream from Wasabi
      console.log(`Downloading file from Wasabi: ${filePath}`)
      const streamResult = await wasabiClient.downloadFileStream(filePath)
      stream = streamResult.stream
      const { contentLength } = streamResult
      console.log(`Downloaded file: ${filePath} (${contentLength} bytes)`)
     
      stream.on('end', () => {
        console.log(`Main: Stream ended for ${filePath}`);
      });
      
      stream.on('error', (error) => {
        console.error(`Main: Stream error for ${filePath}:`, error);
      });

      // Create CAF if needed
      if (!this.currentCAF) {
        this.currentCAF = new CAFSerializer(undefined, CAF_MAX_SIZE_GB)
        console.log(`Created new CAF archive (${CAF_MAX_SIZE_GB}GB limit)`)
        // Start timeout timer for new CAF
        this.startCAFTimeout()
      }

      // Create filename using task+filepath
      const cafFileName = `${taskId}/${filePath}`

      // Try to add file to current CAF
      const added = await this.currentCAF.addFileFromStream(cafFileName, stream, contentLength)

      if (added) {
        // File added successfully - reset the timeout timer
        console.log(`Added file to CAF: ${cafFileName} (${contentLength} bytes)`)
        console.log(`CAF current size: ${this.currentCAF.getCurrentSize()} bytes`)
        
        // Reset the timeout timer since we just added a file
        this.startCAFTimeout()
        
        // Check if CAF is full
        if (this.currentCAF.getCurrentSize() >= this.currentCAF.getMaxSize()) {
          console.log('CAF is full, finalizing and uploading...')
          await this.finalizeAndUploadCAF(channel)
        } else {
          // Acknowledge message
          channel.ack(msg)
        }
      } else {
        // CAF full - finalize current and start new
        console.log('CAF full, finalizing current and starting new...')
        await this.finalizeAndUploadCAF(channel)
        
        // Start new CAF and add the file
        this.currentCAF = new CAFSerializer(undefined, CAF_MAX_SIZE_GB)
        const streamResult2 = await wasabiClient.downloadFileStream(filePath)
        const newStream = streamResult2.stream
        const { contentLength: newContentLength } = streamResult2
        await this.currentCAF.addFileFromStream(cafFileName, newStream, newContentLength)
        console.log(`Added file to new CAF: ${cafFileName} (${newContentLength} bytes)`)
        
        // Start timeout timer for new CAF
        this.startCAFTimeout()
        
        // Acknowledge message
        channel.ack(msg)
      }

    } catch (err) {
      console.error('Error processing message:', err instanceof Error ? err.message : String(err))
      
      // Clean up stream on error
      if (stream && 'destroy' in stream && typeof (stream as any).destroy === 'function') {
        (stream as any).destroy()
      }
      
      channel.nack(msg, false, true)
    }
  }

  private async finalizeAndUploadCAF(channel: amqp.Channel): Promise<void> {
    if (!this.currentCAF) {
      return
    }

    // Clear the timeout since we're finalizing the CAF
    this.clearCAFTimeout()

    this.isUploading = true
    const currentCAF = this.currentCAF
    this.currentCAF = null
    this.currentChannel = null // Clear channel reference

    try {
      // Finalize the CAF archive
      const cafPath = await currentCAF.finalize()
      console.log(`CAF archive finalized: ${cafPath}`)
      console.log(`Archive contains ${currentCAF.getFileList().length} files`)



      // Acknowledge all messages in the batch
      for (const msg of this.processingMessages) {
        // Save JackalFile entry to database
        try {
          await this.database.saveJackalFile(msg.taskId, msg.filePath, cafPath, this.workerId)
        } catch (err) {
          console.error(`Failed to save JackalFile entry for ${msg.filePath}:`, err)
        }
      }
      this.processingMessages = []

      // Upload CAF to Jackal
      const cafFileName = `batch_${Date.now()}.caf`
      await this.jjs.uploadCAFToJackal(cafFileName, cafPath)
      console.log(`CAF uploaded to Jackal: ${cafFileName}`)

      // Save to database (we'll need to track files that were added)
      // For now, just log success
      console.log(`CAF processing complete: ${cafFileName}`)

      // Clean up local file
      await this.cleanupCAF(cafPath)

    } catch (err) {
      console.error('Error finalizing/uploading CAF:', err)
    } finally {
      this.isUploading = false
    }
  }

  private async cleanupCAF(cafPath: string): Promise<void> {
    try {
      const fs = await import('fs')
      await fs.promises.unlink(cafPath)
      console.log(`Cleaned up CAF file: ${cafPath}`)
    } catch (err) {
      console.warn(`Failed to cleanup CAF file ${cafPath}:`, err)
    }
  }
}

async function main() {
  const jjs = await localJjs.init()
  const queueName = 'jackal_save'
  
  // Calculate web server port based on worker ID (6700 + workerID)
  const workerId = parseInt(process.env.JACKAL_WORKER_ID || '1')
  const webServerPort = 6700 + workerId
  
  // Start web server
  const webServer = new WebServer(webServerPort)
  await webServer.start()

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...')
    try {
      await webServer.stop()
      console.log('Web server stopped')
      await database.disconnect()
      console.log('Database disconnected')
    } catch (err) {
      console.error('Error during shutdown:', err)
    }
    process.exit(0)
  })

  while (true) {
    try {
      await connectAndProcess(jjs, queueName)
    } catch (err) {
      console.error('Connection error:', err)
      console.log('Retrying in 5 seconds...')
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
}

async function connectAndProcess(jjs: localJjs, queueName: string) {
  const connStr = `amqp://${process.env.RABBIT_HOST}`
  
  return new Promise<void>((resolve, reject) => {
    amqp.connect(connStr, function(error0: Error | null, connection: amqp.Connection) {
      if (error0) {
        reject(error0)
        return
      }

      connection.createChannel(function(error1: Error | null, channel: amqp.Channel) {
        if (error1) {
          reject(error1)
          return
        }

        channel.assertQueue(queueName, { durable: true })
        channel.prefetch(1) // Process one message at a time
        console.log(`[x] Waiting for messages in ${queueName}. To exit press CTRL+C`)

        const processor = new SimpleCAFProcessor(jjs)

        channel.consume(
          queueName,
          async function(msg: amqp.Message | null) {
            if (!msg) return
            
            try {
              await processor.processMessage(msg, channel)
            } catch (err) {
              console.error('Error processing message:', err)
              channel.nack(msg, false, true)
            }
          },
          { noAck: false }
        )

        // Keep connection alive
        connection.on('close', () => {
          console.log('Connection closed, reconnecting...')
          resolve()
        })

        connection.on('error', (err) => {
          console.error('Connection error:', err)
          reject(err)
        })
      })
    })
  })
}

main()
