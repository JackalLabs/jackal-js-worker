import * as amqp from "amqplib/callback_api";
import * as readline from "readline";

// Export the queue name without executing the main code
export const queue = "queue1";

// Only execute the main code if this file is run directly
if (require.main === module) {
  const rl: readline.Interface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  amqp.connect(
    "amqp://localhost",
    function (error0: Error | null, connection: amqp.Connection) {
      if (error0) {
        throw error0;
      }
      connection.createChannel(function (
        error1: Error | null,
        channel: amqp.Channel
      ) {
        if (error1) {
          throw error1;
        }

        channel.assertQueue(queue, {
          durable: false,
        });

        function askForMessage(): void {
          rl.question(
            'Enter filename to send (or "exit" to quit): ',
            (msg: string) => {
              if (!msg || msg.trim() === "" || msg === "/") {
                console.log('Please enter a filename or "exit" to quit.');
                askForMessage();
              } else if (msg.toLowerCase() === "exit") {
                connection.close();
                rl.close();
                process.exit(0);
              }
              channel.sendToQueue(queue, Buffer.from(msg));
              console.log(`[x] Sent ${msg}`);
              askForMessage();
            }
          );
        }

        console.log(
          'Ready to send messages. Enter filenames or "exit" to quit.'
        );
        askForMessage();
      });
    }
  );
}
