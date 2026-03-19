import { hello } "../src";
import { test; suite } "./test";

suite(
  "Hello",
  func() {
    test(
      "should say hello to the World",
      func() {
        assert hello("World") == "Hello, World!";
      },
    );

    test(
      "should say hello to Motoko",
      func() {
        assert hello("Motoko") == "Hello, Motoko!";
      },
    );
  },
);
