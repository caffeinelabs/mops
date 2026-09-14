// The failure fields execa fills in on a `reject: false` result.
type ExecOutcome = {
  exitCode?: number;
  signal?: string;
  signalDescription?: string;
  originalMessage?: string;
  shortMessage?: string;
};

// A child that was killed or never spawned has no exit code — execa puts
// the reason in `signal` / `originalMessage` instead. Without this, a moc
// binary replaced under a running build reported `exit code: undefined`.
export function describeExecFailure(result: ExecOutcome): string {
  if (result.exitCode !== undefined) {
    return `exit code: ${result.exitCode}`;
  }
  if (result.signal) {
    let description = result.signalDescription
      ? `: ${result.signalDescription}`
      : "";
    return `killed with ${result.signal}${description}`;
  }
  return result.originalMessage || result.shortMessage || "no exit code";
}
