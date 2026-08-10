module {
  public func migration(old : { x : Nat; legacy : Nat }) : {
    id : Nat;
    name : Text;
  } {
    { id = old.legacy; name = "" };
  };
};
