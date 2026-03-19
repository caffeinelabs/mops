actor {
  public func test() : async () {
    func identity<T>(x : T) : T = x;
    let nat = identity<Nat>(1);
    ignore nat;
  };
};

thisshouldnotcompile;
