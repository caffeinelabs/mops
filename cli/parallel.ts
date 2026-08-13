export async function parallel<T>(
  threads: number,
  items: T[],
  fn: (item: T) => Promise<void>,
) {
  return new Promise<void>((resolve, reject) => {
    let busyThreads = 0;
    let failed = false;
    let firstError: unknown;
    items = items.slice();

    let loop = () => {
      if (failed || !items.length) {
        // Settles only once every started task has: callers retry on
        // rejection, and a task still running from the failed round would
        // race the retry's view of the cache and `.mops/`.
        if (busyThreads === 0) {
          failed ? reject(firstError) : resolve();
        }
        return;
      }
      if (busyThreads >= threads) {
        return;
      }
      busyThreads++;
      fn(items.shift() as T).then(
        () => {
          busyThreads--;
          loop();
        },
        (err) => {
          busyThreads--;
          if (!failed) {
            failed = true;
            firstError = err;
          }
          loop();
        },
      );
      loop();
    };
    loop();
  });
}
