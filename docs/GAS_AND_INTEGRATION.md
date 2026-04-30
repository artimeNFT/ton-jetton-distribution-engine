// ============================================================
//  GAS_AND_INTEGRATION.md  (render as Markdown)
//  Dynamic Policy System — Gas Analysis & Integration Guide
//  JettonWallet v2.0 + JettonMaster v2.0
// ============================================================

// ─────────────────────────────────────────────────────────────
// §1  GAS OPTIMISATION DECISIONS  (with doc references)
// ─────────────────────────────────────────────────────────────

// ┌─────────────────────────────────────────────────────────────────┐
// │  Pattern                       │ Savings vs. naive approach     │
// ├─────────────────────────────────────────────────────────────────┤
// │  throwUnless(code, cond)        │ No string allocation.         │
// │  vs require("msg", cond)        │ Exit code stored as Int const │
// │                                 │ ~40–80 gas per check          │
// ├─────────────────────────────────────────────────────────────────┤
// │  sender()                       │ Avoids full Context struct    │
// │  vs context().sender            │ load. ~20 gas per call        │
// ├─────────────────────────────────────────────────────────────────┤
// │  Transfer gate: short-circuit   │ is_operator is a Bool stored  │
// │  is_operator || dest==vault     │ compactly. If true, skips     │
// │  || transfers_enabled           │ 1–2 subsequent dict reads.    │
// │                                 │ ~80–130 gas for operators     │
// ├─────────────────────────────────────────────────────────────────┤
// │  deploy() for new wallets       │ Cheaper init dispatch than    │
// │  vs send() with code+data       │ send() per 2025 Tact docs     │
// │                                 │ ~150–300 gas on deployment    │
// ├─────────────────────────────────────────────────────────────────┤
// │  message() for non-deploy msgs  │ Optimised for regular msgs.   │
// │  vs send()                      │ ~100–200 gas per send         │
// ├─────────────────────────────────────────────────────────────────┤
// │  cashback(sender())             │ Leanest excess return. No     │
// │  vs send(SendRemainingValue)    │ body cell construction needed  │
// │  with empty body                │ ~50 gas                       │
// ├─────────────────────────────────────────────────────────────────┤
// │  hasSameBasechainAddress()      │ Skips full Address struct     │
// │  vs contractAddress()==sender() │ construction. ~200+ gas on    │
// │                                 │ the sender validation path    │
// ├─────────────────────────────────────────────────────────────────┤
// │  forward_payload: Slice as      │ Avoids extra cell ref copy.   │
// │  remaining  (not Cell?)         │ Canonical TEP-74 form.        │
// │                                 │ ~50–100 gas per transfer      │
// └─────────────────────────────────────────────────────────────────┘
//
// Total estimated savings on the TokenTransfer hot path:
//   ~600–900 gas vs. naive v1.0 implementation.
// Benchmark with @ton/sandbox before finalising gas reserve values.


// ─────────────────────────────────────────────────────────────
// §2  TRANSFER GATE — DECISION TREE
// ─────────────────────────────────────────────────────────────

//
//  TokenTransfer received
//       │
//       ▼
//  is_operator == true? ──YES──▶ ALLOW (operator bypass)
//       │
//       NO
//       ▼
//  destination == vault_address? ──YES──▶ ALLOW (compliance repatriation)
//       │
//       NO
//       ▼
//  transfers_enabled == true? ──YES──▶ ALLOW (open-beta / live)
//       │
//       NO
//       ▼
//  REJECT (EXIT_TRANSFER_LOCKED = 258)
//
//  Note on short-circuit gas:
//    Each branch that resolves true skips all remaining reads.
//    For an operator wallet in closed-beta, the check costs
//    ~1 Bool read instead of 1 Bool + 1 Address + 1 Bool.


// ─────────────────────────────────────────────────────────────
// §3  SYNCPOLICY — PROPAGATION FLOW
// ─────────────────────────────────────────────────────────────

//
//  ADMIN calls SetTransfersEnabled / ChangeAdmin / SetOperator
//       │
//       ▼
//  JettonMaster updates its own state
//       │
//       ▼
//  Master iterates wallet linked-list Cell
//  and fires one SyncPolicy message per wallet
//  (GAS_SYNC_POLICY = 0.008 TON each)
//       │
//       ▼
//  Each JettonWallet:
//    throwUnless(UNAUTHORIZED_POLICY, sender == jetton_master)
//    → writes transfers_enabled, vault_address, is_operator
//    → cashback(sender) returns unspent gas to master
//       │
//       ▼
//  Master accumulates cashbacks (SendIgnoreErrors, so failures
//  don't block others in the batch)
//
//  IMPORTANT: There is NO consensus guarantee that all wallets
//  update atomically. Wallets in different shards process the
//  SyncPolicy messages in subsequent blocks. The window between
//  master state change and wallet state update is the "policy
//  propagation lag". For compliance use-cases, initiate
//  SetTransfersEnabled → wait 2–3 blocks → verify via indexer
//  before announcing open-beta publicly.


// ─────────────────────────────────────────────────────────────
// §4  VAULT ADDRESS — SEMANTICS & ROTATION
// ─────────────────────────────────────────────────────────────

//  The vault_address is the one non-admin destination that is
//  ALWAYS allowed regardless of the global transfer lock. It is
//  designed to represent:
//    • The compliance treasury wallet (KYC redemption queue)
//    • The admin/owner address (same effect as v1.0 behaviour)
//    • A regulated DEX escrow contract
//
//  To rotate vault_address:
//    Option A — Full policy sync (if operator states also change):
//      master.send(SetTransfersEnabled { ..., wallets: packedList })
//
//    Option B — Vault-only lightweight update:
//      master.send(UpdateVaultBatch { vault_address: newVault, wallets: packedList })
//      → fires UpdateVault (op: 0x7a417411) to each wallet
//      → cheaper per-message than SyncPolicy (smaller body)
//
//  NEVER set vault_address to newAddress(0, 0) — the zero address
//  is not a valid destination on TON and will cause wallet rejects.


// ─────────────────────────────────────────────────────────────
// §5  OPERATOR ROLE — GRANT / REVOKE LIFECYCLE
// ─────────────────────────────────────────────────────────────

//  Operators are settlement agents, AMMs, or liquidity bots that
//  need to move tokens during closed-beta without being blocked.
//
//  Grant:
//    await master.send(admin, { value: toNano("0.05") }, {
//      $$type:       "SetOperator",
//      query_id:     10n,
//      wallet_owner: settlementAgentAddress,
//      is_operator:  true,
//      vault_address: null   // keep existing vault
//    });
//
//  Revoke:
//    await master.send(admin, { value: toNano("0.05") }, {
//      $$type:       "SetOperator",
//      query_id:     11n,
//      wallet_owner: settlementAgentAddress,
//      is_operator:  false,
//      vault_address: null
//    });
//
//  The wallet's operator flag is set atomically via SyncPolicy.
//  The master DOES NOT maintain a registry of operator addresses —
//  operator status lives entirely in each wallet's storage. This
//  keeps the master lean and avoids a hashmap bottleneck.
//  Off-chain indexers should monitor SyncPolicy events to build
//  the operator registry for compliance reporting.


// ─────────────────────────────────────────────────────────────
// §6  WALLET LINKED-LIST ENCODING (TypeScript)
// ─────────────────────────────────────────────────────────────

//  import { beginCell, Address } from '@ton/ton';
//
//  function packWalletList(addresses: Address[]): Cell | null {
//      if (addresses.length === 0) return null;
//      // Build from the tail backwards so each node references next
//      let cell: Cell | null = null;
//      for (let i = addresses.length - 1; i >= 0; i--) {
//          const b = beginCell().storeAddress(addresses[i]);
//          if (cell !== null) {
//              b.storeBit(true).storeRef(cell);
//          } else {
//              b.storeBit(false);
//          }
//          cell = b.endCell();
//      }
//      return cell;
//  }
//
//  Usage:
//    const wallets = packWalletList([addr1, addr2, addr3]);
//    await master.send(admin, { value: toNano("0.5") }, {
//      $$type:   "SetTransfersEnabled",
//      query_id: 20n,
//      enabled:  true,
//      wallets:  wallets
//    });
//
//  Gas budget: 0.008 TON × N wallets + 0.02 TON base + buffer.
//  For N=50: ~0.42 TON recommended attached value.
//  Maximum practical batch size per tx: ~80 wallets (cell depth).


// ─────────────────────────────────────────────────────────────
// §7  SECURITY CHECKLIST
// ─────────────────────────────────────────────────────────────

//  ✅ SyncPolicy / UpdateVault only accepted from jetton_master
//  ✅ TokenTransfer only accepted from wallet owner
//  ✅ TokenInternalTransfer validated via hasSameBasechainAddress()
//  ✅ BurnNotification validated via hasSameBasechainAddress() in master
//  ✅ bounce handler restores balance on failed InternalTransfer
//  ✅ Workchain 0 guard on all user-supplied destination addresses
//  ✅ throwUnless() with numeric exit codes (no string attack surface)
//  ✅ cashback() returns excess rather than accumulating TON in master
//  ✅ vault_address initialised to jetton_master as safe sentinel
//  ✅ is_operator defaults to false at wallet init
//  ✅ transfers_enabled defaults to false (closed-beta from day 0)
//
//  ⚠️  Policy propagation lag: wallets in remote shards may be
//      out of sync for 1–3 blocks after a master state change.
//      Design compliance flows to tolerate this window.
//  ⚠️  SetOperator does NOT add the address to any on-chain registry.
//      Maintain an off-chain operator list for audit purposes.
//  ⚠️  ChangeAdmin is still single-step. Consider adding a two-phase
//      accept pattern for high-value mainnet deployments.
//  ⚠️  Benchmark all gas constants in @ton/sandbox before mainnet.
//      GAS_SYNC_POLICY and GAS_MINT_FWD are estimates.
//  ⚠️  The BurnNotification handler reduces total_supply. Ensure the
//      wallet also has a bounce handler (included) to restore balance
//      if the master rejects the notification (e.g. after an upgrade).
