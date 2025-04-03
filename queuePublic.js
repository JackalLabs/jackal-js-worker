const amqp = require("amqplib/callback_api");
const fs = require("fs").promises;
const path = require("path");

const QUEUE_NAME = "queue1";

async function loadFilesFromDirectory(directoryPath) {
  try {
    // Read all files in the directory
    const files = await fs.readdir(directoryPath);
    return files.map((file) => ({
      name: file,
      path: path.join(directoryPath, file),
    }));
  } catch (error) {
    console.error("Error reading directory:", error.message);
    return [];
  }
}

function publishToQueue(channel, files) {
  files.forEach((file) => {
    channel.sendToQueue(QUEUE_NAME, Buffer.from(file.name));
    console.log(`[x] Queued file: ${file.name}`);
  });
}

async function main() {
  // You can change this path to your desired directory
  const directoryPath = path.join(__dirname, "dummy_data");

  try {
    // Create directory if it doesn't exist
    await fs.mkdir(directoryPath, { recursive: true });

    // Load files
    console.log(`Loading files from: ${directoryPath}`);
    const files = await loadFilesFromDirectory(directoryPath);

    if (files.length === 0) {
      console.log("No files found in the directory");
      return;
    }

    // Connect to RabbitMQ and publish files
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

        // Publish files to queue
        publishToQueue(channel, files);
        console.log(`Published ${files.length} files to queue`);

        // Close connection after a brief delay to ensure messages are sent
        setTimeout(() => {
          connection.close();
          process.exit(0);
        }, 500);
      });
    });
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
