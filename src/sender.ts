import { payjoin } from "@xstoicunicornx/payjoin_test";
import { postRequest, Wallet } from "./utils";

// const pjDirectory = "https://payjo.in";
const ohttpRelays = [
  "https://pj.benalleng.com",
  "https://pj.bobspacebkk.com",
  "https://ohttp.achow101.com",
];

class InMemorySenderPersisterAsync {
  id: number;
  events: any[];
  closed: boolean;

  constructor(id: number) {
    this.id = id;
    this.events = [];
    this.closed = false;
  }

  async save(event: any): Promise<void> {
    this.events.push(event);
  }

  async load(): Promise<any[]> {
    return this.events;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export class Sender {
  wallet: Wallet;
  persister: any;

  constructor() {
    this.wallet = new Wallet("sender");
    this.persister = new InMemorySenderPersisterAsync(1);
  }

  async getNewPayjoinSender(uri: string) {
    try {
      const pjUri = payjoin.Uri.parse(uri).checkPjSupported();
      console.log("pjuri", pjUri.pjEndpoint());
      const address = pjUri.address();
      const amount = pjUri.amountSats();
      if (!amount) throw Error("receiver did not specify amount in URI");
      const { psbt: unsignedPsbt } = await this.wallet.walletcreatefundedpsbt(
        address,
        amount,
      );
      const { psbt } = await this.wallet.walletprocesspsbt(unsignedPsbt);
      const payjoinSender = await new payjoin.SenderBuilder(psbt, pjUri)
        .buildRecommended(BigInt(1))
        .saveAsync(this.persister);
      const relayIndex = Math.floor(Math.random() * ohttpRelays.length);
      const { request, ohttpCtx } = payjoinSender.createV2PostRequest(
        ohttpRelays[relayIndex],
      );
      // postPjRequest(request);
      const response = await postRequest(request);
      console.log("response", response);

      const payjoinSender2 = await payjoinSender
        .processResponse(await response.arrayBuffer(), ohttpCtx)
        .saveAsync(this.persister);
      const { request: getRequest, ohttpCtx: ohttpCtx2 } =
        payjoinSender2.createPollRequest(ohttpRelays[relayIndex]);
      const response2 = await postRequest(getRequest);
      const result = await payjoinSender2
        .processResponse(await response2.arrayBuffer(), ohttpCtx2)
        .saveAsync(this.persister);
      console.log("result", result);
    } catch (err) {
      console.error("error", err);
    }
  }
}
