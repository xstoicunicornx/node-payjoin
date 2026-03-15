import { payjoin } from "@xstoicunicornx/payjoin_test";
import { fetchOhttpKeys, postRequest, sleep, Wallet } from "./utils.ts";
import { Psbt } from "bitcoinjs-lib";
import { PlainOutPoint } from "@xstoicunicornx/payjoin_test/dist/generated/payjoin";
import {
  SQLiteReceiverPersister,
  receiverPersisterNextId,
} from "./persister.ts";

const pjDirectory = "https://payjo.in";
const ohttpRelays = [
  "https://pj.benalleng.com",
  "https://pj.bobspacebkk.com",
  // "https://ohttp.achow101.com",
];

// TODO: waiting for async support to actually implement these state trannsition callbacks
class MempoolAcceptanceCallback implements payjoin.CanBroadcast {
  constructor() {}

  callback(_tx: ArrayBuffer): boolean {
    return true;
  }
}

class IsScriptOwnedCallback implements payjoin.IsScriptOwned {
  ownedScripts: string[];

  constructor(ownedScripts: string[] = []) {
    this.ownedScripts = ownedScripts;
  }

  callback(scriptBuf: ArrayBuffer): boolean {
    const script = Buffer.from(scriptBuf).toString("hex");
    const isOwned = this.ownedScripts.includes(script);
    return isOwned;
  }
}

class CheckInputsNotSeenCallback implements payjoin.IsOutputKnown {
  constructor() {}

  callback(_outpoint: PlainOutPoint): boolean {
    return false;
  }
}

class ProcessPsbtCallback implements payjoin.ProcessPsbt {
  signedPsbt: string;

  constructor(psbt: string) {
    this.signedPsbt = psbt;
  }

  callback(_psbt: string): string {
    return this.signedPsbt;
  }
}

// class TransactionExistsCallback implements payjoin.TransactionExists {
//   constructor() {}
//
//   callback(txid: string): ArrayBuffer | undefined {
//     return Buffer.from(txid, "hex").buffer;
//   }
// }

interface Utxo {
  txid: string;
  vout: number;
  amount: number;
  scriptPubKey: string;
}

async function createInputPairs(utxos: Utxo[]): Promise<payjoin.InputPair[]> {
  const inputs: payjoin.InputPair[] = [];
  // TODO: remove ts ignores below
  for (const utxo of utxos) {
    const txin = payjoin.PlainTxIn.create({
      previousOutput: payjoin.PlainOutPoint.create({
        txid: utxo.txid,
        vout: utxo.vout,
      }),
      // @ts-ignore
      scriptSig: new Uint8Array([]),
      sequence: 0,
      witness: [],
    });
    const txOut = payjoin.PlainTxOut.create({
      valueSat: BigInt(Math.round(utxo.amount * 100_000_000)),
      // @ts-ignore
      scriptPubkey: Buffer.from(utxo.scriptPubKey, "hex"),
    });
    const psbtIn = payjoin.PlainPsbtInput.create({
      witnessUtxo: txOut,
      redeemScript: undefined,
      witnessScript: undefined,
    });
    inputs.push(new payjoin.InputPair(txin, psbtIn, undefined));
  }
  return inputs;
}

export class Receiver {
  wallet: Wallet;
  persister: SQLiteReceiverPersister;
  session:
    | payjoin.InitializedInterface
    | payjoin.UncheckedOriginalPayloadInterface
    | payjoin.MaybeInputsOwnedInterface
    | payjoin.MaybeInputsSeenInterface
    | payjoin.OutputsUnknownInterface
    | payjoin.WantsOutputsInterface
    | payjoin.WantsInputsInterface
    | payjoin.WantsFeeRangeInterface
    | payjoin.ProvisionalProposalInterface
    | payjoin.PayjoinProposalInterface
    | undefined;
  interrupt: boolean;
  address: string | undefined;
  originalPsbt: string;

  constructor() {
    this.wallet = new Wallet("receiver");
    this.persister = new SQLiteReceiverPersister(receiverPersisterNextId());
    this.interrupt = false;
    this.originalPsbt = "";
  }

  getOhttpKeys() {
    let randomIndex = Math.floor(Math.random() * ohttpRelays.length);
    return fetchOhttpKeys(
      new URL(pjDirectory),
      new URL(ohttpRelays[randomIndex]),
    );
  }

  async initialize(amount?: bigint, expiration?: bigint) {
    const address = await this.wallet.getnewaddress();
    const ohttpKeys = await this.getOhttpKeys();
    console.log("address", address, true);
    let session = new payjoin.ReceiverBuilder(
      address,
      pjDirectory,
      ohttpKeys,
    ) as payjoin.ReceiverBuilderInterface;
    if (amount) session = session.withAmount(amount);
    if (expiration) session.withExpiration(expiration);
    this.session = session.build().save(this.persister);
    this.address = address;
  }

  getPjUri() {
    if (!(this.session instanceof payjoin.Initialized))
      throw Error("receiver not in initialized state");
    return this.session.pjUri();
  }

  async poll() {
    if (!this.session) throw Error("receiver has not been initialized");
    if (!this.address) throw Error("receiver address was not set properly");
    this.interrupt = false;
    while (!this.interrupt) {
      console.log("receiver polling...");
      if (this.session instanceof payjoin.Initialized) {
        console.log("session state initialized");
        const random_index = Math.floor(Math.random() * ohttpRelays.length);
        const { request, clientResponse } = this.session.createPollRequest(
          ohttpRelays[random_index],
        );
        const response = await postRequest(request);
        const stateTransition = this.session
          .processResponse(await response.arrayBuffer(), clientResponse)
          .save(this.persister);
        if (
          stateTransition instanceof
          payjoin.InitializedTransitionOutcome.Progress
        ) {
          this.session = stateTransition.inner.inner;
          this.checkOriginalPsbt();
          return;
        }
      }
      await sleep(2);
    }
    console.log("receiver polling interrupted");
  }

  stop() {
    this.interrupt = true;
  }

  // NOTE: nothing is actually being checked just walking through state transitions
  async checkOriginalPsbt() {
    try {
      if (!this.address) throw Error("receiver address was not set properly");
      if (!(this.session instanceof payjoin.UncheckedOriginalPayload))
        throw Error("receiver is not in correct state to check original psbt");

      const canBroadcast = new MempoolAcceptanceCallback();
      this.session = this.session
        .checkBroadcastSuitability(undefined, canBroadcast)
        .save(this.persister);

      const inputsOwned = new IsScriptOwnedCallback();
      this.session = this.session
        .checkInputsNotOwned(inputsOwned)
        .save(this.persister);

      const inputsSeen = new CheckInputsNotSeenCallback();
      this.session = this.session
        .checkNoInputsSeenBefore(inputsSeen)
        .save(this.persister);

      const { scriptPubKey } = await this.wallet.getaddressinfo(this.address);
      const outputsOwned = new IsScriptOwnedCallback([scriptPubKey]);
      this.session = this.session
        .identifyReceiverOutputs(outputsOwned)
        .save(this.persister);

      this.session = this.session.commitOutputs().save(this.persister);

      const utxos: Utxo[] = await this.wallet.listunspent();
      const inputs = await createInputPairs(utxos);
      const chosenInput = this.session.tryPreservingPrivacy(inputs);
      this.session = this.session
        .contributeInputs([chosenInput])
        .commitInputs()
        .save(this.persister);

      this.session = this.session
        .applyFeeRange(BigInt(0), BigInt(2))
        .save(this.persister);

      const unsignedPsbt = this.session.psbtToSign();

      // manually removing sig so this can be used for signing
      // this is supposed to be done by ProcessPsbtCallback
      // but since there is no async support it is not possible
      // to sign within ProcessPsbtCallback currently
      const unsignedPsbtRecord = Psbt.fromBase64(unsignedPsbt);
      const unsignedPsbtRecordData = unsignedPsbtRecord.data;
      unsignedPsbtRecordData.inputs.forEach((input) => {
        delete input.finalScriptWitness;
      });

      const { psbt } = await this.wallet.walletprocesspsbt(
        new Psbt({}, unsignedPsbtRecordData).toBase64(),
      );

      this.session = this.session
        .finalizeProposal(new ProcessPsbtCallback(psbt))
        .save(this.persister);

      const random_index = Math.floor(Math.random() * ohttpRelays.length);
      const { request, clientResponse } = this.session.createPostRequest(
        ohttpRelays[random_index],
      );
      const response = await postRequest(request);
      const stateTransition = this.session
        .processResponse(await response.arrayBuffer(), clientResponse)
        .save(this.persister);

      // stateTransition
      //   .monitor(new TransactionExistsCallback())
      //   .save(this.persister);
    } catch (error) {
      console.error(error);
    }
  }
}
