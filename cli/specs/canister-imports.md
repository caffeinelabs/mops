# Spec: `canister-imports`

Status: draft
Owner: mops CLI
Tracking: feature spec, no implementation yet

## Motivation

Motoko 1.5 introduces two moc flags for resolving cross-canister `import` statements:

- `--actor-env-alias <alias> <env-var-key> <candid-path>` — late binding; the
  deployed canister reads the env-var key from its own canister environment
  variables at instantiation time to resolve the principal.
- `--actor-id-alias <alias> <principal> <candid-path>` — compile-time pinning;
  the principal is baked into the wasm.

Both are required for `mops check` and `mops build`, otherwise
`import "canister:foo"` fails to type-check with `M0011`.

Today, the only way to express these in `mops.toml` is to drop the raw flags
into `[moc].args` or `[canisters.NAME].args`:

```toml
[canisters.test]
args = ["--actor-env-alias", "greet", "PUBLIC_CANISTER_ID:greeter", "did/greet.did"]
```

This is brittle, hard to read, easy to typo, and offers no validation. Users
deploying with icp-cli additionally need to align the env-var key with
icp-cli's `PUBLIC_CANISTER_ID:<canister-name>` convention by hand.

This feature adds first-class config for cross-canister imports.

## Scope (v1)

Supports only `--actor-env-alias` for canisters that follow the icp-cli
deployer convention `PUBLIC_CANISTER_ID:<name>`. `--actor-id-alias` and
custom env-var keys are out of scope and tracked under "future extensions"
below — they remain accessible via `[moc].args` in the meantime.

## Schema

```toml
[canisters.<importer>.canister-imports.env]
<alias> = "<candid-path>"
```

- `<importer>` — the canister that performs the `import` (must be declared in
  `[canisters.<importer>]`).
- `<alias>` — the source-code alias from `import Foo "canister:<alias>"`.
  Used both as the alias passed to moc and as the suffix of the auto-generated
  env-var key.
- `<candid-path>` — path to a `.did` file describing the imported actor's
  interface, resolved relative to `mops.toml`.

The section path `canister-imports.env` is the v1 extension point; future
flag flavors (e.g. `canister-imports.id`) slot in as siblings without
breaking this schema.

## Resolution

Each entry under `canister-imports.env` expands to a single moc invocation
fragment:

```
--actor-env-alias <alias> PUBLIC_CANISTER_ID:<alias> <candid-path>
```

The env-var key is always derived from the alias; it is not configurable in
v1.

### Example

Source code:

```motoko
// src/test/Test.mo
import Greet "canister:greet";

persistent actor Test {
  public func call() : async Text {
    await Greet.greet("World");
  };
};
```

Configuration:

```toml
[canisters.greet]
main = "src/greet/Greet.mo"
candid = "did/greet.did"

[canisters.test]
main = "src/test/Test.mo"

[canisters.test.canister-imports.env]
greet = "did/greet.did"
```

Expansion (appended to every moc invocation that compiles or type-checks
`Test.mo`):

```
--actor-env-alias greet PUBLIC_CANISTER_ID:greet did/greet.did
```

## Affected commands

The expanded moc args must be threaded through every command that invokes
moc on a canister that declares `canister-imports`:

- `mops check`
- `mops check-stable`
- `mops build`
- `mops test` (when test files belong to a canister that declares imports)
- `mops bench` (same as test)

A single shared helper builds the args from a canister config, called from
each command. Without the flag, type-checking fails with `M0011` and builds
do not produce wasm.

## Validation

- The candid path must exist on disk; missing → clear error naming the
  binding and the path.
- Aliases are unique within a canister's `canister-imports.env` section.
  Duplicate keys are a TOML error and are surfaced as such.
- Unknown subsections under `canister-imports` (anything other than `env`
  in v1) are an error, not silently ignored. Forward-compat: when `id`
  arrives, the validator's allowed-keys list is extended.

## Toolchain requirement

`--actor-env-alias` requires moc 1.5 or later. When `canister-imports.env`
is non-empty and the resolved moc is older, mops emits an error during
command setup before invoking moc:

```
Canister `<name>` declares [canisters.<name>.canister-imports.env] which
requires moc >= 1.5 (resolved: 0.14.14).
Set [toolchain] moc = "1.5.x" or higher in mops.toml.
```

## Interaction with existing flag escape hatches

`[moc].args` and `[canisters.NAME].args` continue to accept raw moc flags.
If the user supplies a literal `--actor-env-alias` or `--actor-id-alias`
in `args` while also declaring `canister-imports`, mops emits a warning at
build time (matching the existing `managedFlags` pattern in `build.ts`).
This stays advisory, not fatal — users may have legitimate reasons to
mix the structured form with raw overrides during migration.

## Trade-offs and explicit non-goals

### Alias-and-canister-name divergence

The shorthand always derives the env-var key from the alias. This means
shorthand only produces correct runtime behaviour when the alias the user
chose in source code matches the canister name written in the deployer's
config (`icp.yaml` or equivalent), because that name is what the deployer
uses when populating `PUBLIC_CANISTER_ID:<name>`.

If a user names their canister `greeter` in `icp.yaml` but imports it as
`canister:greet` in source code, the shorthand defaults to
`PUBLIC_CANISTER_ID:greet`, which the deployer will not set. The
canister will fail at runtime when the import is resolved.

The supported answer in v1: pick consistent names. The future answer: an
explicit form that lets the user spell out the env-var key (see "future
extensions").

### No cross-section candid lookup

Earlier drafts considered `<alias> = "<other-canister-name>"` and pulling
the candid path from `[canisters.<other>].candid`. We rejected this
because:

- It introduces action-at-a-distance: editing one canister's `candid` field
  silently changes another canister's build behaviour.
- It conflates "the canister I'm building" with "the canister whose
  interface I'm consuming" — those can diverge during migrations.
- It does not generalise to external canisters that aren't declared in
  `[canisters]` at all.

The candid path is always written explicitly. Two canisters that share an
interface file just reference the same path string — duplication of a path
is not duplication of meaning.

### No deployer-convention configuration

The `PUBLIC_CANISTER_ID:` prefix is hardcoded for v1. We deliberately do
not expose `[canister-imports] env-prefix = "..."` or similar. If a
project needs a different convention (different deployer, custom keys),
it falls back to `[moc].args` until v2 introduces an explicit-env form.

### No auto-generation of `.did` files

If `[canisters.<target>].candid` is unset and the project has never been
built, no canonical `.did` exists at any user-visible path. Users either:

- run `mops build <target>` once and copy `.mops/.build/<target>.did` to a
  stable location, then commit it and reference it from `canister-imports`,
  or
- author the `.did` by hand.

mops does not write to user-visible paths as a side effect of
`canister-imports`. Auto-generation is a separate, larger discussion.

## Future extensions (not in v1)

These slot into the same parent section without breaking v1 syntax.

### Compile-time pinning (`canister-imports.id`)

```toml
[canisters.test.canister-imports.id.nns]
principal = "rrkah-fqaaa-aaaaa-aaaaq-cai"
candid = "did/nns.did"
```

Emits `--actor-id-alias nns rrkah-fqaaa-aaaaa-aaaaq-cai did/nns.did`.
Always a table (principal + candid are both required). No string
shorthand applies.

### Explicit env-var key

For deployers that don't use `PUBLIC_CANISTER_ID:` or for cases where
alias and canister name diverge:

```toml
[canisters.test.canister-imports.env.greet]
key = "PUBLIC_CANISTER_ID:greeter"
candid = "did/greet.did"
```

The string shorthand and the table form coexist in the same section,
mirroring the existing `[canisters]` pattern in `mops.toml`
(`Record<string, string | CanisterConfig>`).

## Documentation surface

When implemented, this feature touches:

- `docs/docs/09-mops.toml.md` — new `canister-imports` reference section
  with the example above.
- `cli/CHANGELOG.md` — entry under `## Next`.
- `.agents/skills/mops-cli/SKILL.md` — short note on cross-canister
  imports for agents authoring `mops.toml`.

## Open questions

1. **Strict moc version error vs. warning.** Currently specced as a hard
   error when moc < 1.5 and `canister-imports.env` is non-empty. Worth
   double-checking once the feature is implemented in case some workflows
   want to soft-degrade.
2. **`icp.yaml` cross-check.** Optional polish: when `icp.yaml` is present
   and a binding's defaulted env-var key references an alias that does not
   appear as a canister name in `icp.yaml`, emit a build-time warning. Not
   required for v1; prevents silent runtime failures.
3. **Snapshot scope for tests.** Suggested fixture:
   `cli/tests/build/canister-imports/` covering the happy path plus one
   error case (missing candid file). Following the project's snapshot
   strategy: full CLI output snapshot for the happy path, targeted
   `toMatch` for the error case.
