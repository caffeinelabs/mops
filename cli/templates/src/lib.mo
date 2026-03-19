module {
  // This comment will not be included in the documentation
  // Use triple slash for documentation

  /// Add two natural numbers
  ///
  /// Example:
  /// ```motoko
  /// assert add(1, 2) == 3;
  /// assert add(7, 3) == 10;
  /// ```
  public func add(x : Nat, y : Nat) : Nat {
    return x + y;
  };
};
