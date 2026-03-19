import TrieMap "mo:base/TrieMap";
import Principal "mo:base/Principal";
import Char "mo:base/Char";
import Buffer "mo:base/Buffer";
import Result "mo:base/Result";
import Iter "mo:base/Iter";
import Debug "mo:base/Debug";
import Nat "mo:base/Nat";
import Text "mo:base/Text";

import Set "mo:map/Set";

import Types "./types";
import { isLetter; isLowerCaseLetter } "./utils/is-letter";

module {
  public type Stable = ?{
    #v2 : {
      users : [(Principal, Types.User)];
      names : [Text];
    };
  };

  public class Users() {
    var _users = TrieMap.TrieMap<Principal, Types.User>(Principal.equal, Principal.hash);
    var _names = Set.new<Text>();

    public func toStable() : Stable {
      ?#v2({
        users = Iter.toArray(_users.entries());
        names = Set.toArray(_names);
      });
    };

    public func loadStable(stab : Stable) {
      switch (stab) {
        case (?#v2(data)) {
          _users := TrieMap.fromEntries<Principal, Types.User>(data.users.vals(), Principal.equal, Principal.hash);
          _names := Set.fromIter(data.names.vals(), Set.thash);
        };
        case (null) {};
      };
    };

    public func getUser(userId : Principal) : Types.User {
      let ?user = _users.get(userId) else Debug.trap("User not found");
      user;
    };

    public func getUserOpt(userId : Principal) : ?Types.User {
      _users.get(userId);
    };

    public func ensureUser(userId : Principal) {
      if (_users.get(userId) == null) {
        _users.put(
          userId,
          {
            id = userId;
            name = "";
            displayName = "";
            site = "";
            email = "";
            github = "";
            twitter = "";
            emailVerified = false;
            twitterVerified = false;
            githubVerified = false;
          },
        );
      };
    };

    public func setUserProp(userId : Principal, prop : Text, value : Text) : Result.Result<(), Text> {
      ensureUser(userId);
      switch (prop) {
        case ("name") {
          setName(userId, value);
        };
        case ("site") setSite(userId, value);
        case ("email") setEmail(userId, value);
        case ("github") setGithub(userId, value);
        case ("twitter") setTwitter(userId, value);
        case (_) #err("unknown property");
      };
    };

    public func setName(userId : Principal, name : Text) : Result.Result<(), Text> {
      let valid = _validateName(name);
      if (Result.isErr(valid)) {
        return valid;
      };
      if (Set.has(_names, Set.thash, name)) {
        return #err("Name already taken");
      };
      if (name == "mops") {
        return #err("'mops' name is reserved");
      };
      if (name == "dfinity" and userId != Principal.fromText("uajwy-bzusi-36jtj-ajvmc-nep3q-b7zmb-wbdua-smdjo-j77n2-p7ciw-tae")) {
        return #err("'dfinity' name is reserved");
      };

      let ?user = _users.get(userId) else return #err("User not found");

      if (user.name != "") {
        Set.delete(_names, Set.thash, user.name);
      };

      _users.put(
        userId,
        {
          user with
          name;
        },
      );

      Set.add(_names, Set.thash, name);

      #ok;
    };

    public func setSite(userId : Principal, site : Text) : Result.Result<(), Text> {
      let valid = _validateValue(site, 100, ['-', '_', '.', ':', '/', '?', '=', '&', '%', '#', '+', '@']);
      if (Result.isErr(valid)) {
        return valid;
      };
      if (not Text.startsWith(site, #text("https://")) and not Text.startsWith(site, #text("http://"))) {
        return #err("invalid value: site must start with 'https://' or 'http://'");
      };

      let ?user = _users.get(userId) else return #err("User not found");
      _users.put(
        userId,
        {
          user with
          site;
        },
      );

      #ok;
    };

    public func setEmail(userId : Principal, email : Text) : Result.Result<(), Text> {
      let valid = _validateValue(email, 50, ['-', '_', '.', '@']);
      if (Result.isErr(valid)) {
        return valid;
      };

      let ?user = _users.get(userId) else return #err("User not found");
      _users.put(
        userId,
        {
          user with
          email;
        },
      );

      #ok;
    };

    public func setGithub(userId : Principal, github : Text) : Result.Result<(), Text> {
      let valid = _validateValue(github, 30, ['-', '_', '.']);
      if (Result.isErr(valid)) {
        return valid;
      };

      let ?user = _users.get(userId) else return #err("User not found");
      _users.put(
        userId,
        {
          user with
          github;
        },
      );

      #ok;
    };

    public func setTwitter(userId : Principal, twitter : Text) : Result.Result<(), Text> {
      let valid = _validateValue(twitter, 30, ['-', '_', '.']);
      if (Result.isErr(valid)) {
        return valid;
      };

      let ?user = _users.get(userId) else return #err("User not found");
      _users.put(
        userId,
        {
          user with
          twitter;
        },
      );

      #ok;
    };

    func _validateName(value : Text) : Result.Result<(), Text> {
      if (value.size() > 30) {
        return #err("invalid value: max length is 30 chars");
      };

      var prevChar = '-';
      for (char in value.chars()) {
        if (not isLowerCaseLetter(char) and not Char.isDigit(char) and char != '-') {
          return #err("invalid value: unexpected char '" # Char.toText(char) # "' in '" # value # "'");
        };
        // deny -alice a--lice
        if (prevChar == '-' and char == '-') {
          return #err("invalid value: unexpected char '" # Char.toText(char) # "' in '" # value # "'");
        };
        prevChar := char;
      };
      // deny alice-
      if (prevChar == '-') {
        return #err("invalid value: name cannot end with '-' in '" # value # "'");
      };

      #ok;
    };

    func _validateValue(value : Text, max : Nat, allowedChars : [Char]) : Result.Result<(), Text> {
      let allowedCharsBuf = Buffer.fromArray<Char>(allowedChars);

      if (value.size() > max) {
        return #err("invalid value: max length is " # Nat.toText(max) # " chars");
      };

      for (char in value.chars()) {
        if (not isLetter(char) and not Char.isDigit(char) and not Buffer.contains(allowedCharsBuf, char, Char.equal)) {
          return #err("invalid value: unexpected char '" # Char.toText(char) # "' in '" # value # "'");
        };
      };

      #ok;
    };
  };
};
