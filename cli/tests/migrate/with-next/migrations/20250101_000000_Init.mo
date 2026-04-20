import State "../types/State";

module {
  public func migration(_ : State.V0) : State.V1 {
    { a = 0 };
  };
};
