import Nat "mo:base/Nat";
import Nat2 "mo:base@0.10.2/Nat";

assert Nat.toText(1) == "1";
assert Nat2.toText(1) == "1";
