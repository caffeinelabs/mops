// Keep synchronized with packages/ic-error-types/src/lib.rs in dfinity/ic.
export const ICP_ERROR_CODE_NUMBERS = {
  SubnetOversubscribed: 101,
  MaxNumberOfCanistersReached: 102,
  CanisterQueueFull: 201,
  IngressMessageTimeout: 202,
  CanisterQueueNotEmpty: 203,
  IngressHistoryFull: 204,
  CanisterIdAlreadyExists: 205,
  StopCanisterRequestTimeout: 206,
  CanisterOutOfCycles: 207,
  CertifiedStateUnavailable: 208,
  CanisterInstallCodeRateLimited: 209,
  CanisterHeapDeltaRateLimited: 210,
  CanisterNotFound: 301,
  CanisterSnapshotNotFound: 305,
  InsufficientMemoryAllocation: 402,
  InsufficientCyclesForCreateCanister: 403,
  SubnetNotFound: 404,
  CanisterNotHostedBySubnet: 405,
  CanisterRejectedMessage: 406,
  UnknownManagementMessage: 407,
  InvalidManagementPayload: 408,
  CanisterSnapshotImmutable: 409,
  InvalidSubnetAdmin: 410,
  CanisterTrapped: 502,
  CanisterCalledTrap: 503,
  CanisterContractViolation: 504,
  CanisterInvalidWasm: 505,
  CanisterDidNotReply: 506,
  CanisterOutOfMemory: 507,
  CanisterStopped: 508,
  CanisterStopping: 509,
  CanisterNotStopped: 510,
  CanisterStoppingCancelled: 511,
  CanisterInvalidController: 512,
  CanisterFunctionNotFound: 513,
  CanisterNonEmpty: 514,
  QueryCallGraphLoopDetected: 517,
  InsufficientCyclesInCall: 520,
  CanisterWasmEngineError: 521,
  CanisterInstructionLimitExceeded: 522,
  CanisterMemoryAccessLimitExceeded: 524,
  QueryCallGraphTooDeep: 525,
  QueryCallGraphTotalInstructionLimitExceeded: 526,
  CompositeQueryCalledInReplicatedMode: 527,
  QueryTimeLimitExceeded: 528,
  QueryCallGraphInternal: 529,
  InsufficientCyclesInComputeAllocation: 530,
  InsufficientCyclesInMemoryAllocation: 531,
  InsufficientCyclesInMemoryGrow: 532,
  ReservedCyclesLimitExceededInMemoryAllocation: 533,
  ReservedCyclesLimitExceededInMemoryGrow: 534,
  InsufficientCyclesInMessageMemoryGrow: 535,
  CanisterMethodNotFound: 536,
  CanisterWasmModuleNotFound: 537,
  CanisterAlreadyInstalled: 538,
  CanisterWasmMemoryLimitExceeded: 539,
  ReservedCyclesLimitIsTooLow: 540,
  CanisterInvalidControllerOrSubnetAdmin: 541,
  CanisterStatusAccessDenied: 542,
  DeadlineExpired: 601,
  ResponseDropped: 602,
} as const;

export function icErrorCodeFor(pocketIcCode: string): string | undefined {
  const code =
    ICP_ERROR_CODE_NUMBERS[pocketIcCode as keyof typeof ICP_ERROR_CODE_NUMBERS];
  return code === undefined ? undefined : `IC${String(code).padStart(4, "0")}`;
}

export function mapPocketIcError(error: unknown): Error {
  const original = error instanceof Error ? error : new Error(String(error));
  const message = original.message.replace(
    /Error code: ([A-Za-z0-9_]+)/,
    (match, pocketIcCode: string) => {
      const icCode = icErrorCodeFor(pocketIcCode);
      return icCode ? `Error code: ${icCode} (${pocketIcCode})` : match;
    },
  );
  return message === original.message ? original : new Error(message);
}
