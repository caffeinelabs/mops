import State "../types/State";

module {
  public func migration(old : State.V2) : State.V3 {
    { old with email = "" };
  };
};
