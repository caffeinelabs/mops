// mops message format v1
// mops:1:start
// mops:1:end
// mops:1:skip
import chalk from "chalk";

type Strategy = "store" | "print";
type TestStatus = "pass" | "fail" | "skip";
type MessageType = "pass" | "fail" | "skip" | "suite" | "stdout";

export class MMF1 {
  file: string;
  stack: string[] = [];
  currSuite: string = "";
  failed = 0;
  passed = 0;
  skipped = 0;
  strategy: Strategy;
  output: {
    type: MessageType;
    message: string;
  }[] = [];
  nestingSymbol = " › ";
  // or <file>
  // or <file> › <test>
  // or <file> › <suite> › <test>
  // or <file> › <suite> › <test> › <nested-test>...
  passedNamesFlat: string[] = [];

  constructor(strategy: Strategy, file: string) {
    this.strategy = strategy;
    this.file = file;
  }

  _log(type: MessageType, ...args: string[]) {
    if (this.strategy === "store") {
      this.output.push({
        type,
        message: args.join(" "),
      });
    } else if (this.strategy === "print") {
      console.log(...args);
    }
  }

  flush(messageType?: MessageType) {
    for (let out of this.output) {
      if (!messageType || out.type === messageType) {
        console.log(out.message);
      }
    }
    this.output = [];
  }

  getErrorMessages() {
    return this.output
      .filter((out) => out.type === "fail")
      .map((out) => out.message);
  }

  parseLine(line: string) {
    if (line.startsWith("mops:1:start ")) {
      this._testStart(line.split("mops:1:start ")[1] || "");
    } else if (line.startsWith("mops:1:end ")) {
      this._testEnd(line.split("mops:1:end ")[1] || "");
    } else if (line.startsWith("mops:1:skip ")) {
      this._testSkip(line.split("mops:1:skip ")[1] || "");
    } else if (line.startsWith("mops:")) {
      // ignore unknown mops messages
    } else {
      this._log(
        "stdout",
        " ".repeat(this.stack.length * 2),
        chalk.gray("stdout"),
        line,
      );
    }
  }

  _testStart(name: string) {
    let suite = this.stack[this.stack.length - 1];
    if (suite) {
      if (this.currSuite !== suite) {
        this.currSuite = suite;
        this._log(
          "suite",
          " ".repeat((this.stack.length - 1) * 2),
          chalk.gray("•") + "",
          suite,
        );
      }
    }
    this.stack.push(name);
  }

  _testEnd(name: string) {
    let last = this.stack.pop();
    if (name !== last) {
      console.error(`Expected test name "${last}" but got "${name}"`);
      console.error(`Stack: ${this.stack.join(" › ")}`);
      console.error(`File: ${this.file}`);
      throw "mmf1._testEnd: start and end test mismatch";
    }
    this._status(name, "pass");
  }

  _testSkip(name: string) {
    this._status(name, "skip");
  }

  _status(name: string, status: TestStatus) {
    if (status === "pass") {
      // do not print suite at the end
      if (name === this.currSuite) {
        return;
      }
      this.passed++;
      this._log(
        status,
        " ".repeat(this.stack.length * 2),
        chalk.green("✓"),
        name,
      );
      this.passedNamesFlat.push(
        [this.file, ...this.stack, name].join(this.nestingSymbol),
      );
    } else if (status === "fail") {
      this.failed++;
      this._log(
        status,
        " ".repeat(this.stack.length * 2),
        chalk.red("✖"),
        name,
      );
    } else if (status === "skip") {
      this.skipped++;
      this._log(
        status,
        " ".repeat(this.stack.length * 2),
        chalk.yellow("−"),
        name,
      );
    }
  }

  fail(stderr: string) {
    let name = this.stack.pop() || "";
    this._status(name, "fail");
    this._log(
      "fail",
      " ".repeat(this.stack.length * 2),
      chalk.red("FAIL"),
      stderr,
    );
  }

  pass() {
    let name = this.stack.pop();
    if (name) {
      this._status(name, "pass");
    }
    this._log("pass", " ".repeat(this.stack.length * 2), chalk.green("PASS"));
  }
}
