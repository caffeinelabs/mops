import Prim "mo:prim";

// `d` is produced by no migration in the chain: M0254 on the 3-step path,
// M0267 on the folded one. The fixture exists to keep it on the 3-step path.
actor {
  let a : Nat;
  let b : Text;
  let c : Bool;
  let d : Int;

  public func check() : async () {
    Prim.debugPrint(debug_show { a; b; c; d });
  };
};
