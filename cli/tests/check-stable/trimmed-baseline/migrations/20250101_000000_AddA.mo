module {
  public func migration(old : { c : Bool; b : Text }) : {
    a : Nat;
    b : Text;
    c : Bool;
  } {
    { old with a = 42 };
  };
};
