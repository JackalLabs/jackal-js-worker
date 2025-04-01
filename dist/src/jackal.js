"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openFolder = openFolder;
exports.initJackalClients = initJackalClients;
exports.uploadFile = uploadFile;
const jackal_js_1 = require("@jackallabs/jackal.js");
//import dotenv from "dotenv";
const config_1 = require("./config");
const BASE_FOLDER = "test";
//dotenv.config();
async function openFolder(path, count = 0) {
    if (count >= 10) {
        throw new Error(`Failed to open folder after 10 attempts: ${path}`);
    }
    try {
        await storageHandler.loadDirectory({ path });
    }
    catch (error) {
        console.log("Failed to load folder, trying again", path);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return openFolder(path, count + 1);
    }
}
let clientHandler;
let storageHandler;
async function initJackalClients() {
    try {
        clientHandler = await jackal_js_1.ClientHandler.connect({
            ...config_1.testnet,
            selectedWallet: "mnemonic",
            mnemonic: "vast fun buffalo option sheriff crew broken figure circle century wide laugh raw taxi cotton curious agent inherit chest borrow loan pipe denial food",
        });
        storageHandler = await jackal_js_1.StorageHandler.init(clientHandler, {
            setFullSigner: true,
        });
        await storageHandler.initStorage();
        try {
            await openFolder(`Home/${BASE_FOLDER}`);
        }
        catch (err) {
            console.log(`Creating storage root: ${BASE_FOLDER}`);
            // Create S3 root folder
            await storageHandler.createFolders({ names: BASE_FOLDER });
            await openFolder("Home");
        }
        await storageHandler.loadProviderPool();
        console.log("Jackal.js client initialized successfully");
    }
    catch (error) {
        console.error("Failed to initialize Jackal.js client:", error);
        process.exit(1);
    }
}
// Add a function to upload files
async function uploadFile(filePath, destination) {
    try {
        const fs = require("fs");
        const path = require("path");
        // Split the destination path to get directory and filename
        const parts = destination.split("/");
        const fileName = parts.pop() || "";
        const dirPath = parts.join("/");
        // Make sure we're in the right folder
        await openFolder(dirPath);
        // Read the file content
        const fileContent = fs.readFileSync(filePath);
        // Create a file object
        const fileObj = {
            name: fileName,
            content: fileContent,
        };
        // Create and save the file using available methods
        await storageHandler.createFolders({ names: fileName });
        console.log(`File uploaded successfully to ${destination}`);
        return true;
    }
    catch (error) {
        console.error("Error uploading file:", error);
        throw error;
    }
}
// We'll still call this for direct usage of this file
initJackalClients();
