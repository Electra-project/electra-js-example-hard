const ElectraJs = require('electra-js')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const readlineInstance = readline.createInterface(process.stdin, process.stdout)

class Storage {
  constructor() {
    this.jsonFilePath = path.resolve(__dirname, 'storage.json')

    if (!fs.existsSync(this.jsonFilePath)) {
      fs.writeFileSync(this.jsonFilePath, JSON.stringify({}, null, 2))
    }
  }

  get(key) {
    return JSON.parse(fs.readFileSync(this.jsonFilePath))[key]
  }

  set(key, value) {
    const data = JSON.parse(fs.readFileSync(this.jsonFilePath))
    data[key] = value
    fs.writeFileSync(this.jsonFilePath, JSON.stringify(data, null, 2))
  }
}

function prompt(question) {
  return new Promise((resolve, reject) => {

    readlineInstance.setPrompt(`${question} `)
    readlineInstance.prompt()
    readlineInstance
      .on('line', resolve)
      .on('close', ()  => process.exit(0))

  })
}

const electraJs = new ElectraJs({
  isHard: true,
})
const storage = new Storage()

let userPassphrase

async function setup() {
  // It's not because it is a first setup for this application that a wallet didn't previously exist.
  // Thus this existing could be locked. And We can't generate a wallet "above" an encrypted one,
  // so we first need to unlock the existing one.
  if (electraJs.wallet.lockState === 'LOCKED') {
    let hasError = true
    while (hasError) {
      // Ask the user for their existing password here.
      userPassphrase = await prompt('What is your current wallet passphrase ?')

      // Then unlock the wallet
      console.log('Unlocking wallet...')
      try {
        await electraJs.wallet.unlock(userPassphrase, false)
        hasError = false
      }
      catch(err) {
        console.log('Wrong password.')
      }
    }
  } else {
    // Ask the user to create a new passphrase here
    userPassphrase = await prompt('Please enter a passphrase to encrypt your new wallet:')
  }

  // We can now generate a new HD wallet.
  console.log('Generating new HD wallet...')
  await electraJs.wallet.generate(userPassphrase)

  // When we generate a new wallet, this is the only opportunity we have to get the generated mnemonic
  // which is supposed to be saved by the user in order to recover in case of data loss.
  const userMnemonic = electraJs.wallet.mnemonic

  // Show the userMnemonic to the user and eventually ask them to repeat it. But NEVER store it anywere.
  console.log(`Please write down your mnemonic somewhere (and DO NOT LOOSE IT !):\n${userMnemonic}`)

  // First you need to lock the wallet in order to encrypt the Master Node Address private key.
  // Indeed you should NEVER store any non-encrypted private key anywhere.
  console.log('Locking wallet...')
  await electraJs.wallet.lock()

  const walletStartData = {
    masterNodeAddress: electraJs.wallet.masterNodeAddress,
    addresses: electraJs.wallet.addresses,
    randomAddresses: electraJs.wallet.randomAddresses,
  }

  // Save the wallet start data into your storage: user directory, local storage, database, etc.
  console.log('Updating storage data...')
  storage.set('walletStartData', walletStartData)

  await ready()
}

async function start() {
  // First, we need to start the daemon.
  console.log('Starting daemon...')
  await electraJs.wallet.startDaemon()

  // Retrieve the wallet start data from your storage: user directory, local storage, database, etc.
  console.log('Retrieving storage data...')
  const walletStartData = storage.get('walletStartData')

  // If the data does not exist in the storage, we need to launch the first setup.
  if (walletStartData === undefined) {
    await setup()

    return
  }

  // Ask the user for their current passphrase here.
  let hasError = true
  while (hasError) {
    // Ask the user for their existing password here.
    userPassphrase = await prompt('What is your current wallet passphrase ?')

    // Then unlock the wallet
    console.log('Starting wallet...')
    try {
      await electraJs.wallet.start(walletStartData, userPassphrase)
      hasError = false
    } catch (err) {
      console.log('Wrong password.')
    }
  }

  await ready()
}

async function ready() {
  // Unlock the wallet for staking only
  console.log('Unlocking wallet (for staking only)...')
  try {
    await electraJs.wallet.unlock(userPassphrase, true)
    hasError = false
  } catch (err) {
    console.log('Wrong password.')
  }

  console.log(`Now your ElectraJs wallet is staking (#lockState = ${electraJs.wallet.lockState}) and ready to be used.`)
}

start()
