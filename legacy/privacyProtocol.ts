/**
 * SecureTether-Node — rotateIdentity.ts
 * Updates the Jetton Master's on-chain TEP-64 metadata.
 * Handles contentVersion strict-increase and image cache-busting.
 */

import {
    Address,
    beginCell,
    Dictionary,
    TonClient,
    WalletContractV4,
    toNano,
    internal,
} from "@ton/ton";
import { mnemonicToPrivateKey, sha256 } from "@ton/crypto";
// תיקון שורה 20: התאמה ל-Wrapper הנכון בתיקיית ה-build
import { SecureTether } from "../build/SecureTether/SecureTether_SecureTether";

const PROTOCOL_VERSION = 1n;

function getTonClient(): TonClient {
    return new TonClient({
        // תיקון שורה 27: וידוא Endpoint של Testnet
        endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
        timeout: 60_000,
    });
}

// TEP-64 snake-cell string encoding (0x00 prefix = utf-8 text)
function asMetadataCell(value: string) {
    return beginCell()
        .storeUint(0, 8)
        .storeStringTail(value)
        .endCell();
}

async function buildJettonContent(params: {
    name:        string;
    symbol:      string;
    description: string;
    decimals:    string;
    image:       string;
    renderType:  string;
}) {
    const key = async (field: string): Promise<bigint> => {
        const buf = await sha256(Buffer.from(field, "utf8"));
        return BigInt("0x" + buf.toString("hex"));
    };

    const dict = Dictionary.empty(
        Dictionary.Keys.BigUint(256),
        Dictionary.Values.Cell()
    );

    dict.set(await key("name"),        asMetadataCell(params.name));
    dict.set(await key("symbol"),      asMetadataCell(params.symbol));
    dict.set(await key("description"), asMetadataCell(params.description));
    dict.set(await key("decimals"),    asMetadataCell(params.decimals));
    dict.set(await key("image"),       asMetadataCell(params.image));
    dict.set(await key("render_type"), asMetadataCell(params.renderType));

    return beginCell()
        .storeUint(0, 8)
        .storeMaybeRef(beginCell().storeDict(dict).endCell())
        .endCell();
}

export async function run() {
    const client = getTonClient();

    const mnemonicRaw = process.env.WALLET_MNEMONIC;
    if (!mnemonicRaw) throw new Error("WALLET_MNEMONIC is not set");
    const mnemonic = mnemonicRaw.trim().split(/\s+/);
    if (mnemonic.length !== 24) throw new Error("WALLET_MNEMONIC must be 24 words");

    // תיקון שורה 88: וידוא משיכת MASTER_ADDRESS מה-env
    const masterRaw = process.env.MASTER_ADDRESS;
    if (!masterRaw) throw new Error("MASTER_ADDRESS is not set in .env");

    const { publicKey, secretKey } = await mnemonicToPrivateKey(mnemonic);
    const wallet  = WalletContractV4.create({ publicKey, workchain: 0 });
    const deployer = client.open(wallet);
    const master   = client.open(
        SecureTether.fromAddress(Address.parse(masterRaw))
    );

    console.log("Deployer:", wallet.address.toString());
    console.log("Master:  ", masterRaw);

    // ── Read current contentVersion from chain ─────────────────
    const jettonData     = await master.getJettonData();
    const currentVersion = Number(jettonData.contentVersion);
    const nextVersion    = currentVersion + 1;

    console.log(`\nContent version: ${currentVersion} → ${nextVersion}`);

    // ── Build updated metadata ─────────────────────────────────
    const baseImageUrl  = process.env.NEW_IMAGE_URL
        ?? "https://tether.to/images/logoCircle.png";
    const versionedImageUrl = `${baseImageUrl}?v=${Date.now()}`;

    const newDescription = process.env.NEW_DESCRIPTION
        ?? "Tether USD (USDT) — institutional-grade stablecoin.";

    const newContent = await buildJettonContent({
        name:        "Tether USD",
        symbol:      "USDT",
        description: newDescription,
        decimals:    "6",
        image:       versionedImageUrl,
        renderType:  "currency",
    });

    console.log("New image URL:", versionedImageUrl);

    const queryId = BigInt(Date.now());
    const seqno   = await deployer.getSeqno();

    await deployer.sendTransfer({
        secretKey,
        seqno,
        messages: [
            internal({
                to:    Address.parse(masterRaw),
                value: toNano("0.05"),
                body:  beginCell()
                    .storeUint(0xAD010002, 32)
                    .storeUint(Number(PROTOCOL_VERSION), 32)
                    .storeUint(queryId, 64)
                    .storeRef(newContent)
                    .storeUint(nextVersion, 32)
                    .endCell(),
            }),
        ],
    });

    console.log("\n✅ MasterUpdateContent sent");
    console.log("   contentVersion:", nextVersion);
    console.log("   queryId:        ", queryId.toString());
    console.log(
        "\nTonviewer:\n   https://testnet.tonviewer.com/" + masterRaw
    );
}