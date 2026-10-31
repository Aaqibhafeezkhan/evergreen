const nodeOs = require("node:os");
const nodePath = require("path");
const hooks = require("async_hooks");
const nodeCrypto = require("crypto");

const directory = nodeOs.tmpDir();
const long = nodePath._makeLong("/tmp/file.txt");
const current = hooks.currentId();
const trigger = hooks.triggerId();
const hash = nodeCrypto.Hash("sha256");
const hmac = nodeCrypto.Hmac("sha256", "secret");
