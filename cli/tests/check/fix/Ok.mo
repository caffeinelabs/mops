// Clean file — no fixable warnings
persistent actor {
  public func example() : async () {
    let _x : ?Text = null;
    ();
  };
};
