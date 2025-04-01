import {
  ClientHandler,
  IClientHandler,
  IStorageHandler,
  StorageHandler,
} from "@jackallabs/jackal.js";

import dotenv from "dotenv";

import { testnet } from "./config";

const BASE_FOLDER = "test";

dotenv.config();
export async function openFolder(
  path: string,
  count: number = 0
): Promise<void> {
  if (count >= 10) {
    throw new Error(`Failed to open folder after 10 attempts: ${path}`);
  }

  try {
    await storageHandler.loadDirectory({ path });
  } catch (error) {
    console.log("Failed to load folder, trying again", path);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return openFolder(path, count + 1);
  }
}

let clientHandler: IClientHandler;
let storageHandler: IStorageHandler;

export async function initJackalClients() {
  try {
    clientHandler = await ClientHandler.connect({
      ...testnet,
      selectedWallet: "mnemonic",
      mnemonic: process.env.JKL_SECRET_KEY,
    });

    storageHandler = await StorageHandler.init(clientHandler, {
      setFullSigner: true,
    });

    await storageHandler.initStorage();
    try {
      await openFolder(`Home/${BASE_FOLDER}`);
    } catch (err) {
      console.log(`Creating storage root: ${BASE_FOLDER}`);
      // Create S3 root folder
      await storageHandler.createFolders({ names: BASE_FOLDER });
      await openFolder("Home");
    }
    await storageHandler.loadProviderPool();

    console.log("Jackal.js client initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Jackal.js client:", error);
    process.exit(1);
  }
}

// Add a function to upload files
export async function uploadFile(filePath: string, destination: string) {
  try {
    const parts = destination.split("/");
    const fileName = parts.pop() || "";
    const dirPath = parts.join("/");

    await openFolder(dirPath);

    await storageHandler.createFolders({ names: fileName });

    console.log(`File uploaded successfully to ${destination}`);
    return true;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
}
