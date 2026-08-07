module {
  public func migration(old : { id : Nat }) : { id : Nat; name : Text } {
    { id = old.id; name = "" };
  };
};
