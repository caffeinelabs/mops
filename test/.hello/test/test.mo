import Prim "mo:prim";

module {
  public func test(name : Text, fn : () -> ()) {
    Prim.debugPrint("mops:1:start " # name);
    fn();
    Prim.debugPrint("mops:1:end " # name);
  };

  public func suite(name : Text, fn : () -> ()) {
    test(name, fn);
  };

  public func skip(name : Text, fn : () -> ()) {
    Prim.debugPrint("mops:1:skip " # name);
  };
};
