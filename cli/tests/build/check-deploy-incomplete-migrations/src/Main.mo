actor {
  let id : Nat;
  let name : Text;

  public query func getId() : async Nat {
    id;
  };

  public query func getName() : async Text {
    name;
  };
};
