/**
 * candidateRecordBuilder.ts
 *
 * Pure CandidateRecord construction for the Stage B-2 Watcher ingestion layer.
 *
 * Hard constraints:
 * - No I/O.
 * - No network.
 * - No wall-clock reads.
 * - No randomness.
 * - No RunState reads/writes.
 * - No targets reads/writes.
 * - No Dispatcher coupling.
 * - No signing, sending, broadcasting, or execution.
 *
 * Advisory profile metadata is copied into CandidateRecord.profile as
 * non-authoritative metadata only. It must never affect candidate identity,
 * filtering, decisions, target promotion, or execution.
 */

import {
  buildCandidateKeyString,
  extractCandidateKeyComponents,
  hashCandidateKey,
} from "./candidateId";
import type {
  AddressProfile,
  AdvisoryAddressProfile,
  CandidateProfile,
  CandidateRecord,
  NormalizedEvent,
} from "./ingestionTypes";

type WatcherProfileStatus = "partial" | "unresolved";

export function buildCandidateRecord(event: NormalizedEvent): CandidateRecord {
  const candidateKeyString = buildCandidateKeyString(event);
  const candidateId = hashCandidateKey(candidateKeyString);
  const profile = buildCandidateProfile(event);

  return {
    candidateId,
    candidateKeyComponents: extractCandidateKeyComponents(event),
    observedByProvider: event.provider,
    sourceEventRef: event.txHash,
    jettonMaster: event.jettonMaster,
    jettonMasterCanonicalKey: event.jettonMasterCanonicalKey,
    destinationAddress: event.destinationAddress,
    destinationCanonicalKey: event.destinationCanonicalKey,
    sourceAddress: event.sourceAddress,
    sourceCanonicalKey: event.sourceCanonicalKey,
    amount: event.amountDecimal,
    lt: event.lt,
    detectedAt: event.detectedAt,
    eventTimestamp: event.eventTimestamp,
    finality: event.finality,
    profileStatus: deriveProfileStatus(profile),
    profile,
    decision: "pending",
  };
}

function buildCandidateProfile(event: NormalizedEvent): CandidateProfile {
  return {
    destination: mapAdvisoryAddressProfile(event.advisoryProfile?.destination),
    source: mapAdvisoryAddressProfile(event.advisoryProfile?.source),
  };
}

function mapAdvisoryAddressProfile(
  advisory: AdvisoryAddressProfile | null | undefined,
): AddressProfile {
  return {
    accountStatus: advisory?.accountStatus ?? null,
    codeHash: advisory?.codeHash ?? null,
    walletType: advisory?.walletTypeHint ?? null,
    entityLabel: advisory?.entityLabel ?? null,
  };
}

function deriveProfileStatus(profile: CandidateProfile): WatcherProfileStatus {
  return hasAnyProfileField(profile) ? "partial" : "unresolved";
}

function hasAnyProfileField(profile: CandidateProfile): boolean {
  return (
    hasAnyAddressProfileField(profile.destination) ||
    hasAnyAddressProfileField(profile.source)
  );
}

function hasAnyAddressProfileField(profile: AddressProfile): boolean {
  return (
    profile.accountStatus !== null ||
    profile.codeHash !== null ||
    profile.walletType !== null ||
    profile.entityLabel !== null
  );
}
