import Region "mo:base/Region";
import ExperimentalStableMemory "mo:base/ExperimentalStableMemory";
import Bench "mo:bench";
import Fuzz "mo:fuzz";

module {
  public func init() : Bench.Bench {
    let bench = Bench.Bench();
    let fuzz = Fuzz.Fuzz();
    let page = 1024 * 64;

    bench.name("Stable Memory and Region");
    bench.description("Grow Region and store blobs in it");

    bench.cols(["Region (fill 1/100)", "Region (fill 1/50)", "StableMemory"]);
    bench.rows(["10 pages", "100 pages", "256 pages"]);

    bench.runner(
      func(row, col) {
        // StableMemory
        if (col == "StableMemory") {
          if (row == "10 pages") {
            ignore ExperimentalStableMemory.grow(10);
          } else if (row == "100 pages") {
            ignore ExperimentalStableMemory.grow(100);
          } else if (row == "256 pages") {
            ignore ExperimentalStableMemory.grow(256);
          };
        }
        // Region (fill 1/50)
        else if (col == "Region (fill 1/50)") {
          if (row == "10 pages") {
            let region = Region.new();
            ignore Region.grow(region, 10);
            let value = fuzz.blob.randomBlob(page * 10 / 50);
            Region.storeBlob(region, 0, value);
          } else if (row == "100 pages") {
            let region = Region.new();
            ignore Region.grow(region, 100);
            let value = fuzz.blob.randomBlob(page * 100 / 50);
            Region.storeBlob(region, 0, value);
          } else if (row == "256 pages") {
            let region = Region.new();
            ignore Region.grow(region, 256);
            let value = fuzz.blob.randomBlob(page * 256 / 50);
            Region.storeBlob(region, 0, value);
          };
        }
        // Region (fill 1/100)
        else if (col == "Region (fill 1/100)") {
          if (row == "10 pages") {
            let region = Region.new();
            ignore Region.grow(region, 10);
            let value = fuzz.blob.randomBlob(page * 5 / 100);
            Region.storeBlob(region, 0, value);
          } else if (row == "100 pages") {
            let region = Region.new();
            ignore Region.grow(region, 100);
            let value = fuzz.blob.randomBlob(page * 100 / 100);
            Region.storeBlob(region, 0, value);
          } else if (row == "256 pages") {
            let region = Region.new();
            ignore Region.grow(region, 256);
            let value = fuzz.blob.randomBlob(page * 256 / 100);
            Region.storeBlob(region, 0, value);
          };
        };
      }
    );

    bench;
  };
};
