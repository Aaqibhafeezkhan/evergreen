const os = require("os");
const { tmpDir: renamed } = require("os");
const { tmpDir } = require("os");

renamed();
tmpDir();
os.tmpDir?.();
os?.tmpDir();
os["tmpDir"]();
