module {
  public func migration(old : { a : Nat }) : { a : Nat; b : Text } {
    { old with b = "hello" };
  };
};
