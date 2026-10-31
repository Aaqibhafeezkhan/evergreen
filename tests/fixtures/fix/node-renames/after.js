const nodeOs = require("node:os");
const nodePath = require("path");
const hooks = require("async_hooks");
const nodeCrypto = require("crypto");

const directory = nodeOs.tmpdir();
const long = nodePath.toNamespacedPath("/tmp/file.txt");
const current = hooks.executionAsyncId();
const trigger = hooks.triggerAsyncId();
const hash = nodeCrypto.createHash("sha256");
const hmac = nodeCrypto.createHmac("sha256", "secret");
