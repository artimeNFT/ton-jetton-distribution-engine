import "dotenv/config";
import { Address, toNano, beginCell, Cell } from "@ton/core";
import { NetworkProvider } from "@ton/blueprint";
import { JettonMaster } from "../build/JettonMaster/JettonMaster_JettonMaster";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildOffchainContent(url: string): Cell {
  return beginCell()
    .storeUint(0x01, 8) // TEP-64 off-chain metadata tag
    .storeStringTail(url)
    .endCell();
}

export async function run(provider: NetworkProvider) {
  const sender = provider.sender().address;
  if (!sender) {
    throw new Error("Sender address is not available.");
  }

  const metadataUrl = requireEnv("JETTON_METADATA_URL");
  const vaultAddress = sender;
  const content = buildOffchainContent(metadataUrl);

  const jettonMaster = provider.open(
    await JettonMaster.fromInit(
      sender,
      content,
      vaultAddress
    )
  );

  console.log("🚀 Deploying JettonMaster at:", jettonMaster.address.toString());
  console.log("👤 Owner / Admin           :", sender.toString());
  console.log("🏦 Vault Address           :", vaultAddress.toString());
  console.log("🔗 Metadata URL            :", metadataUrl);
  console.log("🌐 Network                 :", provider.network());

  const alreadyDeployed = await provider.isContractDeployed(jettonMaster.address);
  if (alreadyDeployed) {
    console.log("ℹ️ Contract is already deployed at this address.");
    return;
  }

  await jettonMaster.send(
    provider.sender(),
    { value: toNano("0.15") },
    null
  );

  await provider.waitForDeploy(jettonMaster.address);

  console.log("✅ Contract deployed at:", jettonMaster.address.toString());
}