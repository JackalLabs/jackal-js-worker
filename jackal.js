import {
  ClientHandler,
  IClientHandler,
  IStorageHandler,
  StorageHandler,
} from "@jackallabs/jackal.js";

let clientHandler;
let storageHandler;
const BASE_FOLDER = "test";

async function openFolder(path, count) {
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
