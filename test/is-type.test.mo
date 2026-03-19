// @testmode wasi

import Debug "mo:base/Debug";
import { test } "mo:test";

func to(x : Any) : Blob {
  to_candid (x);
};

// func isType<T>(value : Any) : Bool {
//   let candid = to_candid(value);
//   let from = from_candid(candid) : ?T;
//   switch (from) {
//     case (?x) true;
//     case (null) false;
//   };
// };

func isNat(candid : Blob) : Bool {
  let parsed = from_candid (candid) : ?Nat;
  parsed != null;
};

Debug.print(debug_show (isNat(to_candid (123))));
Debug.print(debug_show (isNat(to_candid ("123"))));

test(
  "suaaacc",
  func() {
    let _x = to(1);
    assert true;
  },
);
