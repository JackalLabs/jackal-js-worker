import {
  ClientHandler,
  IClientHandler,
  IStorageHandler,
  StorageHandler,
  TWalletExtensionNames,
} from '@jackallabs/jackal.js'
import dotenv from 'dotenv'
import { mainnet, testnet } from './config'

dotenv.config()

export async function initJackal() {
  let clientHandler: IClientHandler
  let storageHandler: IStorageHandler

  const BASE_FOLDER = process.env.JACKAL_FOLDER || ''

  let pkg
  if (process.env.CHAIN_MODE === 'mainnet') {
    pkg = {
      ...mainnet,
      selectedWallet: 'mnemonic' as TWalletExtensionNames,
      mnemonic: process.env.MAINNET_MNEMONIC || '',
    }
  } else {
    pkg = {
      ...testnet,
      selectedWallet: 'mnemonic' as TWalletExtensionNames,
      mnemonic: process.env.TESTNET_MNEMONIC || '',
    }
  }


  try {
    clientHandler = await ClientHandler.connect(pkg)
    storageHandler = await StorageHandler.init(clientHandler, {
      setFullSigner: true,
    })

    await storageHandler.initStorage()
    try {
      await storageHandler.loadDirectory({ path: `Home/${BASE_FOLDER}` })
    } catch {
      console.log(`Creating storage root: ${BASE_FOLDER}`);
      // Create S3 root folder
      await storageHandler.createFolders({ names: BASE_FOLDER });
      await storageHandler.loadDirectory({ path: `Home/${BASE_FOLDER}` })
    }

    console.log('Jackal.js client initialized successfully')

    await storageHandler.loadProviderPool()

    return { storageHandler, workingHome: `Home/${BASE_FOLDER}` }
  } catch
    (err) {
    console.error('Failed to initialize Jackal.js client:', err)
    process.exit(1)
  }
}
