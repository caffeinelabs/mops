---
slug: /cli/mops-test
sidebar_label: mops test
---

# `mops test`

Mops can run Motoko unit tests
```
mops test
```

Put your tests in `test/*.test.mo` files.

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

Default `verbose` if there is only one file to test and `files` otherwise.

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


You can also specify `wasi` mode for a specific test file by adding the line below as the first line in the test file
```
// @testmode wasi
```

### `--replica`

Which replica to use to run actor tests.

Default `pocket-ic` if `pocket-ic` is specified in `mops.toml` in `[toolchain]` section, otherwise `dfx`.

Possible values:
- `dfx` - use `dfx` local replica
- `pocket-ic` - use [PocketIC](https://pypi.org/project/pocket-ic/) light replica via [pic.js](https://www.npmjs.com/package/@hadronous/pic) wrapper

:::info
If you run `mops test --replica pocket-ic` AND `pocket-ic` is not specified in `mops.toml` in `[toolchain]` section, Mops will use pocket-ic replica that comes with dfx (`dfx start --pocketic`).
:::

### `--verbose`

Show replica logs



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

Make sure your actor doesn't have a name `actor {`.

Make sure your actor has `runTests` method.

See example [here](https://github.com/caffeinelabs/mops/blob/main/test/storage-actor.test.mo).

Under the hood, Mops will:
- Start a local replica on port `4945`
- Compile test files and deploy them
- Call `runTests` method of the deployed canister