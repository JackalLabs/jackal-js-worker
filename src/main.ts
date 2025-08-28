  import amqp from 'amqplib/callback_api'
  import dotenv from 'dotenv'
  import { localJjs } from './jackalClient'
  import { CAFSerializer } from './cafSerializer'
  import { wasabiClient } from './wasabiClient'

  dotenv.config()

  interface PendingMessage {
    msg: amqp.Message
    taskId: string
    filePath: string
  }

  class CAFBatchProcessor {
    private jjs: localJjs
    private currentCAF: CAFSerializer | null = null
    private pendingMessages: PendingMessage[] = []
    private readonly MAX_CAF_SIZE = 1.5 * 1024 * 1024 * 1024 // 1.5GB in bytes

    constructor(jjs: localJjs) {
      this.jjs = jjs
    }

    async processMessage(msg: amqp.Message, channel: amqp.Channel): Promise<void> {
      try {
        const messageContent = msg.content.toString()
        const msgJson = JSON.parse(messageContent)
        const filePath = msgJson.file_path
        const taskId = msgJson.task_id

                 // Download file stream from Wasabi
         console.log(`Streaming file from Wasabi: ${filePath}`)
         const { stream, contentLength } = await wasabiClient.downloadFileStream(filePath)
         console.log(`Got file stream from Wasabi: ${filePath} (${contentLength} bytes)`)

         // Initialize CAF if needed
         if (!this.currentCAF) {
           this.currentCAF = new CAFSerializer(undefined, 1.5) // 1.5GB limit
           console.log('Initialized new CAF archive')
         } else {
           console.log('CAF already initialized')
         }

         // Create filename using task+filepath
         const cafFileName = `${taskId}/${filePath}`

         // Try to add file stream to current CAF
         const added = await this.currentCAF.addFileFromStream(cafFileName, stream, contentLength)
        if (added) {
          // File added successfully, track the message
          this.pendingMessages.push({ msg, taskId, filePath })
          console.log(`Added file to CAF: ${cafFileName} (${contentLength} bytes)`)
          console.log(`CAF current size: ${this.currentCAF.getCurrentSize()} bytes (${this.pendingMessages.length} files)`)
        } else {
          // CAF full - finalize current and start new
          console.log('CAF full, finalizing current and starting new')
          await this.finalizeCurrentCAF(channel)
          
          // Start new CAF and add the file stream
          this.currentCAF = new CAFSerializer(undefined, 1.5)
          // Get a fresh stream since the original was consumed
          const { stream: newStream, contentLength: newContentLength } = await wasabiClient.downloadFileStream(filePath)
          await this.currentCAF.addFileFromStream(cafFileName, newStream, newContentLength)
          this.pendingMessages.push({ msg, taskId, filePath })
          console.log(`Added file to new CAF: ${cafFileName} (${newContentLength} bytes)`)
        }

        if (this.pendingMessages.length >= 10) {
          console.log('Reached 10 files, finalizing current CAF...')
          await this.finalizeCurrentCAF(channel)
        }

      } catch (err) {
        console.error(
          'Error processing message:',
          err instanceof Error ? err.message : String(err),
        )
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

      try {
        // Finalize the CAF archive
        const cafPath = await currentCAF.finalize()
        console.log(`CAF archive finalized: ${cafPath}`)
        console.log(`Archive contains ${currentCAF.getFileList().length} files`)

        // Upload CAF to Jackal
        const cafFileName = `batch_${Date.now()}.caf`
        await this.jjs.uploadCAFToJackal(cafFileName, cafPath)
        console.log(`CAF uploaded to Jackal: ${cafFileName}`)

        // Acknowledge all pending messages
        for (const pendingMsg of currentMessages) {
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

          channel.prefetch(10) // Pull 10 messages at a time for simple batching
          console.log(`[x] Waiting for messages in ${queueName}. To exit press CTRL+C \n`)

          const batchProcessor = new CAFBatchProcessor(jjs)

          // Handle graceful shutdown
          process.on('SIGINT', async () => {
            console.log('Received SIGINT, shutting down gracefully...')
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
