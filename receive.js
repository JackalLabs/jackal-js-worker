const amqp = require("amqplib/callback_api");
const { initJackalClients } = require("./dist/src/jackalClient");
const path = require("path");
const fs = require("fs");

const keyEnvVar = process.argv[2] || "JKL_SECRET_KEY1";
const QUEUE_NAME = "queue1";
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const uploadFile = async (filename, storageHandler) => {
  let retries = 0;

  while (retries < MAX_RETRIES) {
    try {
      const filePath = path.join(
        "/Users/rodneyshen/Desktop/jkl/dummy_data",
        filename
      );

      const fileBuffer = fs.readFileSync(filePath);
      const fileData = {
        buffer: fileBuffer,
        name: filename,
        type: "application/octet-stream",
        lastModified: Date.now(),
      };

      console.log(
        `[INFO] - Attempt ${retries + 1}: Queuing file for private upload...`
      );
      await storageHandler.queuePrivate([fileData]);

      // Add a small delay before processing queue
      await sleep(500);

      console.log(
        `[INFO] - Attempt ${retries + 1}: Processing upload queue...`
      );
      await storageHandler.processAllQueues();

      console.log(`[INFO] - File uploaded successfully: ${filename}`);
      return true;
    } catch (error) {
      retries++;
      console.error(
        `[ERROR] - Attempt ${retries}: Upload failed:`,
        error.message
      );

      if (retries < MAX_RETRIES) {
        console.log(`[INFO] - Waiting ${RETRY_DELAY}ms before retry...`);
        await sleep(RETRY_DELAY);
      } else {
        console.error("[ERROR] - Max retries reached. Giving up.");
        throw error;
      }
    }
  }
};

let isProcessing = false;

initJackalClients(keyEnvVar).then((clients) => {
  const storageHandler = clients.storageHandler;

  amqp.connect("amqp://localhost", function (error0, connection) {
    if (error0) {
      throw error0;
    }

    connection.createChannel(function (error1, channel) {
      if (error1) {
        throw error1;
      }

      channel.assertQueue(QUEUE_NAME, {
        durable: false,
      });
      channel.prefetch(1); // Only process one message at a time
      console.log(
        `[x] Waiting for messages in ${QUEUE_NAME}. To exit press CTRL+C \n`
      );

      channel.consume(
        QUEUE_NAME,
        async function (msg) {
          if (isProcessing) {
            channel.nack(msg, false, true);
            return;
          }

          isProcessing = true;
          try {
            console.log(`[x] Received filename: ${msg.content.toString()}`);
            await uploadFile(msg.content.toString(), storageHandler);
            channel.ack(msg);
          } catch (error) {
            console.error("Error processing message:", error.message);
            // Requeue the message after a delay
            setTimeout(() => {
              channel.nack(msg, false, true);
            }, RETRY_DELAY);
          } finally {
            setTimeout(() => {
              isProcessing = false;
            }, 1000);
          }
        },
        {
          noAck: false,
        }
      );
    });

    process.on("SIGINT", () => {
      connection.close();
      process.exit(0);
    });
  });
});
