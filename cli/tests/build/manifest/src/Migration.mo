module {
  public func run(old : { name : Nat }) : { name : Text } {
    { name = debug_show (old.name) };
  };
};
