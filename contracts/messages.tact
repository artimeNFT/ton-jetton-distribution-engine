const PROTOCOL_VERSION: Int = 2;

const STATUS_NONE:     Int = 0;
const STATUS_VERIFIED: Int = 1;
const STATUS_FROZEN:   Int = 2;

const ERR_UNAUTHORIZED:         Int = 401;
const ERR_COMPLIANCE_VIOLATION: Int = 403;
const ERR_INVALID_PAYLOAD:      Int = 422;

struct JettonData {
    total_supply:       Int as coins;
    mintable:           Bool;
    admin_address:      Address;
    jetton_content:     Cell;
    jetton_wallet_code: Cell;
}

struct JettonWalletData {
    balance:     Int as coins;
    owner:       Address;
    master:      Address;
    wallet_code: Cell;
}

struct JettonComplianceData {
    compliance_status: Int as uint8;
    transfers_enabled: Bool;
    vault_address:     Address;
    is_operator:       Bool;
}

struct InterfacesResponse {
    interfaces: map<Int, Bool>;
}

message(0x642b7d07) MasterMint {
    query_id:           Int as uint64;
    to:                 Address;
    amount:             Int as coins;
    response_address:   Address;
    forward_ton_amount: Int as coins;
    custom_payload:     Cell?;
}

message(0x642b7d17) MasterMintWithPayload {
    query_id:           Int as uint64;
    to:                 Address;
    amount:             Int as coins;
    response_address:   Address;
    forward_ton_amount: Int as coins;
    forward_payload:    Cell?;
}

message(0x0f8a7ea5) TokenTransfer {
    query_id:             Int as uint64;
    amount:               Int as coins;
    destination:          Address;
    response_destination: Address;
    custom_payload:       Cell?;
    forward_ton_amount:   Int as coins;
    forward_payload:      Slice as remaining;
}

message(0x178d4519) TokenInternalTransfer {
    query_id:             Int as uint64;
    amount:               Int as coins;
    from:                 Address;
    response_destination: Address;
    forward_ton_amount:   Int as coins;
    forward_payload:      Slice as remaining;
}

message(0x7362d09c) TokenNotification {
    query_id:        Int as uint64;
    amount:          Int as coins;
    from:            Address;
    forward_payload: Slice as remaining;
}

message(0x595f07bc) TokenBurn {
    query_id:             Int as uint64;
    amount:               Int as coins;
    response_destination: Address;
    custom_payload:       Cell?;
}

message(0x7bdd97de) TokenBurnNotification {
    query_id:             Int as uint64;
    amount:               Int as coins;
    sender:               Address;
    response_destination: Address;
}

message(0xd53276db) TokenExcesses {
    query_id: Int as uint64;
}

message(0x2c76b973) ProvideWalletAddress {
    query_id:        Int as uint64;
    owner_address:   Address;
    include_address: Bool;
}

message(0xa11ce21c) UpdateContent {
    query_id:    Int as uint64;
    new_content: Cell;
}

message(0xd0c4f8a5) SetTransfersEnabled {
    query_id: Int as uint64;
    enabled:  Bool;
    wallets:  Cell?;
}

message(0x6501f354) ChangeAdmin {
    query_id:  Int as uint64;
    new_admin: Address;
    wallets:   Cell?;
}

message(0x31a9b8f2) SetOperator {
    query_id:      Int as uint64;
    wallet_owner:  Address;
    is_operator:   Bool;
    vault_address: Address?;
}

message(0x77cc8f10) UpdateVaultBatch {
    query_id:      Int as uint64;
    vault_address: Address;
    wallets:       Cell?;
}

message(0xfa1234b7) SyncComplianceStatus {
    query_id:     Int as uint64;
    wallet_owner: Address;
}

message(0xde1a9b2c) MasterUpdateWalletStatus {
    query_id:   Int as uint64;
    new_status: Int as uint8;
}

message(0xca11ab1e) SyncPolicy {
    query_id:          Int as uint64;
    transfers_enabled: Bool;
    vault_address:     Address;
    is_operator:       Bool;
}

message(0x7a417411) UpdateVault {
    query_id:      Int as uint64;
    vault_address: Address;
}

fun isAddrNone(addr: Address): Bool {
    let s: Slice = addr.asSlice();
    let p: Slice = s.firstBits(2);
    return p.loadUint(2) == 0;
}