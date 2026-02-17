// M0223: Redundant type instantiation
// The type annotation is not needed when it can be inferred
persistent actor {
  public func testM0223() : async Nat {
    let x : Nat = 42;
  };
};
