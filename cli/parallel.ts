export async function parallel<T>(
  threads: number,
  items: T[],
  fn: (item: T) => Promise<void>,
) {
  return new Promise<void>((resolve) => {
    let busyThreads = 0;
    items = items.slice();

    let loop = () => {
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
      fn(items.shift() as T).then(() => {
        busyThreads--;
        loop();
      });
      loop();
    };
    loop();
  });
}
