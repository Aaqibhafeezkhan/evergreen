// @ts-nocheck -- the fixture deliberately uses APIs that current Node.js typings removed.
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as hooks from "node:async_hooks";
import * as nodeCrypto from "node:crypto";

const directory: string = nodeOs.tmpdir();
const long: string = nodePath.toNamespacedPath("/tmp/file.txt");
const current: number = hooks.executionAsyncId();
const trigger: number = hooks.triggerAsyncId();
const hash = nodeCrypto.createHash("sha256");
const hmac = nodeCrypto.createHmac("sha256", "secret");
