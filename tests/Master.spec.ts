// tests/Master.spec.ts

import '@ton/test-utils';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, Slice, beginCell, toNano } from '@ton/core';
import { JettonMaster } from '../build/JettonMaster/JettonMaster_JettonMaster';
import { JettonWallet } from '../build/JettonMaster/JettonMaster_JettonWallet';

function buildWalletList(addresses: Address[]): Cell | null {
    if (addresses.length === 0) {
        return null;
    }

    let current: Cell | null = null;

    for (let i = addresses.length - 1; i >= 0; i--) {
        let builder = beginCell().storeAddress(addresses[i]);

        if (current) {
            builder = builder.storeBit(true).storeRef(current);
        } else {
            builder = builder.storeBit(false);
        }

        current = builder.endCell();
    }

    return current;
}

function emptySlice(): Slice {
    return beginCell().endCell().beginParse();
}

describe('JettonMaster', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let recipient: SandboxContract<TreasuryContract>;
    let jettonMaster: SandboxContract<JettonMaster>;
    let content: Cell;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        owner = await blockchain.treasury('owner');
        vault = await blockchain.treasury('vault');
        recipient = await blockchain.treasury('recipient');

        content = beginCell().storeUint(0, 8).endCell();

        jettonMaster = blockchain.openContract(
            await JettonMaster.fromInit(owner.address, content, vault.address),
        );

        const deployResult = await jettonMaster.send(
            owner.getSender(),
            {
                value: toNano('0.2'),
            },
            null,
        );

        expect(deployResult.transactions).toHaveTransaction({
            to: jettonMaster.address,
            deploy: true,
            success: true,
        });
    });

    it('mints tokens via MasterMint', async () => {
        const mintAmount = toNano('100');

        const res = await jettonMaster.send(
            owner.getSender(),
            {
                value: toNano('0.2'),
            },
            {
                $$type: 'MasterMint',
                query_id: 1n,
                to: owner.address,
                amount: mintAmount,
                response_address: owner.address,
                forward_ton_amount: 0n,
                custom_payload: null,
            },
        );

        expect(res.transactions).toHaveTransaction({
            to: jettonMaster.address,
            success: true,
        });

        const ownerWalletAddress = await jettonMaster.getGetWalletAddress(owner.address);
        const ownerWallet = blockchain.openContract(JettonWallet.fromAddress(ownerWalletAddress));

        expect(res.transactions).toHaveTransaction({
            to: ownerWalletAddress,
            deploy: true,
            success: true,
        });

        const walletData = await ownerWallet.getGetWalletData();

        expect(walletData.owner.equals(owner.address)).toBe(true);
        expect(walletData.master.equals(jettonMaster.address)).toBe(true);
        expect(walletData.balance).toEqual(mintAmount);
    });

    it('transfers tokens from the owner wallet to a new wallet and updates balances', async () => {
        const mintAmount = toNano('100');
        const transferAmount = toNano('25');

        const mintRes = await jettonMaster.send(
            owner.getSender(),
            {
                value: toNano('0.2'),
            },
            {
                $$type: 'MasterMint',
                query_id: 1n,
                to: owner.address,
                amount: mintAmount,
                response_address: owner.address,
                forward_ton_amount: 0n,
                custom_payload: null,
            },
        );

        expect(mintRes.transactions).toHaveTransaction({
            to: jettonMaster.address,
            success: true,
        });

        const ownerWalletAddress = await jettonMaster.getGetWalletAddress(owner.address);
        const recipientWalletAddress = await jettonMaster.getGetWalletAddress(recipient.address);

        const ownerWallet = blockchain.openContract(JettonWallet.fromAddress(ownerWalletAddress));
        const recipientWallet = blockchain.openContract(JettonWallet.fromAddress(recipientWalletAddress));

        const enableTransfersRes = await jettonMaster.send(
            owner.getSender(),
            {
                value: toNano('0.1'),
            },
            {
                $$type: 'SetTransfersEnabled',
                query_id: 2n,
                enabled: true,
                wallets: buildWalletList([ownerWalletAddress]),
            },
        );

        expect(enableTransfersRes.transactions).toHaveTransaction({
            to: jettonMaster.address,
            success: true,
        });

        const transferRes = await ownerWallet.send(
            owner.getSender(),
            {
                value: toNano('0.2'),
            },
            {
                $$type: 'TokenTransfer',
                query_id: 3n,
                amount: transferAmount,
                destination: recipient.address,
                response_destination: owner.address,
                custom_payload: null,
                forward_ton_amount: 0n,
                forward_payload: emptySlice(),
            },
        );

        expect(transferRes.transactions).toHaveTransaction({
            to: ownerWalletAddress,
            success: true,
        });

        expect(transferRes.transactions).toHaveTransaction({
            to: recipientWalletAddress,
            deploy: true,
            success: true,
        });

        const ownerWalletData = await ownerWallet.getGetWalletData();
        const recipientWalletData = await recipientWallet.getGetWalletData();

        expect(ownerWalletData.balance).toEqual(mintAmount - transferAmount);
        expect(recipientWalletData.balance).toEqual(transferAmount);
        expect(recipientWalletData.owner.equals(recipient.address)).toBe(true);
        expect(recipientWalletData.master.equals(jettonMaster.address)).toBe(true);
    });
});