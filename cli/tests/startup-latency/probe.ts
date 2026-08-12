// Spawned by ../startup-latency.test.ts. Runs notifyInstalls in a real process
// against a stub replica, so the test can assert both what goes on the wire and
// that nothing left behind keeps the process alive.
import { notifyInstalls } from "../../notify-installs.js";

let start = Date.now();
await notifyInstalls(JSON.parse(process.argv[2] ?? "{}"));
console.log(JSON.stringify({ ms: Date.now() - start }));
