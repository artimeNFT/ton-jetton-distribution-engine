export type AdministrativeHaltBoundary =
  | "before_intake"
  | "after_runstate_plan"
  | "before_dry_run_transition"
  | "before_dispatch_intent_exposure";

export interface StageEAdministrativeHaltSignal {
  readonly active: boolean;
  readonly source: "stage_e_orchestrator";
  readonly reason: string | null;
}

export interface AdministrativeHaltInterceptionInput {
  readonly boundary: AdministrativeHaltBoundary;
  readonly administrativeHalt: StageEAdministrativeHaltSignal;
}

export type AdministrativeHaltInterceptionReason =
  | "invalid_input"
  | "invalid_boundary"
  | "invalid_halt_signal"
  | "administrative_halt_active"
  | "forbidden_execution_context";

export type AdministrativeHaltInterceptionResult =
  | {
      readonly ok: true;
      readonly action: "boundary_allowed";
      readonly boundary: AdministrativeHaltBoundary;
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason: AdministrativeHaltInterceptionReason;
      readonly boundary?: AdministrativeHaltBoundary;
      readonly haltReason?: string | null;
    };

const VALID_BOUNDARIES = new Set<string>([
  "before_intake",
  "after_runstate_plan",
  "before_dry_run_transition",
  "before_dispatch_intent_exposure",
]);

const FORBIDDEN_FIELDS = new Set<string>([
  "txHash",
  "networkRef",
  "rpcEndpoint",
  "signerState",
  "liveExecution",
  "broadcast",
  "privateKey",
  "signedMessage",
]);

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasForbiddenField(value: Record<string, unknown>): boolean {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_FIELDS.has(key)) return true;
  }
  return false;
}

function rejected(
  reason: AdministrativeHaltInterceptionReason,
  boundary?: AdministrativeHaltBoundary,
  haltReason?: string | null,
): AdministrativeHaltInterceptionResult {
  const result: {
    ok: false;
    action: "rejected";
    reason: AdministrativeHaltInterceptionReason;
    boundary?: AdministrativeHaltBoundary;
    haltReason?: string | null;
  } = { ok: false, action: "rejected", reason };

  if (boundary !== undefined) result.boundary = boundary;
  if (haltReason !== undefined) result.haltReason = haltReason;
  return result;
}

function isValidBoundary(value: unknown): value is AdministrativeHaltBoundary {
  return typeof value === "string" && VALID_BOUNDARIES.has(value);
}

function isValidHaltSignal(value: unknown): value is StageEAdministrativeHaltSignal {
  if (!isNonArrayObject(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["active"] === "boolean" &&
    v["source"] === "stage_e_orchestrator" &&
    (v["reason"] === null || typeof v["reason"] === "string")
  );
}

export function evaluateAdministrativeHaltInterception(
  input: unknown,
): AdministrativeHaltInterceptionResult {
  if (!isNonArrayObject(input)) {
    return rejected("invalid_input");
  }

  if (hasForbiddenField(input)) {
    return rejected("forbidden_execution_context");
  }

  const candidate = input as unknown as AdministrativeHaltInterceptionInput;

  if (!isValidBoundary(candidate.boundary)) {
    return rejected("invalid_boundary");
  }

  if (
    isNonArrayObject(candidate.administrativeHalt) &&
    hasForbiddenField(candidate.administrativeHalt as unknown as Record<string, unknown>)
  ) {
    return rejected("forbidden_execution_context", candidate.boundary);
  }

  if (!isValidHaltSignal(candidate.administrativeHalt)) {
    return rejected("invalid_halt_signal", candidate.boundary);
  }

  if (candidate.administrativeHalt.active === true) {
    return rejected(
      "administrative_halt_active",
      candidate.boundary,
      candidate.administrativeHalt.reason,
    );
  }

  return {
    ok: true,
    action: "boundary_allowed",
    boundary: candidate.boundary,
  };
}
