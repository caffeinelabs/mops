import Result "mo:base/Result";
import Array "mo:base/Array";
import Debug "mo:base/Debug";
import Order "mo:base/Order";
import Principal "mo:base/Principal";

import { test } "mo:test";
import Fuzz "mo:fuzz";

import Types "../backend/main/types";
import Users "../backend/main/Users";

let fuzz = Fuzz.Fuzz();
let users = Users.Users();
let aliceId = fuzz.principal.random();

func ensureNewUser() : Principal {
  let userId = fuzz.principal.random();
  users.ensureUser(userId);
  userId;
};

test(
  "get unkown user",
  func() {
    assert users.getUserOpt(fuzz.principal.random()) == null;
    assert users.getUserOpt(fuzz.principal.random()) == null;
  },
);

test(
  "register Alice",
  func() {
    users.ensureUser(aliceId);
  },
);

test(
  "setName before user created",
  func() {
    let userId = fuzz.principal.random();
    assert Result.isErr(users.setName(userId, "alice"));
  },
);

test(
  "Alice setName and check result",
  func() {
    assert Result.isOk(users.setName(aliceId, "alice"));
    assert users.getUser(aliceId).name == "alice";
    assert users.getUser(aliceId).github == "";
    assert users.getUser(aliceId).githubVerified == false;
  },
);

test(
  "Alice setName second time should return error",
  func() {
    assert Result.isErr(users.setName(aliceId, "alice"));
  },
);

test(
  "try to set existing name",
  func() {
    assert Result.isErr(users.setName(ensureNewUser(), "alice"));
    assert Result.isOk(users.setName(ensureNewUser(), "bob"));
    assert Result.isErr(users.setName(ensureNewUser(), "bob"));
  },
);

test(
  "change name and check if prev name is available",
  func() {
    let a = ensureNewUser();
    let b = ensureNewUser();

    assert Result.isOk(users.setName(a, "foo"));
    assert Result.isErr(users.setName(b, "foo"));

    assert Result.isOk(users.setName(a, "bar"));
    assert Result.isOk(users.setName(b, "foo"));

    assert users.getUser(a).name == "bar";
    assert users.getUser(b).name == "foo";
  },
);

test(
  "Alice setGithub and check result",
  func() {
    assert Result.isOk(users.setGithub(aliceId, "Alice.A"));
    assert users.getUser(aliceId).name == "alice";
    assert users.getUser(aliceId).github == "Alice.A";
    assert users.getUser(aliceId).githubVerified == false;
  },
);

test(
  "setName validation",
  func() {
    assert Result.isOk(users.setName(ensureNewUser(), "alice1"));
    assert Result.isOk(users.setName(ensureNewUser(), "bob2"));
    assert Result.isOk(users.setName(ensureNewUser(), "bob-b2"));
    assert Result.isOk(users.setName(ensureNewUser(), "alice-a"));

    assert Result.isErr(users.setName(ensureNewUser(), "Alice"));
    assert Result.isErr(users.setName(ensureNewUser(), "-alice"));
    assert Result.isErr(users.setName(ensureNewUser(), "alice-"));
    assert Result.isErr(users.setName(ensureNewUser(), "alice_"));
    assert Result.isErr(users.setName(ensureNewUser(), "alice_a"));
    assert Result.isErr(users.setName(ensureNewUser(), "alice a"));
    assert Result.isErr(users.setName(ensureNewUser(), "alice.a"));
    assert Result.isErr(users.setName(ensureNewUser(), "alice_a"));
    assert Result.isErr(users.setName(ensureNewUser(), "alicealicealicealicealicealicealice"));
  },
);

test(
  "setSite validation",
  func() {
    assert Result.isOk(users.setSite(ensureNewUser(), "http://dfinity.org"));
    assert Result.isOk(users.setSite(ensureNewUser(), "https://dfinity.org"));
    assert Result.isOk(users.setSite(ensureNewUser(), "https://mops.one"));
    assert Result.isOk(users.setSite(ensureNewUser(), "https://j4mwm-bqaaa-aaaam-qajbq-cai.icp0.io"));
    assert Result.isOk(users.setSite(ensureNewUser(), "https://j4mwm-bqaaa-aaaam-qajbq-cai.icp0.io/base/docs/Array"));

    assert Result.isErr(users.setSite(ensureNewUser(), "htt://mops.one"));
    assert Result.isErr(users.setSite(ensureNewUser(), "dfinity.org"));
    assert Result.isErr(users.setSite(ensureNewUser(), "sadasdasd"));
    assert Result.isErr(users.setSite(ensureNewUser(), "http://dfinity.orgdfinity.orgdfinity.orgdfinity.orgdfinity.orgdfinity.orgdfinity.orgdfinity.orgdfinity.orgdfinity.orgdfinity.orgdfinity.org"));
  },
);

test(
  "setEmail validation",
  func() {
    assert Result.isOk(users.setEmail(ensureNewUser(), "foo"));
    assert Result.isOk(users.setEmail(ensureNewUser(), "bar"));
    assert Result.isOk(users.setEmail(ensureNewUser(), "FooBar"));
    assert Result.isOk(users.setEmail(ensureNewUser(), "Bar"));
    assert Result.isOk(users.setEmail(ensureNewUser(), "Foo_Bar"));
    assert Result.isOk(users.setEmail(ensureNewUser(), "-Foo_Bar"));
    assert Result.isOk(users.setEmail(ensureNewUser(), "Foo.Bar"));
    assert Result.isOk(users.setEmail(ensureNewUser(), "foo@bar"));
    assert Result.isOk(users.setEmail(ensureNewUser(), "foo@bar.com"));
    assert Result.isOk(users.setEmail(ensureNewUser(), "foobarfoobarfoobarfoobarfoobarfoobar"));

    assert Result.isErr(users.setEmail(ensureNewUser(), "foo$bar"));
    assert Result.isErr(users.setEmail(ensureNewUser(), "foo/bar"));
    assert Result.isErr(users.setEmail(ensureNewUser(), "foobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobar"));
  },
);

test(
  "setGithub validation",
  func() {
    assert Result.isOk(users.setGithub(ensureNewUser(), "foo"));
    assert Result.isOk(users.setGithub(ensureNewUser(), "bar"));
    assert Result.isOk(users.setGithub(ensureNewUser(), "FooBar"));
    assert Result.isOk(users.setGithub(ensureNewUser(), "Bar"));
    assert Result.isOk(users.setGithub(ensureNewUser(), "Foo_Bar"));
    assert Result.isOk(users.setGithub(ensureNewUser(), "-Foo_Bar"));
    assert Result.isOk(users.setGithub(ensureNewUser(), "Foo.Bar"));

    assert Result.isErr(users.setGithub(ensureNewUser(), "foo@bar"));
    assert Result.isErr(users.setGithub(ensureNewUser(), "foo$bar"));
    assert Result.isErr(users.setGithub(ensureNewUser(), "foo/bar"));
    assert Result.isErr(users.setGithub(ensureNewUser(), "foobarfoobarfoobarfoobarfoobarfoobar"));
  },
);

test(
  "setTwitter validation",
  func() {
    assert Result.isOk(users.setTwitter(ensureNewUser(), "foo"));
    assert Result.isOk(users.setTwitter(ensureNewUser(), "bar"));
    assert Result.isOk(users.setTwitter(ensureNewUser(), "FooBar"));
    assert Result.isOk(users.setTwitter(ensureNewUser(), "Bar"));
    assert Result.isOk(users.setTwitter(ensureNewUser(), "Foo_Bar"));
    assert Result.isOk(users.setTwitter(ensureNewUser(), "-Foo_Bar"));
    assert Result.isOk(users.setTwitter(ensureNewUser(), "Foo.Bar"));

    assert Result.isErr(users.setTwitter(ensureNewUser(), "foo@bar"));
    assert Result.isErr(users.setTwitter(ensureNewUser(), "foo$bar"));
    assert Result.isErr(users.setTwitter(ensureNewUser(), "foo/bar"));
    assert Result.isErr(users.setTwitter(ensureNewUser(), "foobarfoobarfoobarfoobarfoobarfoobar"));
  },
);

test(
  "stable",
  func() {
    let users2 = Users.Users();
    users2.loadStable(users.toStable());

    test(
      "stable users",
      func() {
        let stableUsers1 = switch (users.toStable()) {
          case (?#v2({ users })) { users };
          case (null) { Debug.trap("") };
        };
        let stableUsers2 = switch (users2.toStable()) {
          case (?#v2({ users })) { users };
          case (null) { Debug.trap("") };
        };
        func comp(a : (Principal, Types.User), b : (Principal, Types.User)) : Order.Order {
          Principal.compare(a.0, b.0);
        };
        assert Array.sort(stableUsers1, comp) == Array.sort(stableUsers2, comp);
      },
    );

    test(
      "stable names",
      func() {
        let stableNames1 = switch (users.toStable()) {
          case (?#v2({ names })) { names };
          case (null) { Debug.trap("") };
        };
        let stableNames2 = switch (users2.toStable()) {
          case (?#v2({ names })) { names };
          case (null) { Debug.trap("") };
        };
        assert stableNames1 == stableNames2;
        assert stableNames2 != [];
      },
    );
  },
);
