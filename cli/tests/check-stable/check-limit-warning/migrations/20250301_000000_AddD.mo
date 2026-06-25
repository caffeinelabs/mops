module {
  public func migration(old : { a : Nat; b : Text; c : Bool }) : {
    a : Nat;
    b : Text;
    c : Bool;
    d : Int;
  } {
    { old with d = 0 };
  };
};
