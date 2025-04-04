"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BASE_JACKAL_FOLDER = void 0;
exports.openFolder = openFolder;
exports.simpleUploadFile = simpleUploadFile;
const dotenv_1 = __importDefault(require("dotenv"));
exports.BASE_JACKAL_FOLDER = "test";
dotenv_1.default.config();
async function openFolder(handler, path, count = 0) {
    if (count >= 10) {
        throw new Error(`Failed to open folder after 10 attempts: ${path}`);
    }
    try {
        await handler.loadDirectory({ path });
    }
    catch (error) {
        console.error(error);
        console.log("Failed to load folder, trying again", path);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return openFolder(handler, path, count + 1);
    }
}
/**
 * A simplified version of uploadFile that handles the full process of uploading a file to Jackal storage
 * @param source Source file path
 * @param destination Destination path in Jackal storage
 */
async function simpleUploadFile(storageHandler, source, destination) {
    try {
        console.log(`Simple upload: ${source} to ${destination}`);
        const cleanDestination = destination.startsWith("/")
            ? destination.substring(1)
            : destination;
        const parts = cleanDestination.split("/");
        const fileName = parts.pop() || "";
        const dirPath = `Home/${exports.BASE_JACKAL_FOLDER}`;
        console.log(`Using base directory: ${dirPath}`);
        console.log(`Preparing to upload file: ${fileName}`);
        const fs = require("fs");
        const f = fs.readFileSync(source);
        const file = new File([f], fileName, {
            type: "application/octet-stream",
            lastModified: Date.now(),
        });
        try {
            console.log("[INFO] - Queuing file for private upload...");
            await storageHandler.queuePrivate([file]);
            console.log("[INFO] - Processing upload queue...");
            await storageHandler.processAllQueues();
            console.log(`[INFO] - File uploaded successfully to ${dirPath}/${fileName}`);
            return true;
        }
        catch (error) {
            console.error("[ERROR] - Error in upload process:", error);
            throw error;
        }
    }
    catch (error) {
        console.error(`[ERROR] - Error in simple upload for ${source}:`, error);
        throw error;
    }
}
//# sourceMappingURL=jackal.js.map