import { readFileSync } from "node:fs";

const LABEL = "[h-7-3-tep-serialization-surface-smoke]";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`${LABEL} ${message}`);
}

const messages = readFileSync(
  "contracts/messages.tact",
  "utf8"
);

const master = readFileSync(
  "contracts/JettonMaster.tact",
  "utf8"
);

function assertContains(source: string, needle: string, label: string): void {
  assert(source.includes(needle), `missing ${label}: ${needle}`);
}

function assertTep64Surface(): void {
  assertContains(master, "content:           Cell;", "TEP-64 master content cell");
  assertContains(master, "jetton_content:     self.content", "TEP-64 get_jetton_data content");
  assertContains(messages, "new_content: Cell;", "TEP-64 metadata update message surface");
}

function assertTep74Surface(): void {
  assertContains(messages, "message(0x0f8a7ea5) TokenTransfer", "TEP-74 transfer opcode");
  assertContains(messages, "message(0x178d4519) TokenInternalTransfer", "TEP-74 internal transfer opcode");
  assertContains(messages, "query_id:             Int as uint64;", "TEP-74 query_id uint64");
  assertContains(messages, "forward_payload:      Slice as remaining;", "TEP-74 forward payload remaining slice");
}

function assertTep89Surface(): void {
  assertContains(messages, "message(0x2c76b973) ProvideWalletAddress", "TEP-89 provide wallet address opcode");
  assertContains(messages, "include_address: Bool;", "TEP-89 include_address flag");
  assertContains(master, "get fun get_wallet_address(owner_address: Address): Address", "TEP-89 get_wallet_address getter");
  assertContains(master, ".storeUint(0xd1735400, 32)", "TEP-89 take wallet address opcode");
}

function assertAmountBoundarySurface(): void {
  assertContains(messages, "amount:               Int as coins;", "TEP amount as coins");
  assertContains(messages, "forward_ton_amount:   Int as coins;", "forward TON amount as coins");
}

function main(): void {
  assertTep64Surface();
  assertTep74Surface();
  assertTep89Surface();
  assertAmountBoundarySurface();

  console.log(`${LABEL} PASS`);
}

main();
