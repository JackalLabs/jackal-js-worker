import {ClientHandler, IClientHandler, IStorageHandler, StorageHandler,} from "@jackallabs/jackal.js";
import dotenv from "dotenv";
import {testnet} from "./config";

export const BASE_FOLDER = "test";

dotenv.config();

export async function initJackalClients(keyEnvVar: string = "JKL_SECRET_KEY1") {
    let clientHandler: IClientHandler;
    let storageHandler: IStorageHandler;

    try {
        clientHandler = await ClientHandler.connect({
            ...testnet,
            selectedWallet: "mnemonic",
            mnemonic: process.env[keyEnvVar],
        });
        storageHandler = await StorageHandler.init(clientHandler, {
            setFullSigner: true,
        });

        await storageHandler.initStorage();
        // try {
        //   await openFolder(storageHandler, `Home/${BASE_FOLDER}`);
        // } catch (err) {
        //   console.log(`Creating storage root: ${BASE_FOLDER}`);
        //   // Create S3 root folder
        //   await storageHandler.createFolders({ names: BASE_FOLDER });
        //   await openFolder(storageHandler, "Home");
        // }

        console.log("Jackal.js client initialized successfully");

        await storageHandler.loadProviderPool();

        await storageHandler.upgradeSigner();

        console.log(`[INFO] - Storage Handler initialized with ${keyEnvVar}`);

        return {clientHandler, storageHandler};
    } catch (error) {
        console.error("Failed to initialize Jackal.js client:", error);
        process.exit(1);
    }
}
