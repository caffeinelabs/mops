---
slug: /cli/mops-test
sidebar_label: mops test
---

# `mops test`

Mops can run Motoko unit tests
```
mops test
```

Put your tests in `*.test.mo` files inside a `test/` or `tests/` directory (nested subdirectories work too).

If a `test/lib.mo` (or `tests/lib.mo`) file exists, it is the **only** file run — use it as an entry point that imports your other tests.

Pass a filter to run a subset of files — `mops test nat` runs every `*nat*.mo` file under the test directory (the `.test.mo` suffix is not required for filtered files):
```
mops test nat
```

All tests run as quickly as possible thanks to parallel execution.

See [test package](https://mops.one/test) to help you write tests.

## Options

### `--reporter`, `-r`

Test reporter.

```
--reporter <reporter>
```

Available reporters:

- `verbose` - print each file/suite/test name and `Debug.print` output
- `files` - print only test files
- `compact` - pretty progress bar
- `silent` - print only errors

Default `verbose`.

:::note
Only `verbose` reporter prints `Debug.print` output.
:::

### `--watch`, `-w`

Re-run tests every time you change *.mo files.

```
--watch
```


### `--mode`

Test run mode

```
--mode <mode>
```

Available modes:

- `interpreter` - run tests via `moc -r` (default)
- `wasi` - compile test file to wasm and execute it with `wasmtime`. Useful, when you use `to_candid`/`from_candid`, or if you get stackoverflow errors.
- `replica` - deploy test files as canisters to a local [PocketIC](https://github.com/dfinity/pocketic) replica. See [Replica tests](#replica-tests).


You can also specify `wasi` or `replica` mode for a specific test file by adding one of these markers to the file (on a line of its own, with nothing else on the line):
```
// @testmode wasi
// @testmode replica
```

Test files that define an actor run in `replica` mode automatically.

### `--verbose`

Show replica logs

### `-- <moc flags>`

Pass extra flags directly to the Motoko compiler for this invocation. Appended after `[moc].args` from `mops.toml`.

```
mops test -- -Werror
```

### `--locked`

Require an up-to-date [`mops.lock`](../../10-mops.lock.md) and never write it — fails if the lockfile is missing or no longer matches `mops.toml` and the registry. Intended for CI, so that a job can run this command without a preceding `mops install`. See [`mops install --locked`](../1-deps/02-mops-install.md#--locked).

## Replica tests

Replica tests are useful if you need to test actor code which relies on the IC API(cycles, timers, canister upgrades, etc.).

To run replica tests, your test file should look like this:
```motoko
...

actor {
  public func runTests() : async () {
    // your tests here
  };
};
```

Example:
```motoko
import {test} "mo:test/async";
import MyCanister "../my-canister";

actor {
  // add cycles to deploy your canister
  ExperimentalCycles.add<system>(1_000_000_000_000);

  // deploy your canister
  let myCanister = await MyCanister.MyCanister();

  public func runTests() : async () {
    await test("test name", func() : async () {
      let res = await myCanister.myFunc();
      assert res == 123;
    });
  };
};
```

Make sure your actor has `runTests` method.

See example [here](https://github.com/caffeinelabs/mops/blob/main/test/storage-actor.test.mo).

Replica tests run on [PocketIC](https://github.com/dfinity/pocketic), which Mops downloads and manages itself — `dfx` is not involved and does not need to be installed. Pin a version with [`mops toolchain use pocket-ic 15.0.0`](../5-toolchain/03-mops-toolchain-use.md). There is no default: an unpinned project errors. See [supported versions](../5-toolchain/01-toolchain-overview.md#pocket-ic-versions).

Under the hood, Mops will:
- Start a PocketIC server on an ephemeral port
- Compile test files and deploy them
- Call `runTests` method of the deployed canister
