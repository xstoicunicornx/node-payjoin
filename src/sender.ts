import { payjoin } from "@xstoicunicornx/payjoin_test";
import { postRequest, sleep, Wallet } from "./utils";
import { SQLiteSenderPersister, senderPersisterNextId } from "./persister";

// const pjDirectory = "https://payjo.in";
const ohttpRelays = [
  "https://pj.benalleng.com",
  "https://pj.bobspacebkk.com",
  // "https://ohttp.achow101.com",
];

export class Sender {
  wallet: Wallet;
  persister: SQLiteSenderPersister;
  session:
    | payjoin.WithReplyKeyInterface
    | payjoin.PollingForProposalInterface
    | undefined;
  interrupt: boolean;

  constructor(persisterId?: number) {
    this.wallet = new Wallet("sender");
    this.persister = new SQLiteSenderPersister(
      persisterId || senderPersisterNextId(),
    );
    this.interrupt = false;
    if (persisterId) {
      const session = payjoin.replaySenderEventLog(this.persister);
      if (session.state().inner.inner instanceof payjoin.PollingForProposal) {
        this.session = session.state().inner
          .inner as payjoin.PollingForProposalInterface;
      } else {
        throw Error(
          `sender session with persister id ${persisterId} is borked`,
        );
      }
    }
  }

  async initialize(uri: string, amountArg: string) {
    try {
      const pjUri = payjoin.Uri.parse(uri).checkPjSupported();
      const address = pjUri.address();
      const amount = pjUri.amountSats() || BigInt(amountArg);
      if (!amount) throw Error("receiver did not specify amount in URI");
      const { psbt: unsignedPsbt } = await this.wallet.walletcreatefundedpsbt(
        address,
        amount,
        {
          fee_rate: 10, // options
        },
      );

      const { psbt } = await this.wallet.walletprocesspsbt(unsignedPsbt);
      this.session = new payjoin.SenderBuilder(psbt, pjUri)
        .buildRecommended(BigInt(10))
        .save(this.persister);
      console.log("sender original psbt:");
      console.log(psbt);
    } catch (error) {
      console.error(error);
    }
  }

  async postOriginalPsbt() {
    try {
      if (!(this.session instanceof payjoin.WithReplyKey))
        throw Error("sender not in right state for posting original psbt");
      const relayIndex = Math.floor(Math.random() * ohttpRelays.length);
      const { request, ohttpCtx } = this.session.createV2PostRequest(
        ohttpRelays[relayIndex],
      );
      const response = await postRequest(request);

      this.session = this.session
        .processResponse(await response.arrayBuffer(), ohttpCtx)
        .save(this.persister);
      console.log("sender successfully sent original psbt");
    } catch (error) {
      console.error(error);
    }
  }

  async poll() {
    if (!this.session) throw Error("sender has not been initialized");
    this.interrupt = false;
    while (!this.interrupt) {
      console.log("sender polling...");
      if (this.session instanceof payjoin.PollingForProposal) {
        try {
          const random_index = Math.floor(Math.random() * ohttpRelays.length);
          const { request, ohttpCtx } = this.session.createPollRequest(
            ohttpRelays[random_index],
          );
          const response = await postRequest(request);
          const responseBuffer = await response.arrayBuffer();
          const stateTransition = this.session
            .processResponse(responseBuffer, ohttpCtx)
            .save(this.persister);
          if (
            stateTransition instanceof
            payjoin.PollingForProposalTransitionOutcome.Progress
          ) {
            const unsignedPsbt = stateTransition.inner.psbtBase64;
            const { hex } = await this.wallet.walletprocesspsbt(unsignedPsbt);
            const txid = await this.wallet.sendrawtransaction(hex);
            console.log("sender broadcasted payjoin tx", txid);
            this.stop();
            return;
          }
        } catch (error) {
          console.error(error);
        }
      }
      await sleep(2);
    }
    console.log("sender polling interrupted");
  }

  stop() {
    this.interrupt = true;
  }
}
