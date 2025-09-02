import {
  ClientHandler,
  IClientHandler,
  IStorageHandler,
  StorageHandler,
  TWalletExtensionNames,
} from '@jackallabs/jackal.js'
import dotenv from 'dotenv'
import { mainnet, testnet } from './config'
import { wasabiClient } from './wasabiClient'
import { database } from './database'

dotenv.config()

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
      await this.sH.processAllQueues()
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


}



