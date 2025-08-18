import amqp from 'amqplib/callback_api'
import dotenv from 'dotenv'
import { localJjs } from './jackalClient'

dotenv.config()

async function main() {
  const jjs = await localJjs.init()
  const queueName = 'jackal_save'

  try {
    const connStr = `amqp://${process.env.RABBIT_HOST}`
    amqp.connect(connStr, function(error0: Error | null, connection: amqp.Connection) {
      if (error0) {
        throw error0
      }
      connection.createChannel(function(error1: Error | null, channel: amqp.Channel) {
        if (error1) {
          throw error1
        }

        channel.assertQueue(queueName, {
          durable: true,
        })

        channel.prefetch(1) // Only process one message at a time
        console.log(
          `[x] Waiting for messages in ${queueName}. To exit press CTRL+C \n`,
        )

        channel.consume(
          queueName,
          async function(msg: amqp.Message | null) {
            if (!msg) return
            try {
              const messageContent = msg.content.toString()
              console.log('messageContent', messageContent)
              // const msgJson = JSON.parse(messageContent)
              await jjs.uploadToJackal(messageContent)
              channel.ack(msg)
            } catch (err) {
              console.error(
                'Error processing message:',
                err instanceof Error ? err.message : String(err),
              )
              channel.nack(msg, false, true)
            }
          },
          {
            noAck: false,
          },
        )
      })
    })
  } catch (err) {
    console.error(err)
  }
}

main()
