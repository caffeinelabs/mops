module {
  public func migration(old : { a : Nat; name : Text }) : {
    a : Nat;
    name : Text;
    email : Text;
  } {
    { old with email = "" };
  };
};
