import {
  ClientHandler,
  IClientHandler,
  IStorageHandler,
  StorageHandler,
} from "@jackallabs/jackal.js";
import dotenv from "dotenv";
import { testnet } from "./config";
import fs from "fs";
export const BASE_FOLDER = "test";
import { openFolder } from "./jackal";

const filePath = "/Users/rodneyshen/Desktop/jkl/dummy_data/hello.txt";

dotenv.config();

async function initJackalClients(keyEnvVar: string = "JKL_SECRET_KEY1") {
  let clientHandler: IClientHandler;
  let storageHandler: IStorageHandler;

  try {
    clientHandler = await ClientHandler.connect({
      ...testnet,
      selectedWallet: "mnemonic",
      mnemonic: process.env[keyEnvVar],
    });

    const fileBuffer = fs.readFileSync(filePath);
    const fileData = new File([fileBuffer], "hello.txt", {
      type: "text/plain",
      lastModified: Date.now(),
    });

    storageHandler = await StorageHandler.init(clientHandler, {
      setFullSigner: true,
    });

    // Initialize storage if needed
    await storageHandler.initStorage();
    try {
      await openFolder(storageHandler, `Home/${BASE_FOLDER}`);
    } catch (err) {
      console.log(`Creating storage root: ${BASE_FOLDER}`);
      // Create S3 root folder
      await storageHandler.createFolders({ names: BASE_FOLDER });
      await openFolder(storageHandler, "Home");
    }

    console.log("Jackal.js client initialized successfully");

    await storageHandler.loadProviderPool();

    await storageHandler.upgradeSigner();

    console.log("[INFO] - Waiting 5 seconds before upload...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log("[INFO] - Queuing file for private upload...");
    await storageHandler.queuePrivate([fileData]);

    console.log("[INFO] - Processing upload queue...");
    await storageHandler.processAllQueues();

    console.log("[SUCCESS] - File uploaded successfully");

    //return { clientHandler, storageHandler };
  } catch (error) {
    console.error("Failed to initialize Jackal.js client:", error);
    process.exit(1);
  }
}

initJackalClients();

// async function main() {
//   const { storageHandler } = await initJackalClients();

//   await uploadFile(storageHandler);
// }

// main().catch(console.error);
