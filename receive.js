const amqp = require("amqplib/callback_api");
const fs = require("fs").promises;
const path = require("path");

const QUEUE_NAME = "queue1";
let queue;
try {
  queue = require("./send").queue;
} catch (error) {
  console.warn(
    "Could not import queue from send.js, using default:",
    QUEUE_NAME
  );
  queue = QUEUE_NAME;
}

const fetchFile = async (filename) => {
  try {
    const filePath = path.join(
      "/Users/rodneyshen/Desktop/jkl/dummy_data",
      filename
    );

    const data = await fs.readFile(filePath, "utf8");
    console.log("File contents:", data);
  } catch (error) {
    console.error("Error reading file:", error.message);
    throw error;
  }
};

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

    console.log(
      `[x] Waiting for messages in ${queue}. To exit press CTRL+C \n`
    );

    channel.consume(
      queue,
      async function (msg) {
        try {
          console.log(`[x] Received filename: ${msg.content.toString()}`);
          await fetchFile(msg.content.toString());
        } catch (error) {
          console.error("Error processing message:", error.message);
        }
      },
      {
        noAck: true,
      }
    );
  });

  process.on("SIGINT", () => {
    connection.close();
    process.exit(0);
  });
});
