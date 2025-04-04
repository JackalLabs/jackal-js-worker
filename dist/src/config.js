"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testnet = exports.testnetChainID = void 0;
exports.testnetChainID = "lupulella-2";
exports.testnet = {
    chainConfig: {
        chainId: exports.testnetChainID,
        chainName: "Jackal Testnet",
        rpc: "https://testnet-rpc.jackalprotocol.com",
        rest: "https://testnet-api.jackalprotocol.com",
        bip44: {
            coinType: 118,
        },
        stakeCurrency: {
            coinDenom: "JKL",
            coinMinimalDenom: "ujkl",
            coinDecimals: 6,
        },
        bech32Config: {
            bech32PrefixAccAddr: "jkl",
            bech32PrefixAccPub: "jklpub",
            bech32PrefixValAddr: "jklvaloper",
            bech32PrefixValPub: "jklvaloperpub",
            bech32PrefixConsAddr: "jklvalcons",
            bech32PrefixConsPub: "jklvalconspub",
        },
        currencies: [
            {
                coinDenom: "JKL",
                coinMinimalDenom: "ujkl",
                coinDecimals: 6,
            },
        ],
        feeCurrencies: [
            {
                coinDenom: "JKL",
                coinMinimalDenom: "ujkl",
                coinDecimals: 6,
                gasPriceStep: {
                    low: 0.002,
                    average: 0.002,
                    high: 0.02,
                },
            },
        ],
        features: [],
    },
    chainId: exports.testnetChainID,
    endpoint: "https://testnet-rpc.jackalprotocol.com",
    options: {},
    networks: ["jackaltest"],
};
//# sourceMappingURL=config.js.map