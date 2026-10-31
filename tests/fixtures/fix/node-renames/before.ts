// @ts-nocheck -- the fixture deliberately uses APIs that current Node.js typings removed.
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as hooks from "node:async_hooks";
import * as nodeCrypto from "node:crypto";

const directory: string = nodeOs.tmpDir();
const long: string = nodePath._makeLong("/tmp/file.txt");
const current: number = hooks.currentId();
const trigger: number = hooks.triggerId();
const hash = nodeCrypto.Hash("sha256");
const hmac = nodeCrypto.Hmac("sha256", "secret");
