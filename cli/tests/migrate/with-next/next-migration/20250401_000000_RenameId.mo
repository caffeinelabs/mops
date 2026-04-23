import State "../types/State";

module {
  public func migration(old : State.V3) : State.V4 {
    { id = old.a; name = old.name; email = old.email };
  };
};
