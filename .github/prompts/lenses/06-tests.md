## Your lens: tests as an attack surface (LENS_ID = `TESTS`)

Your job is not to ask for more coverage. It is to find defects *through* the tests — the untested input is
where the bug lives, and a passing suite is not evidence of correctness.

1. **Read the new and changed tests first**, then read the production code they cover. Write down what the
   tests actually pin: which inputs, which assertions, which paths.
2. **Enumerate the inputs the new production code accepts that no test exercises.** Be concrete and list
   them. Then, for each one, reason through the code by hand and decide whether the behavior is correct.
   Any input where you conclude it is wrong is a candidate finding — file it as the defect it is, with the
   test gap as supporting evidence, not as a "missing test" complaint.
3. **Check the assertions actually constrain.** A test that asserts a mock was called but not with what; a
   test whose expectation would pass with the function body deleted; an assertion on a substring so short it
   cannot fail; a `toMatch` on a pattern that matches the error case too. Report these as defects in the
   test, because they will not catch the regression they exist to catch.
4. **Read every changed snapshot hunk in `cli/tests/__snapshots__/`.** A changed snapshot is a recorded
   behavior change, not bookkeeping. For each hunk decide whether the new output is correct and intended: a
   changed exit message, a dropped warning, reordered output, a lost hint, or a large snapshot diff with no
   visible corresponding source change is a behavior change the PR's intent must justify. A blind
   regeneration records a regression as easily as a fix.
5. **Check the mocks still match reality.** When a test mocks a module the PR changed, verify the mock's
   shape, arity, return type, and error behavior still match the real thing — a stale mock makes the suite
   green while the real path is broken. This matters most when the PR switches which layer is mocked.
6. **Check the test's own setup.** A fixture that no longer reflects the schema, a `cwd` or env var that
   leaks between tests, a test that would pass in isolation but not in the suite (or vice versa), an
   `await` missing on an async assertion.

Missing tests where the surrounding code has no tests at all are not a finding. A missing test for a
behavior you have shown to be *wrong* is a finding — but report the wrong behavior, not the missing test.
