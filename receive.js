const amqp = require("amqplib/callback_api");
const fs = require("fs").promises;
const path = require("path");
const {
  initJackalClients,
  simpleUploadFile,
  BASE_JACKAL_FOLDER,
} = require("./dist/src/jackal");

const keyEnvVar = process.argv[2] || "JKL_SECRET_KEY1";

const QUEUE_NAME = "queue1";

let jackalInitialized = false;
let storageHandler;

async function initializeJackal() {
  try {
    const handlers = await initJackalClients(keyEnvVar);
    jackalInitialized = true;

    // Store the storage handler for later use
    if (handlers && handlers.storageHandler) {
      storageHandler = handlers.storageHandler;
      console.log("Successfully captured storage handler reference");
    } else {
      console.warn("Storage handler not returned from initJackalClients");
    }

    console.log(`Initialized Jackal client with key from ${keyEnvVar}`);
  } catch (error) {
    console.error("Failed to initialize Jackal client:", error);
  }
}

async function checkStoragePlan() {
  if (!storageHandler) {
    console.error("Storage handler not available, cannot check storage plan");
    return false;
  }

  try {
    console.log("Checking storage plan status...");
    try {
      await storageHandler.upgradeSigner();
      console.log("Successfully upgraded signer capabilities");
    } catch (signerError) {
      console.error("Error upgrading signer:", signerError.message);
      return false; // Don't continue if we can't upgrade the signer
    }

    // Check plan status
    let planStatus;
    try {
      planStatus = await storageHandler.planStatus();
      console.log("Storage plan status:", JSON.stringify(planStatus, null, 2));

      if (planStatus && planStatus.active) {
        console.log("Active storage plan found");
        return true;
      }
    } catch (statusError) {
      console.error("Error checking plan status:", statusError.message);
      // Continue to purchase a plan if we can't check status
    }

    console.log(
      "No active storage plan found. Attempting to purchase a storage plan..."
    );

    // Try to purchase a storage plan
    try {
      const result = await storageHandler.purchaseStoragePlan({
        gb: 1,
        days: 30,
      });
      console.log(
        "Storage plan purchased successfully:",
        JSON.stringify(result, null, 2)
      );

      // Wait for the blockchain to process the transaction
      console.log(
        "Waiting for storage plan to be activated on the blockchain..."
      );
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second delay

      // Verify the plan is now active
      try {
        const updatedStatus = await storageHandler.planStatus();
        console.log(
          "Updated storage plan status:",
          JSON.stringify(updatedStatus, null, 2)
        );

        if (updatedStatus && updatedStatus.active) {
          console.log("Storage plan is now active");
          return true;
        } else {
          console.error(
            "Storage plan was purchased but is not showing as active yet"
          );
          return false;
        }
      } catch (verifyError) {
        console.error(
          "Error verifying storage plan after purchase:",
          verifyError.message
        );
        return false;
      }
    } catch (purchaseError) {
      console.error("Failed to purchase storage plan:", purchaseError.message);
      console.error("Purchase error details:", purchaseError);
      return false;
    }
  } catch (error) {
    console.error("Error checking/purchasing storage plan:", error.message);
    console.error("Error details:", error);
    return false;
  }
}

const fetchFile = async (filename) => {
  try {
    const filePath = path.join(
      "/Users/rodneyshen/Desktop/jkl/dummy_data",
      filename
    );

    const data = await fs.readFile(filePath, "utf8");
    console.log("File contents:", data);

    if (jackalInitialized) {
      try {
        const uploadPath = `${BASE_JACKAL_FOLDER}/${filename}`;
        console.log(
          `Attempting to upload file to Jackal at path: ${uploadPath}`
        );
        await simpleUploadFile(filePath, uploadPath);
        console.log(`File uploaded to Jackal at: ${uploadPath}`);
      } catch (uploadError) {
        console.error("Error uploading to Jackal:", uploadError.message);
      }
    } else {
      console.warn("Jackal client not initialized, skipping upload");
    }

    return data;
  } catch (error) {
    console.error("Error reading file:", error.message);
    throw error;
  }
};

let isProcessing = false;

initializeJackal().then(() => {
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
        // switch to True in prod.
      });
      channel.prefetch(1); // Only process one message at a time
      console.log(
        `[x] Waiting for messages in ${QUEUE_NAME}. To exit press CTRL+C \n`
      );

      channel.consume(
        QUEUE_NAME,
        async function (msg) {
          if (isProcessing) {
            // If already processing a message, requeue this one
            channel.nack(msg, false, true);
            return;
          }

          isProcessing = true;
          try {
            console.log(`[x] Received filename: ${msg.content.toString()}`);
            await fetchFile(msg.content.toString());

            channel.ack(msg);

            setTimeout(() => {
              isProcessing = false;
            }, 100);
          } catch (error) {
            console.error("Error processing message:", error.message);
            channel.nack(msg, false, true);

            setTimeout(() => {
              isProcessing = false;
            }, 100);
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
