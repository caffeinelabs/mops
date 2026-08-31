module {
  // Edited after deploy: was `OldActor = { x : Nat }` (legacy-conversion
  // shape). `{}` replays from an empty canister, which would wipe the
  // converted `x` if this were ever applied.
  public func migration(_ : {}) : { a : Nat; b : Text } {
    { a = 42; b = "nuclear" };
  };
};
