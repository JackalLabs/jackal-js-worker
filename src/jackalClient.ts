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

    try {
      await storageHandler.loadDirectory({ path: `Home/${BASE_FOLDER}` })
    } catch {
      console.log(`Creating storage root: ${BASE_FOLDER}`)
      // Create S3 root folder
      await storageHandler.createFolders({ names: BASE_FOLDER })
      await storageHandler.loadDirectory({ path: `Home/${BASE_FOLDER}` })
    }

    console.log('Jackal.js client initialized successfully')


    const initPool = {
      jkl1t5708690gf9rc3mmtgcjmn9padl8va5g03f9wm: "https://mprov01.jackallabs.io",
      jkl1esjprqperjzwspaz6er7azzgqkvsa6n5kljv05: "https://mprov02.jackallabs.io",
      jkl1dht8meprya6jr7w9g9zcp4p98ccxvckufvu4zc: "https://jklstorage1.squirrellogic.com",
      jkl1nfnmjk7k59xc3q7wgtva7xahkg3ltjtgs3le93: "https://jklstorage2.squirrellogic.com",
      jkl1x6ekn8382nlmv04pedzev4hmc6jq8vypcc6fln: "https://jklstorage3.squirrellogic.com",
      jkl1p4ft2z2cl3w70j4ec6e3tgcy2enuuehyjdfefw: "https://jklstorage4.squirrellogic.com",
      jkl1hcrdcd2xr9yfx76rerfj2yyxynpm9je5ht29dn: "https://jklstorage5.squirrellogic.com",
    }

    await storageHandler.loadProviderPool(initPool)

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

  constructor(sH: IStorageHandler, wH: string) {
    this.sH = sH
    this.workingHome = wH
  }

  static async init() {
    const { storageHandler, workingHome } = await initJackal()
    return new localJjs(storageHandler, workingHome)
  }

  async uploadToJackal(taskID: string, source: string) {
    // Create task folder if it doesn't exist
    const taskFolder = `${this.workingHome}/${taskID}`
    try {
      await this.sH.loadDirectory({ path: taskFolder })
    } catch {
      console.log(`Creating task folder: ${taskID}`)
      await this.sH.createFolders({ names: taskID })
      await this.sH.loadDirectory({ path: taskFolder })
    }

    const fileData = await this.dataFromCache(source)

    const file = new File([new Uint8Array(fileData)], source)
    try {
      await this.sH.queuePrivate([file])
      await this.sH.processAllQueues()
    } catch (err) {
      console.warn('failed to back up to jackal')
      console.error(err)
    }
  }

  private async dataFromCache(source: string): Promise<Uint8Array> {
    const buffer = await wasabiClient.downloadFile(source)
    return new Uint8Array(buffer)
  }


}



