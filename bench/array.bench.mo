import Iter "mo:base/Iter";
import Debug "mo:base/Debug";
import Nat "mo:base/Nat";
import Buffer "mo:base/Buffer";

import Bench "mo:bench";
import Fuzz "mo:fuzz";

module {
  public func init() : Bench.Bench {
    let fuzz = Fuzz.Fuzz();

    let bench = Bench.Bench();
    bench.name("Array");
    bench.description("arr arr");

    bench.rows(["Array"]);
    // bench.cols(["remove()", "add()", "remove()", "add()", "remove()"]);
    // bench.cols(["50k x1", "reset1", "50k x2", "reset2", "50k x4", "reset3", "100k x1", "reset4", "100k x2", "reset5", "100k x4", "reset6"]);
    bench.cols(["100k x1", "reset1", "100k x3", "reset2", "100k x4", "reset3"]);

    var array : [(Nat, Nat)] = [];
    let buf50k = Buffer.Buffer<(Nat, Nat)>(50_000);
    let buf100k = Buffer.Buffer<(Nat, Nat)>(100_000);

    // for (i in Iter.range(0, 50_000 - 1)) {
    //     let key = fuzz.nat.randomRange(1, 50_000 ** 3);
    //     buf50k.add((key, i));
    // };

    for (i in Iter.range(0, 100_000 - 1)) {
      let key = fuzz.nat.randomRange(1, 100_000 ** 3);
      buf100k.add((key, i));
    };

    bench.runner(
      func(row, col) = switch (row, col) {
        case ("Array", "50k x1") {
          array := Buffer.toArray(buf50k);
        };
        case ("Array", "50k x2") {
          array := Buffer.toArray(buf50k);
          array := Buffer.toArray(buf50k);
        };
        case ("Array", "50k x4") {
          var array : [(Nat, Nat)] = [];
          array := Buffer.toArray(buf50k);
          array := Buffer.toArray(buf50k);
          array := Buffer.toArray(buf50k);
          array := Buffer.toArray(buf50k);
        };
        case ("Array", "100k x1") {
          array := Buffer.toArray(buf100k);
        };
        case ("Array", "100k x2") {
          array := Buffer.toArray(buf100k);
          array := Buffer.toArray(buf100k);
        };
        case ("Array", "100k x3") {
          array := Buffer.toArray(buf100k);
          array := Buffer.toArray(buf100k);
        };
        case ("Array", "100k x4") {
          array := Buffer.toArray(buf100k);
          array := Buffer.toArray(buf100k);
          array := Buffer.toArray(buf100k);
          array := Buffer.toArray(buf100k);
        };
        case ("Array", "reset1") {
          array := [];
        };
        case ("Array", "reset2") {
          array := [];
        };
        case ("Array", "reset3") {
          array := [];
        };
        case ("Array", "reset4") {
          array := [];
        };
        case ("Array", "reset5") {
          array := [];
        };
        case ("Array", "reset6") {
          array := [];
        };
        case (_) {
          Debug.trap("Should not reach with row = " # debug_show row # " and col = " # debug_show col);
        };
      }
    );

    bench;
  };
};
