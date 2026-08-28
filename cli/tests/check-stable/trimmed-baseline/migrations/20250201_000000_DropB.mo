module {
  public func migration(old : { a : Nat; b : Text; c : Bool }) : {
    a : Nat;
    c : Bool;
  } {
    { a = old.a; c = old.c };
  };
};
