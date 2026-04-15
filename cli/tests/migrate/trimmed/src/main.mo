import Prim "mo:prim";

actor {
  let a : Nat;
  let b : Text;

  public func check() : async () {
    Prim.debugPrint(debug_show { a; b });
  };
};
