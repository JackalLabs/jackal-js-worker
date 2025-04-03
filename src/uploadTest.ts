import {
  ClientHandler,
  IClientHandler,
  IStorageHandler,
  StorageHandler,
} from "@jackallabs/jackal.js";
import dotenv from "dotenv";
import { openFolder } from "./jackal";
import { testnet } from "./config";

export const BASE_FOLDER = "test";
let clientHandler: IClientHandler;
let storageHandler: IStorageHandler;

dotenv.config();
const JKL_MNEMONIC = process.env.JKL_SECRET_KEY1;

export async function initJackalClients() {
  try {
    clientHandler = await ClientHandler.connect({
      ...testnet,
      selectedWallet: "mnemonic",
      mnemonic: JKL_MNEMONIC,
    });

    storageHandler = await StorageHandler.init(clientHandler, {
      setFullSigner: true,
    });

    // Initialize storage if needed
    await storageHandler.initStorage();
    try {
      console.log(await storageHandler.listChildFolderMetas());
      //console.log(`Home/${BASE_FOLDER}`);
      await openFolder("Home");
    } catch (err) {
      console.log(`Creating storage root: ${BASE_FOLDER}`);
      // Create S3 root folder
      await storageHandler.createFolders({ names: [BASE_FOLDER] });
      await openFolder("Home");
    }

    await storageHandler.loadProviderPool();

    console.log("Jackal.js client initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Jackal.js client:", error);
    process.exit(1);
  }
}

initJackalClients();
