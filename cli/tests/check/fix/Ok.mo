// File with M0237 redundant implicit argument that can be auto-fixed
persistent actor {
  public func example() : async () {
    let _x : ?Text = null;
    ();
  };
};
