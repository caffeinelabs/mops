import Lib "Lib";

actor {
  public func a() : async Nat {
    Lib.identity<Nat>(Lib.one());
  };
};
