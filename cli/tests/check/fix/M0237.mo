// M0237: Redundant explicit implicit argument
// Some arguments can be inferred and don't need to be specified
persistent actor {
  public func testM0237() : async () {
    let _x : ?Text = null;
  };
};
