actor {
  public func greet(name : Text) : async Text {
    "Hello, " # name # "!";
  };

  public type User = {
    name : Text;
    age : Nat;
  };
};
