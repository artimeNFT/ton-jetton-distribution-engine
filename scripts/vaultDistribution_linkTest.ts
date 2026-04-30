import "dotenv/config";
import { toNano, Address, beginCell, Cell } from "@ton/core";
import { NetworkProvider } from "@ton/blueprint";
import { JettonMaster } from "../build/JettonMaster/JettonMaster_JettonMaster";
import { JettonWallet } from "../build/JettonMaster/JettonMaster_JettonWallet";

const MINT_ADDRESSES: string[] = [
  "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv",
];

const TEST_URL = "https://example.com/rewards";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function randomAmount(): bigint {
  return 1_290_000_000n;
}

/**
 * TON standard text-comment payload:
 * 32-bit zero prefix + UTF-8 tail string
 */
function buildTextCommentCell(text: string): Cell {
  return beginCell()
    .storeUint(0, 32)
    .storeStringTail(text)
    .endCell();
}

export async function run(provider: NetworkProvider): Promise<void> {
  const masterEnv = process.env.JETTON_MASTER;
  if (!masterEnv) {
    throw new Error("JETTON_MASTER environment variable is not set.");
  }

  const jettonMasterAddress = Address.parse(masterEnv);
  const senderAddress = provider.sender().address;
  if (!senderAddress) {
    throw new Error("Sender address is not available.");
  }

  const minter = provider.open(JettonMaster.fromAddress(jettonMasterAddress));

  console.log("📍 Minter  :", minter.address.toString());
  console.log("👤 Sender  :", senderAddress.toString());
  console.log("🌐 Network : TESTNET ONLY");
  console.log("🔗 URL     :", TEST_URL);
  console.log("");

  let successCount = 0;
  let failCount = 0;
  const failedAddresses: string[] = [];

  for (let i = 0; i < MINT_ADDRESSES.length; i++) {
    const rawAddress = MINT_ADDRESSES[i]!;
    const amount = randomAmount();
    const amountDisplay = (Number(amount) / 1_000_000).toFixed(6);

    console.log(`[${i + 1}/${MINT_ADDRESSES.length}]`);
    console.log(`  📬 Direct mint to : ${rawAddress}`);
    console.log(`  💰 Amount         : ${amountDisplay} tokens`);

    try {
      const destination = Address.parse(rawAddress);
      const commentPayload = buildTextCommentCell(TEST_URL);

      await minter.send(
        provider.sender(),
        { value: toNano("0.2") },
        {
          $$type: "MasterMintWithPayload",
          query_id: BigInt(i + 1),
          to: destination,
          amount,
          response_address: senderAddress,
          forward_ton_amount: toNano("0.05"),
          forward_payload: commentPayload,
        }
      );

      console.log("  ⏳ Waiting for mint confirmation...");
      await sleep(5000);

      const recipientWalletAddress = await minter.getGetWalletAddress(destination);
      const recipientWallet = provider.open(
        JettonWallet.fromAddress(recipientWalletAddress)
      );
      const recipientData = await recipientWallet.getGetWalletData();

      console.log(`  👛 Recipient wallet : ${recipientWalletAddress.toString()}`);
      console.log(
        `  💰 Recipient balance: ${Number(recipientData.balance) / 1_000_000} tokens`
      );

      successCount++;
      console.log("  ✅ Minted!\n");
    } catch (err: unknown) {
      failCount++;
      failedAddresses.push(rawAddress);
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ Failed: ${message}\n`);
    }
  }

  console.log("═══════════════════════════════════════");
  console.log("📊 TEST SUMMARY");
  console.log("═══════════════════════════════════════");
  console.log(`✅ Success       : ${successCount}`);
  console.log(`❌ Failed        : ${failCount}`);
  if (failedAddresses.length > 0) {
    console.log("\n⚠️  Failed addresses:");
    failedAddresses.forEach((a) => console.log(`   ${a}`));
  }
  console.log("═══════════════════════════════════════");
  console.log("🔗 https://testnet.tonscan.org/address/" + minter.address.toString());
}