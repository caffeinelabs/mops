import Prim "mo:prim";

actor {
  let a : Nat;
  let name : Text;
  let email : Text;

  public func check() : async () {
    Prim.debugPrint(debug_show { a; name; email });
  };
};
