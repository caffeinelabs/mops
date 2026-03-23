export async function parallel<T>(
  threads: number,
  items: T[],
  fn: (item: T) => Promise<void>,
) {
  return new Promise<void>((resolve, reject) => {
    let busyThreads = 0;
    let failed = false;
    items = items.slice();

    let loop = () => {
      if (failed) {
        return;
      }
      if (!items.length) {
        if (busyThreads === 0) {
          resolve();
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
          failed = true;
          reject(err);
        },
      );
      loop();
    };
    loop();
  });
}
