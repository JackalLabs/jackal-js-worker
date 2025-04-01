"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var jackal_js_1 = require("@jackallabs/jackal.js");
//import dotenv from "dotenv";
var config_1 = require("./config");
var BASE_FOLDER = "test";
//dotenv.config();
function openFolder(path_1) {
    return __awaiter(this, arguments, void 0, function (path, count) {
        var error_1;
        if (count === void 0) { count = 0; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (count >= 10) {
                        throw new Error("Failed to open folder after 10 attempts: ".concat(path));
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 5]);
                    return [4 /*yield*/, storageHandler.loadDirectory({ path: path })];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 3:
                    error_1 = _a.sent();
                    console.log("Failed to load folder, trying again", path);
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                case 4:
                    _a.sent();
                    return [2 /*return*/, openFolder(path, count + 1)];
                case 5: return [2 /*return*/];
            }
        });
    });
}
var clientHandler;
var storageHandler;
function initJackalClients() {
    return __awaiter(this, void 0, void 0, function () {
        var err_1, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 11, , 12]);
                    return [4 /*yield*/, jackal_js_1.ClientHandler.connect(__assign(__assign({}, config_1.testnet), { selectedWallet: "mnemonic", mnemonic: "vast fun buffalo option sheriff crew broken figure circle century wide laugh raw taxi cotton curious agent inherit chest borrow loan pipe denial food" }))];
                case 1:
                    clientHandler = _a.sent();
                    return [4 /*yield*/, jackal_js_1.StorageHandler.init(clientHandler, {
                            setFullSigner: true,
                        })];
                case 2:
                    storageHandler = _a.sent();
                    return [4 /*yield*/, storageHandler.initStorage()];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    _a.trys.push([4, 6, , 9]);
                    return [4 /*yield*/, openFolder("Home/".concat(BASE_FOLDER))];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 9];
                case 6:
                    err_1 = _a.sent();
                    console.log("Creating storage root: ".concat(BASE_FOLDER));
                    // Create S3 root folder
                    return [4 /*yield*/, storageHandler.createFolders({ names: BASE_FOLDER })];
                case 7:
                    // Create S3 root folder
                    _a.sent();
                    return [4 /*yield*/, openFolder("Home")];
                case 8:
                    _a.sent();
                    return [3 /*break*/, 9];
                case 9: return [4 /*yield*/, storageHandler.loadProviderPool()];
                case 10:
                    _a.sent();
                    console.log("Jackal.js client initialized successfully");
                    return [3 /*break*/, 12];
                case 11:
                    error_2 = _a.sent();
                    console.error("Failed to initialize Jackal.js client:", error_2);
                    process.exit(1);
                    return [3 /*break*/, 12];
                case 12: return [2 /*return*/];
            }
        });
    });
}
initJackalClients();
