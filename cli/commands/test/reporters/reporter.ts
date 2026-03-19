import { TestMode } from "../../../types.js";
import { MMF1 } from "../mmf1.js";

export interface Reporter {
  addFiles(files: string[]): void;
  addRun(
    file: string,
    mmf: MMF1,
    state: Promise<void>,
    mode: TestMode,
    progressive?: boolean,
  ): void;
  done(): boolean;
}
