import State "../types/State";

module {
  public func migration(old : State.V1) : State.V2 {
    { old with name = "" };
  };
};
