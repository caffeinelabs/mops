module {
  type Empty = {};

  public func migration(_ : Empty) : { id : Nat; name : Text } {
    { id = 0; name = "" };
  };
};
