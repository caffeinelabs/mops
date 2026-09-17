persistent actor {
  var counter : Nat = 0;

  public func inc() : async Nat {
    counter += 1;
    counter;
  };
};
