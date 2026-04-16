import Prim "mo:prim";

actor {
  let id : Nat;
  let name : Text;
  let email : Text;

  public func check() : async () {
    Prim.debugPrint(debug_show { id; name; email });
  };
};
