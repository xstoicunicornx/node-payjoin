import { payjoin, uniffiInitAsync } from "@xstoicunicornx/payjoin_test";
import { originalPsbt } from "payjoin-test-utils";
import { Receiver } from "./src/receiver.ts";
import { Sender } from "./src/sender.ts";

async function main() {
  await uniffiInitAsync();

  const receiver = new Receiver();
  receiver.getbalance();
  const amount = BigInt(10000);
  const address = await receiver.getnewaddress();
  await receiver.initialize(BigInt(10000), BigInt(1772222563));
  const uri = receiver.getPjUri();
  console.log("uri", uri.pjEndpoint());
  receiver.poll();

  // const sender = new Sender();
  // sender.getbalance();
  // sender.getNewPayjoinSender(uri.asString());

  // const senderPersister = new InMemorySenderPersisterAsync(1);
  // const psbt = originalPsbt();
  // const withReplyKey = await new payjoin.SenderBuilder(psbt, uri)
  //   .buildRecommended(BigInt(1000))
  //   .saveAsync(senderPersister);
  // console.log("psbt", psbt);
  // console.log(withReplyKey);
}

main();
