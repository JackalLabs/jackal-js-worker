import { IClientSetup } from '@jackallabs/jackal.js'

// Environment variables with fallbacks
const JACKAL_RPC_URL = process.env.JACKAL_RPC_URL || 'https://rpc.jackalprotocol.com'
const JACKAL_API_URL = process.env.JACKAL_API_URL || 'https://api.jackalprotocol.com'
const JACKAL_TESTNET_RPC_URL = process.env.JACKAL_TESTNET_RPC_URL || 'https://testnet-rpc.jackalprotocol.com'
const JACKAL_TESTNET_API_URL = process.env.JACKAL_TESTNET_API_URL || 'https://testnet-api.jackalprotocol.com'

export const mainnetChainID = 'jackal-1'
export const mainnet: IClientSetup = {
  chainConfig: {
    chainId: mainnetChainID,
    chainName: 'Jackal Mainnet',
    rpc: JACKAL_RPC_URL,
    rest: JACKAL_API_URL,
    bip44: {
      coinType: 118,
    },
    stakeCurrency: {
      coinDenom: 'JKL',
      coinMinimalDenom: 'ujkl',
      coinDecimals: 6,
    },
    bech32Config: {
      bech32PrefixAccAddr: 'jkl',
      bech32PrefixAccPub: 'jklpub',
      bech32PrefixValAddr: 'jklvaloper',
      bech32PrefixValPub: 'jklvaloperpub',
      bech32PrefixConsAddr: 'jklvalcons',
      bech32PrefixConsPub: 'jklvalconspub',
    },
    currencies: [
      {
        coinDenom: 'JKL',
        coinMinimalDenom: 'ujkl',
        coinDecimals: 6,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: 'JKL',
        coinMinimalDenom: 'ujkl',
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
  chainId: mainnetChainID,
  endpoint: JACKAL_RPC_URL,
  options: {},
  networks: ['jackal'],
}

export const testnetChainID = 'lupulella-2'
export const testnet: IClientSetup = {
  chainConfig: {
    chainId: testnetChainID,
    chainName: 'Jackal Testnet',
    rpc: JACKAL_TESTNET_RPC_URL,
    rest: JACKAL_TESTNET_API_URL,
    bip44: {
      coinType: 118,
    },
    stakeCurrency: {
      coinDenom: 'JKL',
      coinMinimalDenom: 'ujkl',
      coinDecimals: 6,
    },
    bech32Config: {
      bech32PrefixAccAddr: 'jkl',
      bech32PrefixAccPub: 'jklpub',
      bech32PrefixValAddr: 'jklvaloper',
      bech32PrefixValPub: 'jklvaloperpub',
      bech32PrefixConsAddr: 'jklvalcons',
      bech32PrefixConsPub: 'jklvalconspub',
    },
    currencies: [
      {
        coinDenom: 'JKL',
        coinMinimalDenom: 'ujkl',
        coinDecimals: 6,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: 'JKL',
        coinMinimalDenom: 'ujkl',
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
  chainId: testnetChainID,
  endpoint: JACKAL_TESTNET_RPC_URL,
  options: {},
  networks: ['jackaltest'],
}

