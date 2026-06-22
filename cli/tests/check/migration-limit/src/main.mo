import Prim "mo:prim";

actor {
  let a : Nat;
  let b : Text;
  let c : Bool;

  public func check() : async () {
    Prim.debugPrint(debug_show { a; b; c });
  };
};
