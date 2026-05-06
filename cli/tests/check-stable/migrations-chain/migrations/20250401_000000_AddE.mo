module {
  public func migration(old : { a : Nat; b : Text; c : Bool; d : Int }) : {
    a : Nat;
    b : Text;
    c : Bool;
    d : Int;
    e : Text;
  } {
    { old with e = "" };
  };
};
