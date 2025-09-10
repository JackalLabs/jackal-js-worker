import {
  ClientHandler,
  IClientHandler,
  IStorageHandler,
  StorageHandler,
  TWalletExtensionNames,
} from '@jackallabs/jackal.js'
import dotenv from 'dotenv'
import { mainnet, mainnetChainID, testnet } from './config'
import { wasabiClient } from './wasabiClient'
import { database } from './database'

dotenv.config()

const JACKAL_RPC_URL = process.env.JACKAL_RPC_URL || 'https://rpc.jackalprotocol.com'


export async function initJackal() {
  let clientHandler: IClientHandler
  let storageHandler: IStorageHandler

  const BASE_FOLDER = process.env.JACKAL_FOLDER || ''

  // Connect to database and get worker information
  await database.connect()
  
  const workerId = process.env.JACKAL_WORKER_ID
  if (!workerId) {
    throw new Error('JACKAL_WORKER_ID environment variable is required')
  }

  const worker = await database.getJackalWorker(parseInt(workerId))
  if (!worker) {
    throw new Error(`Jackal worker with ID ${workerId} not found in database`)
  }

  console.log(`Using Jackal worker: ID ${worker.id}, Address: ${worker.address}`)

  let pkg
  if (process.env.CHAIN_MODE === 'mainnet') {
    pkg = {
      ...mainnet,
      selectedWallet: 'mnemonic' as TWalletExtensionNames,
      mnemonic: worker.seed,
    }
  } else {
    pkg = {
      ...testnet,
      selectedWallet: 'mnemonic' as TWalletExtensionNames,
      mnemonic: worker.seed,
    }
  }
  console.log('Using Jackal.js client package:', pkg)

  console.log('Using seedphrase from database')

  try {
    clientHandler = await ClientHandler.connect(pkg)
    storageHandler = await StorageHandler.init(clientHandler, {
      setFullSigner: true,
    })

    try {
      await storageHandler.loadDirectory({ path: `Home/${BASE_FOLDER}` })
    } catch {
      console.log(`Creating storage root: ${BASE_FOLDER}`)
      // Create S3 root folder
      await storageHandler.loadDirectory({ path: `Home` })
      await storageHandler.createFolders({ names: BASE_FOLDER })
      await storageHandler.loadDirectory({ path: `Home/${BASE_FOLDER}` })
    }

    console.log('Jackal.js client initialized successfully')

    const initPool = {
      jkl1esjprqperjzwspaz6er7azzgqkvsa6n5kljv05: "https://mprov02.jackallabs.io",
      jkl1dht8meprya6jr7w9g9zcp4p98ccxvckufvu4zc: "https://jklstorage1.squirrellogic.com",
      jkl1nfnmjk7k59xc3q7wgtva7xahkg3ltjtgs3le93: "https://jklstorage2.squirrellogic.com",
      jkl1x6ekn8382nlmv04pedzev4hmc6jq8vypcc6fln: "https://jklstorage3.squirrellogic.com",
      jkl1p4ft2z2cl3w70j4ec6e3tgcy2enuuehyjdfefw: "https://jklstorage4.squirrellogic.com",
      jkl1hcrdcd2xr9yfx76rerfj2yyxynpm9je5ht29dn: "https://jklstorage5.squirrellogic.com",
    }

    await storageHandler.loadProviderPool(initPool)

    return { storageHandler, workingHome: `Home/${BASE_FOLDER}` }
  } catch (err) {
    console.error('Failed to initialize Jackal.js client:', err)
    // Disconnect from database on error
    await database.disconnect()
    process.exit(1)
  }
}

export class localJjs {
  private sH: IStorageHandler
  private workingHome: string

  constructor(sH: IStorageHandler, wH: string) {
    this.sH = sH
    this.workingHome = wH
  }

  static async init() {
    const { storageHandler, workingHome } = await initJackal()
    return new localJjs(storageHandler, workingHome)
  }


  async uploadCAFToJackal(cafFileName: string, cafFilePath: string) {
    // Read the CAF file from local filesystem
    const fs = await import('fs')
    const cafData = await fs.promises.readFile(cafFilePath)

    const file = new File([new Uint8Array(cafData)], cafFileName)
    try {
      await this.sH.queuePrivate([file])
      await this.sH.processAllQueues({
        socketOverrides: {
          'jackal': {
            chainId: mainnetChainID,
            endpoint: JACKAL_RPC_URL,
            gasMultiplier: 1.0,
          },
          'jackaltest': {
            chainId: mainnetChainID,
            endpoint: JACKAL_RPC_URL,
            gasMultiplier: 1.0,
          },
          'jackallocal': {
            chainId: mainnetChainID,
            endpoint: JACKAL_RPC_URL,
            gasMultiplier: 1.0,
          },
          'archway': {
            chainId: mainnetChainID,
            endpoint: JACKAL_RPC_URL,
            gasMultiplier: 1.0,
          },
          'archwaytest': {
            chainId: mainnetChainID,
            endpoint: JACKAL_RPC_URL,
            gasMultiplier: 1.0,
          },
          'wasm': {
            chainId: mainnetChainID,
            endpoint: JACKAL_RPC_URL,
            gasMultiplier: 1.0,
          },
        }
      })
      console.log(`Successfully uploaded CAF to Jackal: ${cafFileName}`)
    } catch (err) {
      console.warn('Failed to upload CAF to Jackal')
      console.error(err)
      throw err
    }
  }

  private async dataFromCache(source: string): Promise<Uint8Array> {
    const buffer = await wasabiClient.downloadFile(source)
    return new Uint8Array(buffer)
  }

  async downloadCAFFromJackal(cafFileName: string, outputPath: string): Promise<void> {
    try {
      // Download the file from Jackal storage
      const filePath = `${this.workingHome}/${cafFileName}`
      console.log(`Downloading CAF from Jackal: ${filePath}`)
      
      // Create a tracker for download progress
      const tracker = { progress: 0, chunks: [] }
      
      // Download the file from Jackal
      console.log(`Starting download from Jackal storage handler...`)
      const fileData = await this.sH.downloadFile(filePath, tracker)
      console.log(`Downloaded file data type: ${typeof fileData}, size: ${fileData?.size || 'unknown'}`)
      console.log(`File data constructor: ${fileData?.constructor?.name || 'unknown'}`)
      console.log(`File data keys: ${fileData ? Object.keys(fileData) : 'none'}`)
      
      // Validate that we got file data
      if (!fileData) {
        throw new Error(`No file data returned from Jackal for: ${filePath}`)
      }
      
      if (fileData.size === 0) {
        throw new Error(`File is empty in Jackal storage: ${filePath}`)
      }
      
      // Convert File to Buffer
      const arrayBuffer = await fileData.arrayBuffer()
      console.log(`ArrayBuffer size: ${arrayBuffer.byteLength} bytes`)
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error(`ArrayBuffer is empty for file: ${filePath}`)
      }
      
      const buffer = Buffer.from(arrayBuffer)
      console.log(`Buffer size: ${buffer.length} bytes`)
      
      if (buffer.length === 0) {
        throw new Error(`Buffer is empty for file: ${filePath}`)
      }
      
      // Write the file to the specified output path
      const fs = await import('fs')
      await fs.promises.writeFile(outputPath, buffer)
      
      // Verify the written file
      const stats = await fs.promises.stat(outputPath)
      console.log(`Written file size: ${stats.size} bytes`)
      
      if (stats.size === 0) {
        throw new Error(`Written file is empty: ${outputPath}`)
      }
      
      if (stats.size !== buffer.length) {
        throw new Error(`File size mismatch: expected ${buffer.length}, got ${stats.size}`)
      }
      
      console.log(`Successfully downloaded CAF from Jackal: ${cafFileName} -> ${outputPath} (${stats.size} bytes)`)
    } catch (err) {
      console.error(`Failed to download CAF from Jackal: ${cafFileName}`, err)
      throw err
    }
  }

}



