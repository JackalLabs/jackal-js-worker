import { IStorageHandler } from "@jackallabs/jackal.js";
export declare const BASE_JACKAL_FOLDER = "test";
export declare function openFolder(handler: IStorageHandler, path: string, count?: number): Promise<void>;
/**
 * A simplified version of uploadFile that handles the full process of uploading a file to Jackal storage
 * @param source Source file path
 * @param destination Destination path in Jackal storage
 */
export declare function simpleUploadFile(storageHandler: IStorageHandler, source: string, destination: string): Promise<boolean>;
