# Stage I Read-Only Observation Boundary
## Versioned Compatibility Profile — Candidate v0.1
### Full In-Chat Draft Review — Planning Only

## 1. Profile Identity and Candidate Status

### compatibilityProfileId

```text
Stage I Read-Only Observation Boundary
Versioned Compatibility Profile — Candidate v0.1
```

### compatibilityProfileVersion

```text
Candidate v0.1
```

### profileStatus

```text
candidate only
in-chat draft only
not created
not adopted
not effective
declarative
non-self-executing
non-routable
capability-neutral
```

### Identity Boundary

```text
compatibilityProfileId is the self-identification label
of this in-chat candidate draft only.

It is not an adopted Compatibility Profile reference.

It does not authorize:
- Activation Manifest artifact creation
- Activation Manifest adoption
- capability-opening procedure
- provider initialization
- RPC calls
- network access
- implementation
- capability exposure
```

---

## 2. Documentation / Control Baseline

```text
Documentation / Control HEAD:
b4c66dc2ece668d20c1bb5aa76bce10975c9e215
```

This baseline identifies the effective documentation/control checkpoint
before any Compatibility Profile artifact exists.

A future documentation/control HEAD must not be interpreted as:

```text
implementation authorization
provider initialization authorization
RPC authorization
network-access authorization
wallet-opening authorization
seqno-read authorization
signer authorization
broadcast authorization
Testnet authorization
Mainnet authorization
DRY_RUN=false authorization
capability exposure
```

---

## 3. Capability-Reference Baseline

```text
Capability-reference baseline:
1410abb45c3eda85d4bde02b416553799470951f
```

The capability-reference baseline remains unchanged.

This Compatibility Profile candidate does not establish a new
capability-reference baseline.

---

## 4. Adopted Stage Specification Binding

### stageSpecificationId

```text
docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md
```

### Binding Record

```text
referenceId:
docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md

referenceType:
ADOPTED_STAGE_SPECIFICATION

referenceStatus:
BOUND_TO_ADOPTED_STAGE_SPECIFICATION

bindingEffect:
This Compatibility Profile candidate is subordinate to the adopted
Stage Specification v1.0.

It must not weaken, override, bypass, summarize away,
or silently widen any adopted Specification control.

The binding does not activate capability.
```

### Historical Stage I Identity Preserved

```text
Historical Roadmap:
Stage I = Testnet Execution

Status:
RESERVED
UNOPENED
UNAUTHORIZED
NOT CLOSED
NOT RELEASED
```

---

## 5. Exact Profile Field Allowlist

Only the following Profile fields are permitted:

```text
compatibilityProfileId
compatibilityProfileVersion
profileStatus
stageSpecificationId
approvedAbstractProviderClassSet
forbiddenProviderClassProperties
approvedContractFamilySet
approvedWalletProfileSet
approvedIdentitySet
approvedCodeHashSet
approvedJettonMasterIdentitySet
approvedJettonWalletSchemaSet
approvedSerializationContractSet
approvedProviderObservationSchemaSet
approvedObservationCategoryUniverse
mandatoryForbiddenObservationCategoryFloor
allowedTrustTierConstraintSet
allowedMaturityRequirementSet
allowedBootLifecyclePolicySet
allowedBootScopedCounterPolicySet
canonicalOptionalFieldEncodingPolicyBinding
functionalFingerprintPolicyBinding
evidenceEnvelopeChecksumPolicyBinding
approvedProtocolTimeoutFieldPolicySet
referenceStatusMatrix
unresolvedReferenceBlockers
```

### Field-Allowlist Rule

```text
No additional Profile field is permitted without a separately approved,
narrow, planning-only review.

No field may be silently omitted.

No unresolved member may be replaced by:
- assumed value
- invented identifier
- invented code hash
- invented identity
- inferred schema
- inferred policy
- inferred profile member
```

---

## 6. Exact Profile Field Values

| Profile field | Exact candidate value |
|---|---|
| `compatibilityProfileId` | `Stage I Read-Only Observation Boundary Versioned Compatibility Profile — Candidate v0.1` |
| `compatibilityProfileVersion` | `Candidate v0.1` |
| `profileStatus` | `candidate only / in-chat draft only / not created / not adopted / not effective / declarative / non-self-executing / non-routable / capability-neutral` |
| `stageSpecificationId` | `docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md` |
| `approvedAbstractProviderClassSet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `forbiddenProviderClassProperties` | `DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION` |
| `approvedContractFamilySet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `approvedWalletProfileSet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `approvedIdentitySet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `approvedCodeHashSet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `approvedJettonMasterIdentitySet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `approvedJettonWalletSchemaSet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `approvedSerializationContractSet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `approvedProviderObservationSchemaSet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `approvedObservationCategoryUniverse` | `BOUND_TO_ADOPTED_STAGE_SPECIFICATION_CATEGORY_UNIVERSE` |
| `mandatoryForbiddenObservationCategoryFloor` | `BOUND_TO_ADOPTED_STAGE_SPECIFICATION_FORBIDDEN_USE_FLOOR` |
| `allowedTrustTierConstraintSet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `allowedMaturityRequirementSet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `allowedBootLifecyclePolicySet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `allowedBootScopedCounterPolicySet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `canonicalOptionalFieldEncodingPolicyBinding` | `DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION` |
| `functionalFingerprintPolicyBinding` | `DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION` |
| `evidenceEnvelopeChecksumPolicyBinding` | `DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION` |
| `approvedProtocolTimeoutFieldPolicySet` | `SET_SCHEMA_DEFINED / MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` |
| `referenceStatusMatrix` | `Defined in Section 7 of this in-chat draft` |
| `unresolvedReferenceBlockers` | `Defined in Section 17 of this in-chat draft` |

---

## 7. referenceStatusMatrix

Every Profile field or set is classified explicitly.

| Profile field | referenceId | referenceType | referenceStatus | bindingEffect |
|---|---|---|---|---|
| `compatibilityProfileId` | `Stage I Read-Only Observation Boundary Versioned Compatibility Profile — Candidate v0.1` | `PROFILE_CANDIDATE_SELF_IDENTITY` | `SET_SCHEMA_DEFINED` | Candidate self-identification only. Does not establish an adopted Profile reference. |
| `compatibilityProfileVersion` | `Candidate v0.1` | `PROFILE_CANDIDATE_VERSION` | `SET_SCHEMA_DEFINED` | Candidate version only. Does not establish effectiveness. |
| `profileStatus` | `profileStatus` | `PROFILE_LIFECYCLE_STATUS` | `SET_SCHEMA_DEFINED` | Preserves candidate-only, non-effective, capability-neutral posture. |
| `stageSpecificationId` | `docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md` | `ADOPTED_STAGE_SPECIFICATION` | `BOUND_TO_ADOPTED_STAGE_SPECIFICATION` | Mandatory parent boundary. Does not activate capability. |
| `approvedAbstractProviderClassSet` | `approvedAbstractProviderClassSet` | `ABSTRACT_PROVIDER_CLASS_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. No provider class member is selected or approved. |
| `forbiddenProviderClassProperties` | `docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md :: ## 3. Scope Boundary :: ### Out of Scope` | `FORBIDDEN_PROVIDER_PROPERTY_FLOOR` | `DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION` | Binding deny-floor only. No vendor, endpoint, credential, or implementation detail may enter the Profile. |
| `approvedContractFamilySet` | `approvedContractFamilySet` | `CONTRACT_FAMILY_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. No contract family is approved by this draft. |
| `approvedWalletProfileSet` | `approvedWalletProfileSet` | `WALLET_PROFILE_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. No wallet profile is approved by this draft. |
| `approvedIdentitySet` | `approvedIdentitySet` | `IDENTITY_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. No identity is approved by this draft. |
| `approvedCodeHashSet` | `approvedCodeHashSet` | `CODE_HASH_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. No code hash is invented or approved. |
| `approvedJettonMasterIdentitySet` | `approvedJettonMasterIdentitySet` | `JETTON_MASTER_IDENTITY_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. No Jetton master identity is approved. |
| `approvedJettonWalletSchemaSet` | `approvedJettonWalletSchemaSet` | `JETTON_WALLET_SCHEMA_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. No Jetton wallet schema member is approved. |
| `approvedSerializationContractSet` | `approvedSerializationContractSet` | `SERIALIZATION_CONTRACT_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. No serialization contract member is approved. |
| `approvedProviderObservationSchemaSet` | `approvedProviderObservationSchemaSet` | `PROVIDER_OBSERVATION_SCHEMA_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. No provider observation schema is assumed. |
| `approvedObservationCategoryUniverse` | `docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md :: ## 13. Allowed Observation-Category Allowlist` | `OBSERVATION_CATEGORY_UNIVERSE` | `DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION` | Defines the maximum category universe only. Does not activate any Manifest category. |
| `mandatoryForbiddenObservationCategoryFloor` | `docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md :: ## 14. Forbidden Decision-Driving Fields` | `MANDATORY_FORBIDDEN_USE_FLOOR` | `DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION` | Mandatory deny-floor. A future Manifest may narrow further but must not weaken it. |
| `allowedTrustTierConstraintSet` | `allowedTrustTierConstraintSet` | `TRUST_TIER_CONSTRAINT_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. Any Profile members must remain within the Specification taxonomy. |
| `allowedMaturityRequirementSet` | `allowedMaturityRequirementSet` | `MATURITY_REQUIREMENT_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. Any Profile members must remain within the Specification maturity model. |
| `allowedBootLifecyclePolicySet` | `allowedBootLifecyclePolicySet` | `BOOT_LIFECYCLE_POLICY_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. No continuity policy is inferred. |
| `allowedBootScopedCounterPolicySet` | `allowedBootScopedCounterPolicySet` | `BOOT_SCOPED_COUNTER_POLICY_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. No counter policy is assumed. |
| `canonicalOptionalFieldEncodingPolicyBinding` | `docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md :: ## 18. Evidence Schema :: ### Canonical Optional-Field Encoding` | `CANONICAL_ENCODING_POLICY_BINDING` | `DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION` | Requires explicit schema-versioned `NOT_APPLICABLE` encoding where conditionally inapplicable. |
| `functionalFingerprintPolicyBinding` | `docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md :: ## 19. Evidence-Lineage Requirements :: ### Functional Fingerprint and Audit Envelope Boundary` | `FUNCTIONAL_FINGERPRINT_POLICY_BINDING` | `DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION` | Preserves deterministic functional identity independent of audit timestamp. |
| `evidenceEnvelopeChecksumPolicyBinding` | `docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md :: ## 19. Evidence-Lineage Requirements :: ### Functional Fingerprint and Audit Envelope Boundary` | `EVIDENCE_ENVELOPE_CHECKSUM_POLICY_BINDING` | `DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION` | Preserves tamper-evident envelope checksum separation from execution authority. |
| `approvedProtocolTimeoutFieldPolicySet` | `approvedProtocolTimeoutFieldPolicySet` | `PROTOCOL_TIMEOUT_FIELD_POLICY_SET` | `MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL` | Set schema exists. No local timeout authority is approved. |
| `referenceStatusMatrix` | `referenceStatusMatrix` | `REFERENCE_STATUS_MATRIX` | `SET_SCHEMA_DEFINED` | Every Profile field and set must remain truthfully classified. |
| `unresolvedReferenceBlockers` | `unresolvedReferenceBlockers` | `UNRESOLVED_REFERENCE_BLOCKER_REGISTER` | `SET_SCHEMA_DEFINED` | Every unresolved member set remains explicit and fail-closed. |

### Reference-Truthfulness Rule

```text
No unresolved member is treated as approved.

No unresolved member is treated as selected.

No unresolved member is treated as adopted.

No reference ID is invented.

No code hash is invented.

No identity is invented.

No schema is assumed.

No policy is inferred.

No dependency is silently omitted.
```

---

## 8. Abstract Provider-Class Universe

### approvedAbstractProviderClassSet

```text
referenceId:
approvedAbstractProviderClassSet

referenceType:
ABSTRACT_PROVIDER_CLASS_SET

referenceStatus:
MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL

bindingEffect:
The Profile may define an approved abstract provider-class universe
only after a separate narrow approval.

No class member is approved by this in-chat draft.
```

### Set Schema

Each future abstract provider-class member must remain declarative
and may include only:

```text
abstractClassLabel
classVersion
schemaCompatibilityRequirement
corroborationRequirement
maximumObservationTreatment
forbiddenUses
lineageRequirement
checksumRequirement
```

### forbiddenProviderClassProperties

The following properties are forbidden:

```text
provider vendor
real endpoint
hostname
URL
API key
credential
authentication token
environment secret
RPC method
RPC request payload
RPC response payload
client object
adapter
factory
module path
callback
closure
network handle
socket
wallet handle
signer handle
implementation detail
runtime object
mutable state-store handle
```

### Provider-Class Boundary

```text
Abstract provider class is not provider selection.

Abstract provider class is not endpoint selection.

Abstract provider class is not provider initialization.

Abstract provider class is not RPC authorization.

Abstract provider class is not network-access authorization.
```

---

## 9. Contract and Identity Compatibility Universe

The following set schemas are defined, but all members remain
unresolved:

```text
approvedContractFamilySet
approvedWalletProfileSet
approvedIdentitySet
approvedCodeHashSet
approvedJettonMasterIdentitySet
approvedJettonWalletSchemaSet
approvedSerializationContractSet
approvedProviderObservationSchemaSet
```

### Uniform Status

```text
referenceStatus:
MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL
```

### Set Schemas

#### approvedContractFamilySet

Each future member may include only:

```text
contractFamilyLabel
contractFamilyVersion
compatibilityScope
forbiddenUses
lineageRequirement
checksumRequirement
```

#### approvedWalletProfileSet

Each future member may include only:

```text
walletProfileLabel
walletProfileVersion
contractFamilyBinding
identityConstraintBinding
codeHashConstraintBinding
serializationConstraintBinding
forbiddenUses
lineageRequirement
checksumRequirement
```

#### approvedIdentitySet

Each future member may include only:

```text
identityLabel
identityVersion
identityType
canonicalIdentityRepresentation
compatibilityScope
forbiddenUses
lineageRequirement
checksumRequirement
```

#### approvedCodeHashSet

Each future member may include only:

```text
codeHashLabel
codeHashVersion
canonicalCodeHashRepresentation
contractFamilyBinding
compatibilityScope
forbiddenUses
lineageRequirement
checksumRequirement
```

#### approvedJettonMasterIdentitySet

Each future member may include only:

```text
jettonMasterIdentityLabel
jettonMasterIdentityVersion
canonicalIdentityRepresentation
compatibilityScope
forbiddenUses
lineageRequirement
checksumRequirement
```

#### approvedJettonWalletSchemaSet

Each future member may include only:

```text
jettonWalletSchemaLabel
jettonWalletSchemaVersion
contractFamilyBinding
serializationConstraintBinding
compatibilityScope
forbiddenUses
lineageRequirement
checksumRequirement
```

#### approvedSerializationContractSet

Each future member may include only:

```text
serializationContractLabel
serializationContractVersion
schemaBinding
canonicalEncodingRequirement
compatibilityScope
forbiddenUses
lineageRequirement
checksumRequirement
```

#### approvedProviderObservationSchemaSet

Each future member may include only:

```text
providerObservationSchemaLabel
providerObservationSchemaVersion
primitiveFieldAllowlist
primitiveFieldTypeRules
canonicalOptionalFieldEncodingBinding
functionalFingerprintBinding
evidenceEnvelopeChecksumBinding
forbiddenUses
lineageRequirement
checksumRequirement
```

### Contract and Identity Boundary

```text
No member is approved by this draft.

No code hash is invented.

No identity is invented.

No wallet profile is assumed.

No contract family is assumed.

No serialization contract is assumed.

Unknown member = fail closed.

Unapproved member = fail closed.

Dynamic accept-all behavior = forbidden.
```

---

## 10. Observation-Category Universe

### approvedObservationCategoryUniverse

```text
referenceId:
docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md
:: ## 13. Allowed Observation-Category Allowlist

referenceType:
OBSERVATION_CATEGORY_UNIVERSE

referenceStatus:
DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION

bindingEffect:
The adopted Specification defines the maximum category universe.

The Profile must not widen that universe.

The Manifest must select an explicit narrow allowlist later.

No category is activated by this Profile draft.
```

### Maximum Category Universe

```text
CHAIN_REFERENCE_CONTEXT
TRANSACTION_OUTCOME_EVIDENCE
MESSAGE_PHASE_EVIDENCE
WALLET_CONTRACT_PROFILE_EVIDENCE
JETTON_MASTER_IDENTITY_EVIDENCE
JETTON_WALLET_IDENTITY_EVIDENCE
BALANCE_OBSERVATION_EVIDENCE
PROVIDER_SCHEMA_EVIDENCE
OBSERVATION_CONFLICT_EVIDENCE
MATURITY_EVIDENCE
PROFILE_MATCH_EVIDENCE
PROTOCOL_TIMEOUT_FIELD_EVIDENCE
```

### mandatoryForbiddenObservationCategoryFloor

```text
referenceId:
docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md
:: ## 14. Forbidden Decision-Driving Fields

referenceType:
MANDATORY_FORBIDDEN_USE_FLOOR

referenceStatus:
DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION

bindingEffect:
The adopted Specification defines a mandatory forbidden-use floor.

The Profile must not weaken it.

The Manifest may add stricter denylist selections later.
```

### Category Boundary

```text
Category universe is not category activation.

Profile universe is not Manifest selection.

Manifest selection is not capability opening.

No layer self-executes.
```

---

## 11. Trust and Maturity Constraint Sets

### allowedTrustTierConstraintSet

```text
referenceId:
allowedTrustTierConstraintSet

referenceType:
TRUST_TIER_CONSTRAINT_SET

referenceStatus:
MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL

bindingEffect:
The set schema is defined.

Future members must remain within the adopted Specification taxonomy.

No active trust-tier requirement is selected by this Profile draft.
```

### Adopted Taxonomy Boundary

Any future member must remain within:

```text
T0_UNTRUSTED_DISPLAY_ONLY
T1_SINGLE_SOURCE_UNCONFIRMED
T2_SCHEMA_VALIDATED_CORROBORATED
T3_APPROVED_OBSERVATION_PROFILE
```

### allowedMaturityRequirementSet

```text
referenceId:
allowedMaturityRequirementSet

referenceType:
MATURITY_REQUIREMENT_SET

referenceStatus:
MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL

bindingEffect:
The set schema is defined.

Future members must remain within the adopted Specification maturity
model.

No active maturity requirement is selected by this Profile draft.
```

### Adopted Maturity Boundary

Any future member must remain within:

```text
M0_ABSENT
M1_SEEN_UNCORROBORATED
M2_CORROBORATED_NOT_FINAL
M3_MATURE_CONFIRM_OR_BLOCK_ELIGIBLE
M4_CONFLICTED_OR_DRIFTED
```

### Trust and Maturity Rule

```text
Trust tier is evidence classification only.

Observation maturity is not execution maturity.

Neither trust nor maturity authorizes:
- direct state mutation
- retry
- reassignment
- queue promotion
- queue release
- quarantine mutation
- terminal mutation
- global-halt mutation
- operator-state mutation
- balance-admission mutation
- signer access
- broadcast
```

---

## 12. Boot-Lifecycle and Counter-Policy Constraint Sets

### allowedBootLifecyclePolicySet

```text
referenceId:
allowedBootLifecyclePolicySet

referenceType:
BOOT_LIFECYCLE_POLICY_SET

referenceStatus:
MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL

bindingEffect:
The set schema is defined.

No boot-lifecycle policy member is approved by this Profile draft.
```

### allowedBootScopedCounterPolicySet

```text
referenceId:
allowedBootScopedCounterPolicySet

referenceType:
BOOT_SCOPED_COUNTER_POLICY_SET

referenceStatus:
MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL

bindingEffect:
The set schema is defined.

No boot-scoped counter policy member is approved by this Profile draft.
```

### Mandatory Restart Boundary

```text
A boot-scoped monotonic policy counter is valid only
within one boot lifecycle.

After restart:
- continuity must not be assumed
- maturity must not survive automatically
- expiry must not survive automatically
- release must not survive automatically

Any post-restart continuation requires explicit continuity evidence
and separately approved re-admission rules.

Otherwise fail closed.
```

### Future Member Schema

Each future boot-lifecycle or counter-policy member may include only:

```text
policyLabel
policyVersion
bootScopeRule
monotonicityRule
restartBoundaryRule
continuityEvidenceRequirement
postRestartReadmissionRequirement
forbiddenUses
lineageRequirement
checksumRequirement
```

### Counter-Policy Boundary

```text
No boot policy is assumed.

No counter policy is assumed.

No restart continuity is inferred.

No maturity carry-over is inferred.

No expiry carry-over is inferred.

No release carry-over is inferred.
```

---

## 13. Canonical Encoding, Fingerprint and Checksum Bindings

### canonicalOptionalFieldEncodingPolicyBinding

```text
referenceId:
docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md
:: ## 18. Evidence Schema
:: ### Canonical Optional-Field Encoding

referenceType:
CANONICAL_ENCODING_POLICY_BINDING

referenceStatus:
DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION

bindingEffect:
Conditionally inapplicable fields remain explicit and use one
canonical schema-versioned NOT_APPLICABLE sentinel encoding.
```

### functionalFingerprintPolicyBinding

```text
referenceId:
docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md
:: ## 19. Evidence-Lineage Requirements
:: ### Functional Fingerprint and Audit Envelope Boundary

referenceType:
FUNCTIONAL_FINGERPRINT_POLICY_BINDING

referenceStatus:
DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION

bindingEffect:
Identical approved functional inputs must produce the same
functionalClassificationFingerprint regardless of auditTimestamp.
```

### evidenceEnvelopeChecksumPolicyBinding

```text
referenceId:
docs/STAGE_I_READ_ONLY_OBSERVATION_BOUNDARY_STAGE_SPECIFICATION_V1_0.md
:: ## 19. Evidence-Lineage Requirements
:: ### Functional Fingerprint and Audit Envelope Boundary

referenceType:
EVIDENCE_ENVELOPE_CHECKSUM_POLICY_BINDING

referenceStatus:
DEFINED_INSIDE_ADOPTED_STAGE_SPECIFICATION

bindingEffect:
evidenceEnvelopeChecksum may protect stored or exported evidence,
including non-functional audit metadata.

It must not become execution, transition, retry, recovery,
signer, or broadcast authority.
```

---

## 14. Protocol-Timeout Boundary

### approvedProtocolTimeoutFieldPolicySet

```text
referenceId:
approvedProtocolTimeoutFieldPolicySet

referenceType:
PROTOCOL_TIMEOUT_FIELD_POLICY_SET

referenceStatus:
MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL

bindingEffect:
The set schema is defined.

No protocol-timeout policy member is approved by this Profile draft.
```

### Mandatory Boundary

```text
Protocol-mandated timeout or expiration fields may be serialized,
validated, and retained as evidence where required by protocol.

They must not automatically become:
- local retry authority
- queue-release authority
- lease-expiry authority
- operator-reassignment authority
- scheduler timing authority

Any local functional use requires a separate approved policy gate.
```

### Future Member Schema

Each future member may include only:

```text
policyLabel
policyVersion
protocolFieldScope
serializationRule
validationRule
evidenceRetentionRule
forbiddenLocalAuthorityUses
lineageRequirement
checksumRequirement
```

### Protocol-Timeout Rule

```text
Protocol field existence is not local policy authorization.

Unknown timeout policy = fail closed.

Unapproved timeout policy = fail closed.

Local authority inference = forbidden.
```

---

## 15. Manifest-Selection Separation

The Profile defines admissibility sets and constraints.

The Manifest must later select explicit narrow values from separately
approved Profile members.

### Profile-Defined Universes

```text
approvedAbstractProviderClassSet
approvedObservationCategoryUniverse
mandatoryForbiddenObservationCategoryFloor
allowedTrustTierConstraintSet
allowedMaturityRequirementSet
allowedBootLifecyclePolicySet
allowedBootScopedCounterPolicySet
approvedProtocolTimeoutFieldPolicySet
```

### Manifest-Selection Fields Remaining Separate

```text
approvedAbstractProviderClass
approvedObservationCategories
forbiddenObservationCategories
trustTierRequirements
maturityRequirements
bootLifecyclePolicy
bootScopedCounterPolicy
```

### Separation Rule

```text
The Profile defines approved universes.

The Manifest selects a narrow declarative subset.

The Profile does not activate Manifest selections.

The Manifest must not widen Profile universes.

Manifest selection does not open capability.

No layer self-executes.
```

---

## 16. Governance-Approval Separation

The following reference remains outside the Compatibility Profile:

```text
ownerApprovalReference
```

### Governance Classification

```text
referenceType:
OWNER_APPROVAL_REFERENCE

referenceStatus:
UNRESOLVED_REQUIRES_SEPARATE_APPROVAL

bindingEffect:
Owner approval must remain separately recorded.

It must not be invented.

It must not be inferred from the Profile.

It must not be inferred from the Manifest.

It must not be silently omitted.
```

### Governance Boundary

```text
Compatibility Profile candidate
≠ owner approval

Compatibility Profile adoption
≠ Manifest adoption

Manifest adoption
≠ capability-opening procedure approval

Capability-opening procedure approval
≠ automatic provider initialization

No layer self-executes.
```

---

## 17. Unresolved-Reference Blockers

The following Profile member sets remain unresolved:

```text
approvedAbstractProviderClassSet
approvedContractFamilySet
approvedWalletProfileSet
approvedIdentitySet
approvedCodeHashSet
approvedJettonMasterIdentitySet
approvedJettonWalletSchemaSet
approvedSerializationContractSet
approvedProviderObservationSchemaSet
allowedTrustTierConstraintSet
allowedMaturityRequirementSet
allowedBootLifecyclePolicySet
allowedBootScopedCounterPolicySet
approvedProtocolTimeoutFieldPolicySet
```

Each unresolved member set remains:

```text
MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL
```

### Candidate-Artifact Boundary

```text
Unresolved members do not prevent creation of a future
docs-only Compatibility Profile candidate artifact,
provided every unresolved set remains explicit.

Unresolved members do prevent:
- Compatibility Profile adoption
- effective Profile status
- Manifest artifact creation
- Manifest adoption
- capability-opening procedure consideration
- provider initialization
- RPC calls
- network access
- capability exposure
```

### Fail-Closed Blocker Rule

```text
Unknown member = fail closed.

Missing member approval = fail closed.

Conflicting member definition = fail closed.

Unresolved member used as selected value = fail closed.

No fallback by convenience.

No inference-based repair.

No silent widening.

No dynamic accept-all behavior.
```

---

## 18. Fail-Closed Conditions

This Compatibility Profile candidate must fail closed for:

```text
unknown Profile field
additional unreviewed Profile field
missing required Profile field
unknown referenceStatus
invented reference ID
invented code hash
invented identity
assumed schema
assumed policy
inferred Profile member
silent omission
unknown abstract provider class
unapproved abstract provider class
unknown contract family
unapproved contract family
unknown wallet profile
unapproved wallet profile
unknown identity
unapproved identity
unknown code hash
unapproved code hash
unknown Jetton master identity
unapproved Jetton master identity
unknown Jetton wallet schema
unapproved Jetton wallet schema
unknown serialization contract
unapproved serialization contract
unknown provider observation schema
unapproved provider observation schema
category-universe widening attempt
forbidden-use-floor weakening attempt
unknown trust-tier constraint
unapproved trust-tier constraint
unknown maturity requirement
unapproved maturity requirement
unknown boot-lifecycle policy
unapproved boot-lifecycle policy
unknown boot-scoped counter policy
unapproved boot-scoped counter policy
restart continuity inference attempt
unknown protocol-timeout policy
unapproved protocol-timeout policy
protocol-timeout local-authority attempt
dynamic accept-all behavior
provider vendor insertion attempt
endpoint insertion attempt
credential insertion attempt
RPC-method insertion attempt
implementation-detail insertion attempt
capability-widening attempt
```

### Fail-Closed Rule

```text
Unknown = fail closed.

Missing = fail closed.

Conflicting = fail closed.

Unresolved member used functionally = fail closed.

No silent fallback.

No inference-based repair.

No dynamic acceptance.

No capability widening.
```

---

## 19. Canonical Caveats Carried Forward Unchanged

| Caveat or historical note | Classification | Carry-forward treatment | Resolved by this Profile candidate? |
|---|---|---|---|
| `CAVEAT-F-RETRY-DISCIPLINE` | `FUTURE EXECUTION BLOCKER` | Preserve unchanged; no Stage F reopening | `NO` |
| `CAVEAT-AUDIT-EVIDENCE-INTEGRITY` | `FUTURE EXECUTION BLOCKER` | Preserve unchanged | `NO` |
| `CAVEAT-H-8` | `OPEN CAVEAT — SEPARATE H-TRACK ITEM` | Preserve outside Stage I | `NO` |
| `CAVEAT-H-9` | `OPEN CAVEAT — SEPARATE H-TRACK ITEM` | Preserve outside Stage I | `NO` |
| `CAVEAT-CI-STATUS` | `HISTORICAL EVIDENCE DISCIPLINE` | Preserve conservative evidence wording | `NO` |
| `CAVEAT-JK-SEPARATION` | `WORKSTREAM SEPARATION` | Preserve prohibition against capability inference from Stage J or Stage K | `NO` |
| `I-2.1 linkage gap — bf5657fbe8fb834556eea6907069c7bc03e01b10` | `HISTORICAL EVIDENCE GAP ONLY` | Preserve focused historical linkage note | `NO` |

```text
No caveat is resolved.

No caveat is downgraded.

No caveat is reclassified.

No remediation is opened.

No historical stage is reopened.
```

---

## 20. Workstream Separation

```text
Stage H = separate retrospective evidence-based audit track
Stage I = active controlled progression track
Stage J = planning/design candidate only
Stage K = planning/design only
Stage L = future operations skeleton only
CI Node.js 24 Compatibility Maintenance = separate infrastructure backlog
```

### Separation Boundary

```text
Stage H findings must not migrate into Stage I.

Stage J and Stage K planning must not be treated as authority
for Profile adoption, Manifest adoption, capability-opening procedure,
provider initialization, RPC calls, network access,
or capability exposure.

Stage L must not be treated as runtime authorization.

CI Node.js 24 Compatibility Maintenance must remain outside
this Compatibility Profile candidate.
```

---

## 21. Decision

```text
READY FOR PROFILE CANDIDATE ARTIFACT
```

### Decision Meaning

A future separately approved checkpoint may create a docs-only
Compatibility Profile candidate artifact containing this schema and
the explicit unresolved-member register.

The future candidate artifact must remain:

```text
candidate only
not adopted
not effective
declarative
non-self-executing
non-routable
capability-neutral
```

### Decision Does Not Authorize

```text
artifact creation now
Profile adoption
effective Profile status
Manifest artifact creation
Manifest adoption
capability-opening procedure
provider initialization
RPC calls
network access
wallet opening
seqno reads
signer access
broadcast
Testnet
Mainnet
DRY_RUN=false
implementation
capability exposure
```

### Current Downstream Status

```text
Compatibility Profile candidate artifact:
ELIGIBLE FOR A SEPARATELY APPROVED DOCS-ONLY CREATION SCOPE

Compatibility Profile adoption:
BLOCKED

Activation Manifest artifact creation:
BLOCKED

Activation Manifest adoption:
BLOCKED

Capability opening:
BLOCKED
```

Reason:

```text
Profile member sets remain:
MEMBERS_UNRESOLVED_REQUIRES_SEPARATE_APPROVAL
```

---

## 22. Explicit Stop

```text
Docs-only Compatibility Profile candidate artifact only.

Creation of this file and isolated branch does not authorize
any subsequent action.

No Compatibility Profile adoption is authorized.

No Activation Manifest artifact is authorized.

No capability-opening procedure is authorized.

No provider initialization is authorized.

No RPC call is authorized.

No network access is authorized.

No read-only observation capability is opened.

No capability selection is authorized.

No capability exposure is authorized.

Any regression suite, commit, push, merge, main change,
or further artifact creation requires separate explicit owner approval.
```
