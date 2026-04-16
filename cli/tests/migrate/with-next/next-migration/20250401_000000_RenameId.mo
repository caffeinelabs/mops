module {
  public func migration(old : { a : Nat; name : Text; email : Text }) : {
    id : Nat;
    name : Text;
    email : Text;
  } {
    { id = old.a; name = old.name; email = old.email };
  };
};
