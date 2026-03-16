import { payjoin, uniffiInitAsync } from "@xstoicunicornx/payjoin_test";
import { Receiver } from "./receiver";
import { Sender } from "./sender";
import {
  loadOpenReceiverPersisterIds,
  SQLiteSenderPersister,
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

async function send(arg1: string) {
  if (arg1 === "resume") {
    const ids = loadOpenReceiverPersisterIds();
    for (let id of ids) {
      const sender = new Sender(id);
      sender.poll();
    }
    return;
  }
  const sender = new Sender();
  await sender.initialize(arg1);
  await sender.postOriginalPsbt();
}

async function main() {
  await uniffiInitAsync();
  const [command, arg1] = process.argv.slice(2);

  if (!command) throw Error("no command given");
  if (!arg1) throw Error("no arguments provided");
  switch (command) {
    case "receive": {
      await receive(arg1);
      break;
    }
    case "send": {
      await send(arg1);
      break;
    }
    default: {
      throw Error(`invalid command "${command}"`);
    }
  }
}

main();
