# Your task: verify one candidate finding

One reviewer reported the candidate below. You have not seen their reasoning beyond this block, which is
deliberate. Check it against the actual code and decide whether it is real.

**Try to refute it.** Assume it is wrong until the code shows otherwise. Most false positives die to one of
these four checks, so run all four before you conclude anything:

1. **Read the code at Head.** Open the cited file and read the full enclosing function, plus every helper it
   calls that matters to the claim. Does the code actually say what the candidate claims it says? Misread
   control flow, a guard the reporter did not notice, and a helper that already handles the case are the
   most common refutations.
2. **Establish the Base behavior.** The materialized patch for the file
   (`.ai-review-context/file-diffs/<path>.patch`) shows the Base side of every changed hunk. If the Base
   code has the same defect with equivalent behavior, and this PR neither worsened it nor gave it a new call
   path or a new input source, the candidate is REFUTED as pre-existing. Be careful with the exception:
   logic this PR **moved, copied, or re-implemented at a new site** is new code at that site and is NOT
   pre-existing, even if identical logic remains elsewhere.
3. **Reach the trigger.** Take the candidate's `trigger` and trace it from a real entry point — a CLI
   invocation, an actor method call, a UI action. Can a caller actually produce that state? If the trigger is
   impossible because of validation, a type, or an earlier guard, the candidate is REFUTED as unreachable.
   Check the producer before you assume it cannot happen: if the trigger needs a duplicate, an empty list, or
   a value in two places, go read the code that builds that input and see whether it can.
4. **Confirm the outcome.** If the trigger is reachable, follow it through to the stated consequence. The
   outcome the candidate claims must be the outcome the code produces. A real trigger with the wrong
   consequence is not refuted — restate the correct one and confirm.

## Verdicts

- **CONFIRMED** — you traced the trigger to a reachable entry point, you established that Base behaved
  differently (or that this is a new site for the logic), and you followed the code to the bad outcome.
- **PLAUSIBLE** — you could not refute it and could not fully confirm it: the trigger looks reachable but you
  could not trace it end to end, or you could not establish the Base behavior with certainty. Say precisely
  what you could not verify. Use this rather than guessing in either direction.
- **REFUTED** — one of the four checks above failed, and you can name which and why. "It seems unlikely",
  "the author probably meant to do that", and "this is minor" are NOT refutations. Severity is not your
  call; only reality is.

Being intended does not make a defect correct: if the code demonstrably does the wrong thing, CONFIRM it and
let the synthesis pass decide how it is classified.

## Output format (STRICT)

Output exactly one block and nothing else.

```
=== VERDICT ===
id: <the candidate's id, unchanged>
verdict: CONFIRMED | PLAUSIBLE | REFUTED
reason: <one or two sentences: which check settled it, and the evidence>
evidence: <the files and functions you actually read, comma-separated>
scenario: <for CONFIRMED and PLAUSIBLE: the concrete trigger to outcome walk, with real values. For REFUTED: leave empty.>
base_behavior: <for CONFIRMED and PLAUSIBLE: what the Base SHA did instead. For REFUTED: leave empty.>
=== END VERDICT ===
```
