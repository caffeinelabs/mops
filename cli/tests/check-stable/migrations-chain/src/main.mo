import Prim "mo:prim";

actor {
  let a : Nat;
  let b : Text;
  let c : Bool;
  let d : Int;
  let e : Text;

  public func check() : async () {
    Prim.debugPrint(debug_show { a; b; c; d; e });
  };
};
