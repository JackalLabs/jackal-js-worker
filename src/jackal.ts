import {
  ClientHandler,
  IClientHandler,
  IStorageHandler,
  StorageHandler,
} from "@jackallabs/jackal.js";

import dotenv from "dotenv";

import { testnet } from "./config";

export const BASE_JACKAL_FOLDER = "test";

dotenv.config();

async function openFolder(path: string, count: number = 0): Promise<void> {
  if (count >= 10) {
    throw new Error(`Failed to open folder after 10 attempts: ${path}`);
  }

  try {
    await storageHandler.loadDirectory({ path });
  } catch (error) {
    console.error(error);
    console.log("Failed to load folder, trying again", path);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return openFolder(path, count + 1);
  }
}

let clientHandler: IClientHandler;
let storageHandler: IStorageHandler;

// Export the storageHandler for use in other modules
export { storageHandler };

export async function initJackalClients(keyEnvVar: string = "JKL_SECRET_KEY1") {
  try {
    clientHandler = await ClientHandler.connect({
      ...testnet,
      selectedWallet: "mnemonic",
      mnemonic: process.env[keyEnvVar],
    });

    storageHandler = await StorageHandler.init(clientHandler, {
      setFullSigner: true,
    });

    await storageHandler.upgradeSigner();

    console.log("[INFO] - Initializing Jackal storage...");
    await storageHandler.initStorage();

    console.log("[INFO] - Skipping storage plan check/purchase as requested");

    try {
      console.log("Loading Home directory...");
      await openFolder("Home");
    } catch (error) {
      console.error("Error loading Home directory:", error);
      throw error;
    }

    try {
      console.log(`Loading base folder: Home/${BASE_JACKAL_FOLDER}`);
      await openFolder(`Home/${BASE_JACKAL_FOLDER}`);
      console.log(`Base folder Home/${BASE_JACKAL_FOLDER} loaded successfully`);
    } catch (err) {
      console.log(
        `Base folder Home/${BASE_JACKAL_FOLDER} not found, creating it...`
      );

      await openFolder("Home");
      console.log(`Creating folder: ${BASE_JACKAL_FOLDER}`);
      await storageHandler.createFolders({ names: [BASE_JACKAL_FOLDER] });

      await openFolder("Home");

      console.log(
        `Loading newly created base folder: Home/${BASE_JACKAL_FOLDER}`
      );
      await openFolder(`Home/${BASE_JACKAL_FOLDER}`);
      console.log(
        `Base folder Home/${BASE_JACKAL_FOLDER} created and loaded successfully`
      );
    }

    console.log("Jackal.js client initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Jackal.js client:", error);
    process.exit(1);
  }
}

/**
 * A simplified version of uploadFile that handles the full process of uploading a file to Jackal storage
 * @param source Source file path
 * @param destination Destination path in Jackal storage
 */
export async function simpleUploadFile(
  source: string,
  destination: string
): Promise<boolean> {
  try {
    console.log(`Simple upload: ${source} to ${destination}`);

    const cleanDestination = destination.startsWith("/")
      ? destination.substring(1)
      : destination;

    const parts = cleanDestination.split("/");
    const fileName = parts.pop() || "";

    const dirPath = `Home/${BASE_JACKAL_FOLDER}`;
    console.log(`Using base directory: ${dirPath}`);
    console.log(`Preparing to upload file: ${fileName}`);

    console.log(`Reading file from ${source}`);
    const fs = require("fs").promises;
    const fileBuffer = await fs.readFile(source);
    console.log(`File read successfully, size: ${fileBuffer.length} bytes`);

    const File = global.File || require("buffer").File;
    const fileToUpload = new File([fileBuffer], fileName);
    console.log(`Created File object with name: ${fileName}`);

    try {
      console.log("[INFO] - Upgrading signer capabilities...");
      await storageHandler.upgradeSigner();

      console.log("[INFO] - Initializing storage...");
      await storageHandler.initStorage();

      console.log("[INFO] - Loading root directory...");
      await storageHandler.loadDirectory({ path: "Home" });

      console.log("[INFO] - Queuing file for private upload...");
      await storageHandler.queuePrivate([fileToUpload]);

      console.log("[INFO] - Processing upload queue...");
      await storageHandler.processAllQueues();

      console.log(
        `[INFO] - File uploaded successfully to ${dirPath}/${fileName}`
      );
      return true;
    } catch (error) {
      console.error("[ERROR] - Error in upload process:", error);
      throw error;
    }
  } catch (error) {
    console.error(`[ERROR] - Error in simple upload for ${source}:`, error);
    throw error;
  }
}
