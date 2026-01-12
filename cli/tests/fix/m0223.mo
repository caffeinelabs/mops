module M {
  public func inferred<T>(x : T) : T = x;

  public func main() {
    let n1 = inferred<Nat>(1); // Redundant type instantiation
    ignore n1;
  };
};
