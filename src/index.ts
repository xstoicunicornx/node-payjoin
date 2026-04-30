import { uniffiInitAsync } from "@xstoicunicornx/payjoin";
import { Receiver } from "./receiver";
import { Sender } from "./sender";
import {
  loadOpenReceiverPersisterIds,
  loadOpenSenderPersisterIds,
} from "./persister";

async function receive(arg1: string) {
  if (arg1 === "resume") {
    const ids = loadOpenReceiverPersisterIds();
    for (let id of ids) {
      const receiver = new Receiver(id);
      receiver.poll();
    }
    return;
  }
  const amount = BigInt(parseInt(arg1));
  const expiration = BigInt(Math.floor(Date.now() / 1000) + 60 * 100); // 100 min from now
  const receiver = new Receiver();
  await receiver.initialize(amount, expiration);
  console.log(receiver.getPjUri().asString());
}

async function send(arg1: string, arg2?: string) {
  if (arg1 === "resume") {
    const ids = loadOpenSenderPersisterIds();
    console.log("send resume ids: ", ids);
    for (let id of ids) {
      const sender = new Sender(id);
      sender.poll();
    }
    return;
  }
  const sender = new Sender();
  await sender.initialize(arg1, arg2 ? arg2 : "");
  await sender.postOriginalPsbt();
}

async function main() {
  await uniffiInitAsync();
  const [command, arg1, arg2] = process.argv.slice(2);

  if (!command) throw Error("no command given");
  if (!arg1) throw Error("no arguments provided");
  switch (command) {
    case "receive": {
      await receive(arg1);
      break;
    }
    case "send": {
      await send(arg1, arg2);
      break;
    }
    default: {
      throw Error(`invalid command "${command}"`);
    }
  }
}

main();
