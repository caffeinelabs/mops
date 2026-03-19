import { Benchmark } from "/declarations/main/main.did.js";

export function getMetricNum(
  benchmark: Benchmark,
  row: string,
  col: string,
  metric: string,
): number | undefined {
  let metricData = benchmark.metrics.find((m) => m[0] === metric);
  let rowIndex = benchmark.rows.indexOf(row);
  let colIndex = benchmark.cols.indexOf(col);
  let value = metricData?.[1]?.[rowIndex]?.[colIndex];

  return value ? Number(value) : undefined;
}

export function getMetricDiff(
  benchmark: Benchmark,
  otherBenchmark: Benchmark,
  row: string,
  col: string,
  metric: string,
): number {
  let curValue = getMetricNum(benchmark, row, col, metric);
  let prevValue = getMetricNum(otherBenchmark, row, col, metric);

  if (curValue && prevValue) {
    return ((curValue - prevValue) / prevValue) * 100;
  } else {
    return 0;
  }
}
