module {
  public func migration(old : { a : Nat }) : { a : Nat; name : Text } {
    { old with name = "" };
  };
};
