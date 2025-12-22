module A {
  /// @deprecated M0235
  public let foo = 5;
  /// @deprecated M0235
  public func f(x : Nat) : Nat { x };
};

module M {
  public func main() {
    ignore A.foo; // Deprecated field
    ignore A.f(5); // Deprecated function
  };
};
