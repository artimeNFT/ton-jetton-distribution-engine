import "@stdlib/deploy";
import "./messages";
import "./JettonWallet";

const EXIT_NOT_OWNER_MASTER:   Int = 300;
const EXIT_NOT_MINTABLE:       Int = 301;
const EXIT_WRONG_WORKCHAIN_M:  Int = 302;
const EXIT_NOT_WALLET:         Int = 303;
const EXIT_NOT_ENOUGH_VALUE:   Int = 304;

const GAS_MINT_FWD:            Int = ton("0.05");
const GAS_SYNC_POLICY:         Int = ton("0.008");
const GAS_VAULT_UPDATE:        Int = ton("0.005");
const MIN_PROVIDE_WALLET_TON:  Int = ton("0.0061");

fun broadcastSyncPolicy(
    wallets:           Cell?,
    transfers_enabled: Bool,
    vault_address:     Address,
    is_operator:       Bool,
    query_id:          Int
) {
    if (wallets == null) {
        return;
    }

    let node: Slice = wallets!!.beginParse();
    let has_next: Bool = true;

    while (has_next && !node.empty()) {
        let addr: Address = node.loadAddress();

        message(MessageParameters {
            to:     addr,
            value:  GAS_SYNC_POLICY,
            mode:   SendIgnoreErrors,
            bounce: false,
            body:   SyncPolicy {
                query_id:          query_id,
                transfers_enabled: transfers_enabled,
                vault_address:     vault_address,
                is_operator:       is_operator
            }.toCell()
        });

        if (node.loadBit()) {
            node = node.loadRef().beginParse();
        } else {
            has_next = false;
        }
    }
}

fun broadcastUpdateVault(
    wallets:       Cell?,
    vault_address: Address,
    query_id:      Int
) {
    if (wallets == null) {
        return;
    }

    let node: Slice = wallets!!.beginParse();
    let has_next: Bool = true;

    while (has_next && !node.empty()) {
        let addr: Address = node.loadAddress();

        message(MessageParameters {
            to:     addr,
            value:  GAS_VAULT_UPDATE,
            mode:   SendIgnoreErrors,
            bounce: false,
            body:   UpdateVault {
                query_id:      query_id,
                vault_address: vault_address
            }.toCell()
        });

        if (node.loadBit()) {
            node = node.loadRef().beginParse();
        } else {
            has_next = false;
        }
    }
}

contract JettonMaster {

    owner:             Address;
    total_supply:      Int as coins;
    mintable:          Bool;
    content:           Cell;
    transfers_enabled: Bool;
    vault_address:     Address;

    init(owner: Address, content: Cell, vault_address: Address) {
        self.owner             = owner;
        self.total_supply      = 0;
        self.mintable          = true;
        self.content           = content;
        self.transfers_enabled = false;
        self.vault_address     = vault_address;
    }

    inline fun walletCode(): Cell {
        return initOf JettonWallet(myAddress(), myAddress()).code;
    }

    inline fun walletInit(walletOwner: Address): StateInit {
        return initOf JettonWallet(walletOwner, myAddress());
    }

    get fun get_jetton_data(): JettonData {
        return JettonData {
            total_supply:       self.total_supply,
            mintable:           self.mintable,
            admin_address:      self.owner,
            jetton_content:     self.content,
            jetton_wallet_code: self.walletCode()
        };
    }

    get fun get_wallet_address(owner_address: Address): Address {
        return contractAddress(self.walletInit(owner_address));
    }

    receive(msg: MasterMint) {
        throwUnless(EXIT_NOT_OWNER_MASTER, sender() == self.owner);
        throwUnless(EXIT_NOT_MINTABLE, self.mintable);
        forceWorkchain(msg.to, 0, EXIT_WRONG_WORKCHAIN_M);

        self.total_supply += msg.amount;

        let destInit: StateInit = self.walletInit(msg.to);

        let payload: Builder = beginCell();
        if (msg.custom_payload != null) {
            payload = payload.storeBit(true).storeRef(msg.custom_payload!!);
        } else {
            payload = payload.storeBit(false);
        }

        deploy(DeployParameters {
            init:   destInit,
            value:  msg.forward_ton_amount + GAS_MINT_FWD,
            mode:   SendIgnoreErrors,
            bounce: true,
            body:   TokenInternalTransfer {
                query_id:             msg.query_id,
                amount:               msg.amount,
                from:                 myAddress(),
                response_destination: msg.response_address,
                forward_ton_amount:   msg.forward_ton_amount,
                forward_payload:      payload.endCell().beginParse()
            }.toCell()
        });
    }

receive(msg: MasterMintWithPayload) {
    throwUnless(EXIT_NOT_OWNER_MASTER, sender() == self.owner);
    throwUnless(EXIT_NOT_MINTABLE, self.mintable);
    forceWorkchain(msg.to, 0, EXIT_WRONG_WORKCHAIN_M);

    self.total_supply += msg.amount;

    let destInit: StateInit = self.walletInit(msg.to);

    let rawForwardPayload: Slice = msg.forward_payload != null
        ? msg.forward_payload!!.beginParse()
        : beginCell().endCell().beginParse();

    deploy(DeployParameters {
        init:   destInit,
        value:  msg.forward_ton_amount + GAS_MINT_FWD,
        mode:   SendIgnoreErrors,
        bounce: true,
        body:   TokenInternalTransfer {
            query_id:             msg.query_id,
            amount:               msg.amount,
            from:                 myAddress(),
            response_destination: msg.response_address,
            forward_ton_amount:   msg.forward_ton_amount,
            forward_payload:      rawForwardPayload
        }.toCell()
    });
}

    receive(msg: ProvideWalletAddress) {
        throwUnless(EXIT_NOT_ENOUGH_VALUE, context().value >= MIN_PROVIDE_WALLET_TON);

        let walletAddr: BasechainAddress = emptyBasechainAddress();

        try {
            let parsed = parseStdAddress(msg.owner_address.asSlice());
            if (parsed.workchain == 0) {
                walletAddr = contractBasechainAddress(self.walletInit(msg.owner_address));
            }
        } catch (exitCode) {
        }

        let resp: Builder = beginCell()
            .storeUint(0xd1735400, 32)
            .storeUint(msg.query_id, 64)
            .storeBasechainAddress(walletAddr);

        if (msg.include_address) {
            let ownerRef: Cell = beginCell()
                .storeAddress(msg.owner_address)
                .endCell();
            resp = resp.storeBit(true).storeRef(ownerRef);
        } else {
            resp = resp.storeBit(false);
        }

        message(MessageParameters {
            to:     sender(),
            value:  0,
            mode:   SendRemainingValue,
            bounce: false,
            body:   resp.endCell()
        });
    }

    receive(msg: UpdateContent) {
        throwUnless(EXIT_NOT_OWNER_MASTER, sender() == self.owner);
        self.content = msg.new_content;
        cashback(sender());
    }

    receive(msg: SetTransfersEnabled) {
        throwUnless(EXIT_NOT_OWNER_MASTER, sender() == self.owner);
        self.transfers_enabled = msg.enabled;

        broadcastSyncPolicy(
            msg.wallets,
            msg.enabled,
            self.vault_address,
            false,
            msg.query_id
        );

        cashback(sender());
    }

    receive(msg: ChangeAdmin) {
        throwUnless(EXIT_NOT_OWNER_MASTER, sender() == self.owner);
        self.owner = msg.new_admin;

        broadcastSyncPolicy(
            msg.wallets,
            self.transfers_enabled,
            self.vault_address,
            false,
            msg.query_id
        );

        cashback(sender());
    }

    receive(msg: SetOperator) {
        throwUnless(EXIT_NOT_OWNER_MASTER, sender() == self.owner);

        let vaultAddr: Address = msg.vault_address != null
            ? msg.vault_address!!
            : self.vault_address;

        let walletAddr: Address = self.get_wallet_address(msg.wallet_owner);

        message(MessageParameters {
            to:     walletAddr,
            value:  GAS_SYNC_POLICY,
            mode:   SendIgnoreErrors,
            bounce: false,
            body:   SyncPolicy {
                query_id:          msg.query_id,
                transfers_enabled: self.transfers_enabled,
                vault_address:     vaultAddr,
                is_operator:       msg.is_operator
            }.toCell()
        });

        cashback(sender());
    }

    receive(msg: UpdateVaultBatch) {
        throwUnless(EXIT_NOT_OWNER_MASTER, sender() == self.owner);
        self.vault_address = msg.vault_address;

        broadcastUpdateVault(msg.wallets, msg.vault_address, msg.query_id);
        cashback(sender());
    }

    receive(msg: TokenBurnNotification) {
        let expectedWallet: StateInit = self.walletInit(msg.sender);
        throwUnless(
            EXIT_NOT_WALLET,
            expectedWallet.hasSameBasechainAddress(sender())
        );

        self.total_supply -= msg.amount;

        if (!isAddrNone(msg.response_destination)) {
            message(MessageParameters {
                to:     msg.response_destination,
                value:  0,
                mode:   SendRemainingValue | SendIgnoreErrors,
                bounce: false,
                body:   TokenExcesses { query_id: msg.query_id }.toCell()
            });
        }
    }

    receive() {}
}