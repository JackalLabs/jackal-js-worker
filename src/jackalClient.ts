import {
  ClientHandler,
  IClientHandler,
  IStorageHandler,
  StorageHandler,
  TWalletExtensionNames,
} from '@jackallabs/jackal.js'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
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

  console.log('mnemonic', process.env.MAINNET_MNEMONIC )


  try {
    clientHandler = await ClientHandler.connect(pkg)
    storageHandler = await StorageHandler.init(clientHandler, {
      setFullSigner: true,
    })

    await storageHandler.initStorage()
    try {
      await storageHandler.loadDirectory({ path: `Home/${BASE_FOLDER}` })
    } catch {
      console.log(`Creating storage root: ${BASE_FOLDER}`)
      // Create S3 root folder
      await storageHandler.createFolders({ names: BASE_FOLDER })
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

export class localJjs {
  private sH: IStorageHandler
  private workingHome: string
  private s3: S3Client

  constructor(sH: IStorageHandler, wH: string) {
    this.sH = sH
    this.workingHome = wH
    this.s3 = new S3Client()
  }

  static async init() {
    const { storageHandler, workingHome } = await initJackal()
    return new localJjs(storageHandler, workingHome)
  }

  async uploadToJackal(source: string) {
    const fileData = await this.dataFromCache(source)
    const fileMeta = await this.metaFromCache(`${source}-meta.json`)

    let meta
    try {
      meta = JSON.parse(fileMeta)
    } catch {
      meta = {}
    }

    const file = new File([new Uint8Array(fileData)], source, meta)
    try {
      await this.sH.queuePrivate([file])
      await this.sH.processAllQueues()
    } catch (err) {
      console.warn('failed to back up to jackal')
      console.error(err)
    }
  }

  private async dataFromCache(source: string): Promise<Uint8Array> {
    const { Body } = await this.s3.send(
      new GetObjectCommand({
        Bucket: process.env.WASABI_BUCKET,
        Key: source,
      }),
    )
    if (!Body) {
      throw new Error('invalid body')
    } else {
      return await Body.transformToByteArray()
    }
  }

  private async metaFromCache(source: string): Promise<string> {
    const { Body } = await this.s3.send(
      new GetObjectCommand({
        Bucket: process.env.WASABI_BUCKET,
        Key: source,
      }),
    )
    if (!Body) {
      throw new Error('invalid body')
    } else {
      return await Body.transformToString()
    }
  }


}



