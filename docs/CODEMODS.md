# Codemods

`evergreen fix` repairs some deprecations exactly, at the lines a scan reports, and prints unified diffs that `git apply` accepts. Nothing is written unless you pass `--branch`, and no codemod uses the network or runs the scanned repository's code. A codemod rewrites a finding only when the replacement behaves identically for every input the matched shape accepts; anything else is left unchanged and listed as a refusal in `fix --json`.

## node-renames

Rewrites the Node.js deprecations that are pure renames: the old name calls the same implementation. Only the member name changes; the receiver expression and the arguments are kept byte-for-byte.

| Rule | Before | After |
|---|---|---|
| `nodejs.symbol.os.tmpdir` | `os.tmpDir()` | `os.tmpdir()` |
| `nodejs.symbol.path.makelong` | `path._makeLong(p)` | `path.toNamespacedPath(p)` |
| `nodejs.symbol.async-hooks.currentid` | `async_hooks.currentId()` | `async_hooks.executionAsyncId()` |
| `nodejs.symbol.async-hooks.triggerid` | `async_hooks.triggerId()` | `async_hooks.triggerAsyncId()` |
| `nodejs.symbol.crypto.hash` | `crypto.Hash(algorithm)` called without `new` | `crypto.createHash(algorithm)` |
| `nodejs.symbol.crypto.hmac` | `crypto.Hmac(algorithm, key)` called without `new` | `crypto.createHmac(algorithm, key)` |

Each equivalence is read from the Node.js source: [`tmpDir` is `deprecate(tmpdir, …)`](https://github.com/nodejs/node/blob/v13.14.0/lib/os.js#L298), [`_makeLong` is assigned `toNamespacedPath` on both platforms](https://github.com/nodejs/node/blob/v22.23.0/lib/path.js#L1725-L1726), [`currentId` and `triggerId` are renamed to the same functions](https://github.com/nodejs/node/blob/v8.1.4/lib/async_hooks.js#L183-L193), and [`Hash`/`Hmac` called without `new` construct the same object `createHash`/`createHmac` return](https://github.com/nodejs/node/blob/v22.23.0/lib/internal/crypto/hash.js#L88-L163).

Two candidates are not covered because they are not exact aliases. `os.getNetworkInterfaces()` returns the native flat array while `os.networkInterfaces()` builds the keyed object, and `module.createRequire()` validates its argument and decodes non-absolute strings as file URLs while `module.createRequireFromPath()` accepts any path.

Refused, with the reason in `fix --json`:

- a call through a local binding, such as a destructured or aliased import (`const { tmpDir } = require("os"); tmpDir()`);
- an optional call (`os.tmpDir?.()` or `os?.tmpDir()`);
- a computed member access (`os["tmpDir"]()`);
- a constructor call such as `new crypto.Hash(...)`, which is not the call form the rename covers;
- a file that cannot be read, does not end with a newline, or does not parse.
