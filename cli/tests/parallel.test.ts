import { describe, expect, test } from "@jest/globals";
import { setImmediate } from "node:timers/promises";
import { parallel } from "../parallel";

// Deferred tasks make the pool's scheduling observable without wall-clock
// timing: nothing completes until the test releases it.
function deferredTasks() {
  let inFlight = 0;
  let peak = 0;
  let resolvers: Array<() => void> = [];
  let fn = async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise<void>((resolve) => resolvers.push(resolve));
    inFlight--;
  };
  let releaseOne = async () => {
    resolvers.shift()?.();
    // let the pool observe the completion and refill
    await setImmediate();
  };
  return {
    fn,
    releaseOne,
    peak: () => peak,
    inFlight: () => inFlight,
  };
}

describe("parallel", () => {
  test("never runs more than the limit at once", async () => {
    let tasks = deferredTasks();
    let items = Array.from({ length: 10 }, (_, i) => i);
    let done = parallel(3, items, tasks.fn);

    await setImmediate();
    expect(tasks.inFlight()).toBe(3);

    for (let i = 0; i < items.length; i++) {
      await tasks.releaseOne();
    }
    await done;
    expect(tasks.peak()).toBe(3);
    expect(tasks.inFlight()).toBe(0);
  });

  test("processes every item exactly once", async () => {
    let seen: number[] = [];
    let items = Array.from({ length: 25 }, (_, i) => i);
    await parallel(4, items, async (item) => {
      seen.push(item);
    });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  test("a limit wider than the items just runs them all", async () => {
    let tasks = deferredTasks();
    let done = parallel(10, [1, 2], tasks.fn);
    await setImmediate();
    expect(tasks.inFlight()).toBe(2);
    await tasks.releaseOne();
    await tasks.releaseOne();
    await done;
    expect(tasks.peak()).toBe(2);
  });

  test("empty input resolves", async () => {
    await expect(parallel(3, [], async () => {})).resolves.toBeUndefined();
  });

  test("rejects with the first error and schedules nothing further", async () => {
    let started: number[] = [];
    let boom = new Error("boom");
    await expect(
      parallel(1, [1, 2, 3], async (item) => {
        started.push(item);
        if (item === 2) {
          throw boom;
        }
      }),
    ).rejects.toBe(boom);
    expect(started).toEqual([1, 2]);
  });

  test("a failure waits for in-flight tasks to settle before rejecting", async () => {
    let resolvers: Array<() => void> = [];
    let boom = new Error("boom");
    let settled = false;
    let done = parallel(3, [1, 2, 3], async (item) => {
      if (item === 2) {
        throw boom;
      }
      await new Promise<void>((resolve) => resolvers.push(resolve));
    });
    done.catch(() => {
      settled = true;
    });

    // items 1 and 3 are still running after item 2 failed
    await setImmediate();
    expect(settled).toBe(false);

    resolvers.shift()?.();
    await setImmediate();
    expect(settled).toBe(false);

    resolvers.shift()?.();
    await setImmediate();
    expect(settled).toBe(true);
    await expect(done).rejects.toBe(boom);
  });

  test("the first error wins when several tasks fail", async () => {
    let first = new Error("first");
    await expect(
      parallel(2, [1, 2], async (item) => {
        throw item === 1 ? first : new Error("second");
      }),
    ).rejects.toBe(first);
  });
});
