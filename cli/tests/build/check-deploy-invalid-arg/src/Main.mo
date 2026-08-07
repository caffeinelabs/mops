persistent actor class Main(value : Nat8) {
  public query func getValue() : async Nat8 {
    value;
  };
};
