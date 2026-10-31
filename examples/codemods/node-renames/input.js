const os = require("node:os");
const path = require("node:path");
const asyncHooks = require("node:async_hooks");
const crypto = require("node:crypto");

const directory = os.tmpDir();
const long = path._makeLong("/tmp/file.txt");
const current = asyncHooks.currentId();
const trigger = asyncHooks.triggerId();
const hash = crypto.Hash("sha256");
const hmac = crypto.Hmac("sha256", "secret");
