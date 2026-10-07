module {
  public func identity<T>(x : T) : T = x;

  public func one() : Nat = identity<Nat>(1);
};
