"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BASE_FOLDER = void 0;
exports.initJackalClients = initJackalClients;
const jackal_js_1 = require("@jackallabs/jackal.js");
const dotenv_1 = __importDefault(require("dotenv"));
const jackal_1 = require("./jackal");
const config_1 = require("./config");
exports.BASE_FOLDER = "test";
let clientHandler;
let storageHandler;
dotenv_1.default.config();
async function initJackalClients(string = "JKL_SECRET_KEY1") {
    try {
        clientHandler = await jackal_js_1.ClientHandler.connect({
            ...config_1.testnet,
            selectedWallet: "mnemonic",
            mnemonic: process.env[string],
        });
        storageHandler = await jackal_js_1.StorageHandler.init(clientHandler, {
            setFullSigner: true,
        });
        await storageHandler.initStorage();
        try {
            await (0, jackal_1.openFolder)(storageHandler, `Home/${exports.BASE_FOLDER}`);
        }
        catch (err) {
            console.log(`Creating storage root: ${exports.BASE_FOLDER}`);
            await storageHandler.createFolders({ names: [exports.BASE_FOLDER] });
            await (0, jackal_1.openFolder)(storageHandler, "Home");
        }
        await storageHandler.loadProviderPool();
        console.log("Jackal.js client initialized successfully");
        return { clientHandler, storageHandler };
    }
    catch (error) {
        console.error("Failed to initialize Jackal.js client:", error);
        process.exit(1);
    }
}
//# sourceMappingURL=jackalClient.js.map