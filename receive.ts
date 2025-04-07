import * as amqp from "amqplib/callback_api";
import * as path from "path";
import * as fs from "fs";
import { BASE_FOLDER, initJackalClients } from "./src/jackalClient";
import { IClientHandler, IStorageHandler } from "@jackallabs/jackal.js";

const keyEnvVar: string = process.argv[2] || "JKL_SECRET_KEY1";
const QUEUE_NAME: string = "queue1";
const MAX_RETRIES: number = 3;
const RETRY_DELAY: number = 2000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const uploadFile = async (
  filename: string,
  storageHandler: IStorageHandler
): Promise<boolean> => {
  let retries = 0;

  while (retries < MAX_RETRIES) {
    try {
      const filePath = path.join(
        "/Users/rodneyshen/Desktop/jkl/dummy_data",
        filename
      );

      const f = fs.readFileSync(filePath);

      const file = new File([f], filename, {
        type: "text/plain",
        lastModified: Date.now(),
      });

      console.log("[INFO] - Prepared File object:", file);

      console.log(
        `[INFO] - Attempt ${retries + 1}: Queuing file for private upload...`
      );

      const existingFolders = await storageHandler.listChildFolders();

      console.log(
        `[INFO] - Existing folders: ${JSON.stringify(existingFolders)}`
      );

      console.log(`[INFO] - File data: ${file}`);

      await storageHandler.loadDirectory({ path: `Home/${BASE_FOLDER}` });

      await storageHandler.queuePrivate([file]);

      await storageHandler.processAllQueues();

      storageHandler.removeFromQueue(filename);

      console.log(`[INFO] - File uploaded successfully: ${filename}`);
      return true;
    } catch (error) {
      retries++;
      console.error(
        `[ERROR] - Attempt ${retries}: Upload failed:`,
        error instanceof Error ? error.message : String(error)
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
  return false;
};

initJackalClients(keyEnvVar).then(
  (clients: {
    clientHandler: IClientHandler;
    storageHandler: IStorageHandler;
  }) => {
    const storageHandler = clients.storageHandler;

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

          channel.assertQueue(QUEUE_NAME, {
            durable: false,
          });
          channel.prefetch(1); // Only process one message at a time
          console.log(
            `[x] Waiting for messages in ${QUEUE_NAME}. To exit press CTRL+C \n`
          );

          channel.consume(
            QUEUE_NAME,
            async function (msg: amqp.Message | null) {
              if (!msg) return;

              try {
                console.log(`[x] Received filename: ${msg.content.toString()}`);
                await uploadFile(msg.content.toString(), storageHandler);
                channel.ack(msg);
              } catch (error) {
                console.error(
                  "Error processing message:",
                  error instanceof Error ? error.message : String(error)
                );
                // Requeue the message after a delay
                setTimeout(() => {
                  channel.nack(msg, false, true);
                }, RETRY_DELAY);
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
      }
    );
  }
);
