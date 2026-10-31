// @ts-nocheck -- the fixture deliberately uses APIs that current Node.js typings removed.
import * as os from "node:os";
import { tmpDir as renamed } from "node:os";
import { tmpDir } from "node:os";

renamed();
tmpDir();
os.tmpDir?.();
os?.tmpDir();
os["tmpDir"]();
