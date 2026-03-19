import Result "mo:base/Result";
import { test } "mo:test";

import { validateLicense } "../backend/main/utils/validateLicense";

test(
  "check valid licenses",
  func() {
    assert Result.isOk(validateLicense("Apache-2.0"));
    assert Result.isOk(validateLicense("Zend-2.0"));
    assert Result.isOk(validateLicense("Ruby"));
    assert Result.isOk(validateLicense("GPL-1.0-only"));
    assert Result.isOk(validateLicense("CC-BY-NC-ND-2.5"));
  },
);

test(
  "lowercased valid licenses should return #err",
  func() {
    assert Result.isErr(validateLicense("apache-2.0"));
    assert Result.isErr(validateLicense("zend-2.0"));
    assert Result.isErr(validateLicense("ruby"));
    assert Result.isErr(validateLicense("gpl-1.0-only"));
    assert Result.isErr(validateLicense("cc-by-nc-nd-2.5"));
  },
);

test(
  "valid licenses with spaces should return #err",
  func() {
    assert Result.isErr(validateLicense("  Apache-2.0"));
    assert Result.isErr(validateLicense(" Zend-2.0"));
    assert Result.isErr(validateLicense("Ruby "));
    assert Result.isErr(validateLicense(" GPL-1.0-only "));
    assert Result.isErr(validateLicense(" CC-BY-NC-ND-2.5 "));
  },
);

test(
  "wrong license ids",
  func() {
    assert Result.isErr(validateLicense("Apache 2.0"));
    assert Result.isErr(validateLicense("MIT License"));
    assert Result.isErr(validateLicense("custom sda"));
    assert Result.isErr(validateLicense("Creative Commons"));
  },
);
