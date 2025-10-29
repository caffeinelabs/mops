// import Bar "canister:bar"

persistent actor {
  public func call() : async Text {
    // await Bar.call();
    "Bar";
  };
};
