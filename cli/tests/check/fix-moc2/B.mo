import Lib "Lib";

actor {
  public func b() : async Nat {
    Lib.identity<Nat>(2);
  };
};
