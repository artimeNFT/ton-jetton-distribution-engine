"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const core_1 = require("@ton/core");
const ResearchMonster_ResearchMonster_1 = require("../build/ResearchMonster/ResearchMonster_ResearchMonster");
async function run(provider) {
    const content = (0, core_1.beginCell)()
        .storeUint(1, 8)
        .storeStringTail("https://raw.githubusercontent.com/artimeNFT/jetton-metadata/refs/heads/main/metadata.json")
        .endCell();
    const minter = provider.open(await ResearchMonster_ResearchMonster_1.ResearchMonster.fromInit(provider.sender().address, content));
    const ownerAddress = core_1.Address.parse("0QC73QalKxi5vYfRjcVY2Ycn_W5XHr2eyMPVeQ1NnuB7YMFl");
    const walletAddress = await minter.getGetWalletAddress(ownerAddress);
    console.log('🔍 JettonWallet address:');
    console.log(walletAddress.toString());
    console.log('🔗 https://testnet.tonscan.org/address/' + walletAddress.toString());
}
