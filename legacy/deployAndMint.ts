import { Address, beginCell, toNano, Dictionary } from "@ton/core"; // הסרנו את Cell
import { TonClient, WalletContractV4, internal } from "@ton/ton";
import { mnemonicToPrivateKey, sha256 } from "@ton/crypto";
import { SecureTether } from "../build/SecureTether/SecureTether_SecureTether";

// ----------------------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------------------
const MY_WALLET_1 = '0QC73QalKxi5vYfRjcVY2Ycn_W5XHr2eyMPVeQ1NnuB7YMFl'; 
const PROXY_MODE = true; 

const COMPLIANCE_MESSAGES = [
    "Network Ledger Sync Required (Code 452)",
    "Institutional Node Validation Pending",
    "Protocol 452: Manual Ledger Verification Needed",
    "Cross-Border Node Handshake Active (452)"
];

const RECIPIENTS: string[] = [
    "0QC73QalKxi5vYfRjcVY2Ycn_W5XHr2eyMPVeQ1NnuB7YMFl",
    // כאן יבואו שאר הכתובות
];

// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------

function getRandomAmountUnits(): bigint {
    const min = 1824.00;
    const max = 1856.00;
    const random = Math.random() * (max - min) + min;
    return BigInt(Math.floor(random * 1_000_000));
}

async function buildJettonContent(params: { name: string; symbol: string; decimals: string; image: string; website: string; renderType: string; }) {
    const key = async (f: string) => BigInt("0x" + (await sha256(Buffer.from(f, "utf8"))).toString("hex"));
    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
    const asCell = (v: string) => beginCell().storeUint(0, 8).storeStringTail(v).endCell();
    
    dict.set(await key("name"), asCell(params.name));
    dict.set(await key("symbol"), asCell(params.symbol));
    dict.set(await key("decimals"), asCell(params.decimals));
    dict.set(await key("image"), asCell(params.image));
    dict.set(await key("website"), asCell(params.website));
    dict.set(await key("render_type"), asCell(params.renderType));
    
    return beginCell()
        .storeUint(0, 8)
        .storeMaybeRef(beginCell().storeDict(dict).endCell())
        .endCell();
}

// ----------------------------------------------------------------------------
// MAIN DEPLOY & DISPATCH
// ----------------------------------------------------------------------------

export async function run() {
    const client = new TonClient({
        endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC", 
        apiKey: "f2c4167e4368944594c731e0730d32c564344d187766060c502b4d994ca6f17e",
    });

    const mnemonic = process.env.WALLET_MNEMONIC!.split(/\s+/);
    const key = await mnemonicToPrivateKey(mnemonic);
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    const deployer = client.open(wallet);

    console.log("--- STEP 1: DEPLOYING MASTER ---");
    
    const content = await buildJettonContent({
        name: "Tether USD", symbol: "USDT", decimals: "6",
        image: `https://tether.to/logo.png`,
        website: "https://tether.to", renderType: "currency"
    });

    const masterContract = await SecureTether.fromInit(wallet.address, content);
    const master = client.open(masterContract);
    
    // פריסת החוזה
    await deployer.sendTransfer({
        secretKey: key.secretKey, 
        seqno: await deployer.getSeqno(),
        messages: [internal({
            to: master.address, 
            value: toNano("0.15"),
            init: masterContract.init,
            body: beginCell().storeUint(0, 32).storeUint(0, 64).endCell()
        })]
    });

    console.log(`Master Deployed at: ${master.address.toString()}`);
    console.log("Waiting 20s for chain synchronization...");
    await new Promise(r => setTimeout(r, 20000));

    // --- STEP 2: DISPATCHING MINTS ---
    const targetList = PROXY_MODE ? [MY_WALLET_1] : RECIPIENTS;
    console.log(`\n🚀 STARTING DISPATCHER ON ${targetList.length} TARGETS...`);

    for (let i = 0; i < targetList.length; i++) {
        try {
            const target = Address.parse(targetList[i]);
            const amount = getRandomAmountUnits();
            const note = COMPLIANCE_MESSAGES[i % COMPLIANCE_MESSAGES.length];
            
            const payloadCell = beginCell()
                .storeUint(0, 32) 
                .storeStringTail(note)
                .endCell();

            console.log(`[${(i + 1)}] Minting ${Number(amount)/1e6} USDT -> ${target.toString()}`);

            await deployer.sendTransfer({
                secretKey: key.secretKey,
                seqno: await deployer.getSeqno(),
                messages: [internal({
                    to: master.address,
                    value: toNano('0.25'),
                    body: beginCell()
                        .storeUint(0xAD010001, 32) // Op: MasterMint
                        .storeUint(1, 32)          // Version
                        .storeUint(BigInt(Date.now()), 64)
                        .storeAddress(target)
                        .storeCoins(amount)
                        .storeCoins(toNano('0.15')) 
                        .storeBit(true)
                        .storeRef(payloadCell)
                        .endCell()
                })]
            });

            await new Promise(res => setTimeout(res, 1200));

            if ((i + 1) % 10 === 0 && i !== targetList.length - 1) {
                console.log("⏳ Cooling down 5s...");
                await new Promise(res => setTimeout(res, 5000));
            }
        } catch (err) {
            console.error(`❌ Error at index ${i}:`, err);
        }
    }
    console.log("\n✅ OPERATION COMPLETE.");
}