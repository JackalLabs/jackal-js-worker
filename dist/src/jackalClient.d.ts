import { IClientHandler, IStorageHandler } from "@jackallabs/jackal.js";
export declare const BASE_FOLDER = "test";
export declare function initJackalClients(string?: string): Promise<{
    clientHandler: IClientHandler;
    storageHandler: IStorageHandler;
}>;
