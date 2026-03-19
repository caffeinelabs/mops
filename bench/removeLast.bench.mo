import Nat "mo:base/Nat";
import Iter "mo:base/Iter";
import Buffer "mo:base/Buffer";
import Vector "mo:vector/Class";
import Bench "mo:bench";

module {
  public func init() : Bench.Bench {
    let bench = Bench.Bench();
    let initN = 100_000;
    let delN = 70_000;

    bench.name("Remove items using `removeLast`");
    bench.description("Vector and buffer are initialized with 100k items and then 70k items are removed one-by-one.");

    bench.rows(["Vector", "Buffer"]);
    bench.cols(["remove 70k"]);

    // init Vector
    let vec = Vector.Vector<Nat>();
    for (i in Iter.range(1, initN)) {
      vec.add(i);
    };
    // bench.heap.add(vec);

    // init Buffer
    let buf = Buffer.Buffer<Nat>(0);
    for (i in Iter.range(1, initN)) {
      buf.add(i);
    };
    // bench.heap.add(buf);

    bench.runner(
      func(row, col) {
        // Vector
        if (row == "Vector") {
          for (i in Iter.range(1, delN)) {
            ignore vec.removeLast();
          };
        }
        // Buffer
        else if (row == "Buffer") {
          for (i in Iter.range(1, delN)) {
            ignore buf.removeLast();
          };
        };
      }
    );

    bench;
  };
};
