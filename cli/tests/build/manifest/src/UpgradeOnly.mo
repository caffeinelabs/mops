import Migration "Migration";

// Migration input requires pre-existing state, so this canister is only
// installable as an upgrade — never on a fresh canister.
(with migration = Migration.run)
persistent actor {
  var name : Text = "";

  public func set(value : Text) : async () {
    name := value;
  };
};
