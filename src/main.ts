  import amqp from 'amqplib/callback_api'
import dotenv from 'dotenv'
import { localJjs } from './jackalClient'
import { CAFSerializer } from './cafSerializer'
import { wasabiClient } from './wasabiClient'
import { database } from './database'

dotenv.config()

// CAF configuration constants
const CAF_MAX_SIZE_GB = 1.75
const CAF_MAX_SIZE_BYTES = CAF_MAX_SIZE_GB * 1024 * 1024 * 1024
const prefetch = 1000

  interface PendingMessage {
    msg: amqp.Message
    taskId: string
    filePath: string
  }

  class CAFBatchProcessor {
  private jjs: localJjs
  private database = database
  private currentCAF: CAFSerializer | null = null
  private pendingMessages: PendingMessage[] = []
  private inactivityTimer: NodeJS.Timeout | null = null
  private readonly INACTIVITY_TIMEOUT_MS = 30000 // 10 seconds

    constructor(jjs: localJjs) {
      this.jjs = jjs
    }

    /**
     * Start or reset the inactivity timer
     */
    private startInactivityTimer(channel: amqp.Channel): void {
      // Clear existing timer if any
      if (this.inactivityTimer) {
        clearTimeout(this.inactivityTimer)
      }
      
      // Start new timer
      this.inactivityTimer = setTimeout(async () => {
        console.log('Inactivity timeout reached, finalizing current CAF...')
        await this.finalizeCurrentCAF(channel)
      }, this.INACTIVITY_TIMEOUT_MS)
    }

    /**
     * Clear the inactivity timer
     */
    private clearInactivityTimer(): void {
      if (this.inactivityTimer) {
        clearTimeout(this.inactivityTimer)
        this.inactivityTimer = null
      }
    }

    /**
     * Cleanup method to clear timers
     */
    cleanup(): void {
      this.clearInactivityTimer()
    }

    async processMessage(msg: amqp.Message, channel: amqp.Channel): Promise<void> {
      let stream: NodeJS.ReadableStream | null = null;
      try {
        const messageContent = msg.content.toString()
        const msgJson = JSON.parse(messageContent)
        const filePath = msgJson.file_path
        const taskId = msgJson.task_id

                 // Download file stream from Wasabi
         console.log(`Streaming file from Wasabi: ${filePath}`)
         const streamResult = await wasabiClient.downloadFileStream(filePath)
         stream = streamResult.stream
         const { contentLength } = streamResult
         console.log(`Got file stream from Wasabi: ${filePath} (${contentLength} bytes)`)

         // Initialize CAF if needed
         if (!this.currentCAF) {
           this.currentCAF = new CAFSerializer(undefined, CAF_MAX_SIZE_GB)
           console.log(`Initialized new CAF archive (${CAF_MAX_SIZE_GB}GB limit)`)
         } else {
           console.log(`CAF already initialized with limit: ${CAF_MAX_SIZE_GB}GB`)
         }

         // Create filename using task+filepath
         const cafFileName = `${taskId}/${filePath}`

         // Start/reset inactivity timer for any activity
         this.startInactivityTimer(channel)

         // Try to add file stream to current CAF
         console.log(`CAF size limit: ${this.currentCAF.getMaxSizeGB().toFixed(2)}GB (${this.currentCAF.getMaxSize()} bytes)`)
         const added = await this.currentCAF.addFileFromStream(cafFileName, stream, contentLength)
        if (added) {
          // File added successfully, track the message
          this.pendingMessages.push({ msg, taskId, filePath })
          console.log(`Added file to CAF: ${cafFileName} (${contentLength} bytes)`)
          console.log(`CAF current size: ${this.currentCAF.getCurrentSize()} bytes (${this.pendingMessages.length} files)`)
        } else {
          // CAF full - finalize current and start new
          console.log(`CAF full (${this.currentCAF.getCurrentSize()} bytes), finalizing current and starting new`)
          await this.finalizeCurrentCAF(channel)
          
          // Reset inactivity timer since we're starting a new CAF
          this.startInactivityTimer(channel)
          
          // Start new CAF and add the file stream
          this.currentCAF = new CAFSerializer(undefined, CAF_MAX_SIZE_GB)
          // Get a fresh stream since the original was consumed
          const streamResult2 = await wasabiClient.downloadFileStream(filePath)
          const newStream = streamResult2.stream
          const { contentLength: newContentLength } = streamResult2
          await this.currentCAF.addFileFromStream(cafFileName, newStream, newContentLength)
          this.pendingMessages.push({ msg, taskId, filePath })
          console.log(`Added file to new CAF: ${cafFileName} (${newContentLength} bytes)`)
          
          // Start inactivity timer for new CAF
          this.startInactivityTimer(channel)
        }

        if (this.pendingMessages.length >= prefetch) {
          console.log(`Reached ${prefetch} files, finalizing current CAF...`)
          await this.finalizeCurrentCAF(channel)
          
          // Reset inactivity timer since we're starting fresh
          this.startInactivityTimer(channel)
        }

      } catch (err) {
        console.error(
          'Error processing message:',
          err instanceof Error ? err.message : String(err),
        )
        // Ensure stream is cleaned up on error
        if (stream && 'destroy' in stream && typeof (stream as any).destroy === 'function') {
          (stream as any).destroy();
        }
        channel.nack(msg, false, true)
      }
    }

    async finalizeCurrentCAF(channel: amqp.Channel): Promise<void> {
      if (!this.currentCAF || this.pendingMessages.length === 0) {
        return
      }

      const currentCAF = this.currentCAF
      const currentMessages = [...this.pendingMessages]
      
      // Reset state immediately to prevent double finalization
      this.currentCAF = null
      this.pendingMessages = []
      
      // Clear inactivity timer since we're finalizing
      this.clearInactivityTimer()

      try {
        // Finalize the CAF archive
        const cafPath = await currentCAF.finalize()
        console.log(`CAF archive finalized: ${cafPath}`)
        console.log(`Archive contains ${currentCAF.getFileList().length} files`)

        // Upload CAF to Jackal
        const cafFileName = `batch_${Date.now()}.caf`
        await this.jjs.uploadCAFToJackal(cafFileName, cafPath)
        console.log(`CAF uploaded to Jackal: ${cafFileName}`)

        // Acknowledge all pending messages and save to database
        for (const pendingMsg of currentMessages) {
          const filePath = pendingMsg.filePath
          const taskId = pendingMsg.taskId

          // Save JackalFile entry to database
          try {
            await this.database.saveJackalFile(filePath, taskId, cafFileName)
            console.log(`Saved JackalFile entry: ${filePath} -> ${cafFileName}`)
          } catch (err) {
            console.error(`Failed to save JackalFile entry for ${filePath}:`, err)
          }

          channel.ack(pendingMsg.msg)
        }
        console.log(`Acknowledged ${currentMessages.length} messages`)

        // Clean up
        await this.cleanupCAF(cafPath)

      } catch (err) {
        console.error('Error finalizing CAF:', err)
        // On error, nack all pending messages
        for (const pendingMsg of currentMessages) {
          channel.nack(pendingMsg.msg, false, true)
        }
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

    while (true) {
      try {
        await keepAlive(jjs, queueName)
      } catch (err) {
        console.error(err)
      }
    }
  }

  main()

  async function keepAlive(jjs: localJjs, queueName: string) {
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

          channel.assertQueue(queueName, {
            durable: true,
          })

          channel.prefetch(prefetch) // Pull 10 messages at a time for simple batching
          console.log(`[x] Waiting for messages in ${queueName}. To exit press CTRL+C \n`)

          const batchProcessor = new CAFBatchProcessor(jjs)

          // Handle graceful shutdown
          process.on('SIGINT', async () => {
            console.log('Received SIGINT, shutting down gracefully...')
            try {
              // Cleanup batch processor
              batchProcessor.cleanup()
              console.log('Batch processor cleaned up')
              
              await database.disconnect()
              console.log('Database disconnected')
            } catch (err) {
              console.error('Error disconnecting from database:', err)
            }
            connection.close()
            process.exit(0)
          })

          // Simple semaphore to ensure sequential processing
          let isProcessing = false
          const messageQueue: amqp.Message[] = []

          channel.consume(
            queueName,
            function(msg: amqp.Message | null) {
              if (!msg) return
              messageQueue.push(msg)
              processNextMessage()
            },
            {
              noAck: false,
            },
          )

          async function processNextMessage() {
            if (isProcessing || messageQueue.length === 0) return
            
            isProcessing = true
            const msg = messageQueue.shift()!
            
            try {
              await batchProcessor.processMessage(msg, channel)
            } finally {
              isProcessing = false
              // Process next message if any are waiting
              if (messageQueue.length > 0) {
                processNextMessage()
              }
            }
          }

          // Keep connection alive
          connection.on('close', () => {
            resolve()
          })

          connection.on('error', (err) => {
            reject(err)
          })
        })
      })
    })
  }
