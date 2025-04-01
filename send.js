const amqp = require("amqplib/callback_api");
const readline = require("readline");

// Export the queue name without executing the main code
const queue = "queue1";
module.exports = { queue };

// Only execute the main code if this file is run directly
if (require.main === module) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  amqp.connect("amqp://localhost", function (error0, connection) {
    if (error0) {
      throw error0;
    }
    connection.createChannel(function (error1, channel) {
      if (error1) {
        throw error1;
      }

      channel.assertQueue(queue, {
        durable: false,
      });

      function askForMessage() {
        rl.question('Enter filename to send (or "exit" to quit): ', (msg) => {
          if (msg.toLowerCase() === "exit") {
            connection.close();
            rl.close();
            process.exit(0);
          }

          channel.sendToQueue(queue, Buffer.from(msg));
          console.log(`[x] Sent ${msg}`);
          askForMessage();
        });
      }

      console.log('Ready to send messages. Enter filenames or "exit" to quit.');
      askForMessage();
    });
  });
}
