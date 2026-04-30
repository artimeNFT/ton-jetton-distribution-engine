import "@stdlib/deploy";
import "./messages";

const EXIT_TRANSFER_LOCKED:    Int = 258;
const EXIT_NOT_MASTER:         Int = 259;
const EXIT_NOT_OWNER:          Int = 260;
const EXIT_INVALID_AMOUNT:     Int = 261;
const EXIT_INSUFFICIENT_FUNDS: Int = 262;

const GAS_WALLET_MIN_RESERVE: Int = ton("0.01");
const GAS_INTERNAL_TRANSFER:  Int = ton("0.012");
const GAS_NOTIFICATION:       Int = ton("0.005");
const GAS_EXCESSES:           Int = ton("0.003");
const GAS_BURN_NOTIFICATION:  Int = ton("0.012");

const IFACE_JETTON_WALLET: Int = 0x6370a743da3b66e57b01d7a5371b3bce2d4a9dea;
const IFACE_COMPLIANCE_V1: Int = 0x9f2a3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b;

contract JettonWallet {

    balance:           Int as coins;
    owner:             Address;
    master:            Address;
    transfers_enabled: Bool;
    vault_address:     Address;
    is_operator:       Bool;
    compliance_status: Int as uint8;

    init(owner: Address, master: Address) {
        self.owner             = owner;
        self.master            = master;
        self.balance           = 0;
        self.transfers_enabled = false;
        self.vault_address     = master;
        self.is_operator       = false;
        self.compliance_status = STATUS_NONE;
    }

    receive(msg: TokenTransfer) {
        throwUnless(EXIT_NOT_OWNER, sender() == self.owner);
        throwUnless(EXIT_INVALID_AMOUNT, msg.amount > 0);
        throwUnless(EXIT_INSUFFICIENT_FUNDS, self.balance >= msg.amount);

        let locked: Bool = !self.transfers_enabled && !self.is_operator;
        throwUnless(EXIT_TRANSFER_LOCKED, !locked);

        if (self.compliance_status == STATUS_FROZEN) {
            let toVault: Bool = msg.destination == self.vault_address;
            throwUnless(ERR_COMPLIANCE_VIOLATION, toVault);
        }

        self.balance -= msg.amount;

        let recipientInit: StateInit = initOf JettonWallet(msg.destination, self.master);

        deploy(DeployParameters {
            init:   recipientInit,
            value:  msg.forward_ton_amount + GAS_INTERNAL_TRANSFER,
            mode:   SendIgnoreErrors,
            bounce: true,
            body:   TokenInternalTransfer {
                query_id:             msg.query_id,
                amount:               msg.amount,
                from:                 self.owner,
                response_destination: msg.response_destination,
                forward_ton_amount:   msg.forward_ton_amount,
                forward_payload:      msg.forward_payload
            }.toCell()
        });
    }

    receive(msg: TokenInternalTransfer) {
        let peerInit: StateInit = initOf JettonWallet(msg.from, self.master);
        let peerAddr: Address = contractAddress(peerInit);

        let fromPeer: Bool = sender() == peerAddr;
        let fromMaster: Bool = sender() == self.master;
        throwUnless(EXIT_NOT_MASTER, fromPeer || fromMaster);

        self.balance += msg.amount;

        if (msg.forward_ton_amount > 0) {
            message(MessageParameters {
                to:     self.owner,
                value:  msg.forward_ton_amount,
                mode:   SendIgnoreErrors,
                bounce: false,
                body:   TokenNotification {
                    query_id:        msg.query_id,
                    amount:          msg.amount,
                    from:            msg.from,
                    forward_payload: msg.forward_payload
                }.toCell()
            });
        }

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

    receive(msg: TokenBurn) {
        throwUnless(EXIT_NOT_OWNER, sender() == self.owner);
        throwUnless(EXIT_INVALID_AMOUNT, msg.amount > 0);
        throwUnless(EXIT_INSUFFICIENT_FUNDS, self.balance >= msg.amount);
        throwUnless(ERR_COMPLIANCE_VIOLATION, self.compliance_status != STATUS_FROZEN);

        self.balance -= msg.amount;

        message(MessageParameters {
            to:     self.master,
            value:  GAS_BURN_NOTIFICATION,
            mode:   SendIgnoreErrors,
            bounce: true,
            body:   TokenBurnNotification {
                query_id:             msg.query_id,
                amount:               msg.amount,
                sender:               self.owner,
                response_destination: msg.response_destination
            }.toCell()
        });
    }

    receive(msg: SyncPolicy) {
        throwUnless(ERR_UNAUTHORIZED, sender() == self.master);
        self.transfers_enabled = msg.transfers_enabled;
        self.vault_address     = msg.vault_address;
        self.is_operator       = msg.is_operator;
    }

    receive(msg: UpdateVault) {
        throwUnless(ERR_UNAUTHORIZED, sender() == self.master);
        self.vault_address = msg.vault_address;
    }

    receive(msg: MasterUpdateWalletStatus) {
        throwUnless(ERR_UNAUTHORIZED, sender() == self.master);

        let validStatus: Bool =
            msg.new_status == STATUS_NONE     ||
            msg.new_status == STATUS_VERIFIED ||
            msg.new_status == STATUS_FROZEN;

        throwUnless(ERR_INVALID_PAYLOAD, validStatus);

        self.compliance_status = msg.new_status;
    }

    get fun get_wallet_data(): JettonWalletData {
        return JettonWalletData {
            balance:     self.balance,
            owner:       self.owner,
            master:      self.master,
            wallet_code: (initOf JettonWallet(self.owner, self.master)).code
        };
    }

    get fun get_compliance_status(): Int {
        return self.compliance_status;
    }

    get fun get_compliance_data(): JettonComplianceData {
        return JettonComplianceData {
            compliance_status: self.compliance_status,
            transfers_enabled: self.transfers_enabled,
            vault_address:     self.vault_address,
            is_operator:       self.is_operator
        };
    }

    get fun get_interfaces(): map<Int, Bool> {
        let ifaces: map<Int, Bool> = emptyMap();
        ifaces.set(IFACE_JETTON_WALLET, true);
        ifaces.set(IFACE_COMPLIANCE_V1, true);
        return ifaces;
    }

    get fun get_protocol_version(): Int {
        return PROTOCOL_VERSION;
    }

    receive() {}

    bounced(src: bounced<TokenInternalTransfer>) {
        self.balance += src.amount;
    }

    bounced(src: bounced<TokenBurnNotification>) {
        self.balance += src.amount;
    }
}