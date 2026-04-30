import { Address } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonWallet } from '../build/ResearchMonster/ResearchMonster_JettonWallet';

export async function run(provider: NetworkProvider): Promise<void> {
    const walletAddress = Address.parse("EQApeRc4EuaLw81iN136XO_Vk8dNyPadf9sUi8SBE9A0Kx4_");
    const wallet = provider.open(JettonWallet.fromAddress(walletAddress));

    const balance = await wallet.getBalance();
    const data = await wallet.getGetWalletData();

    console.log('💰 Balance:', Number(balance) / 1_000_000, 'USDT');
    console.log('📦 Wallet data:', data);
}