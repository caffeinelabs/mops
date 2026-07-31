import Prim "mo:prim";

actor {
  let a : Nat;
  let b : Text;
  let c : Bool;
  let d : Int;

  public func check() : async () {
    let broken : Nat = "not a Nat";
    Prim.debugPrint(debug_show { a; b; c; d; broken });
  };
};
