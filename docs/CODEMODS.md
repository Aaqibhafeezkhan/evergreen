# Codemods

`evergreen fix` repairs some deprecations exactly, at the lines a scan reports, and prints unified diffs that `git apply` accepts. Nothing is written unless you pass `--branch`, and no codemod uses the network or runs the scanned repository's code. A codemod rewrites a finding only when the replacement behaves identically for every input the matched shape accepts; anything else is left unchanged and listed as a refusal in `fix --json`.

## python-imp

Rewrites the `imp` calls that have exact `importlib`, `types`, or `sys` equivalents, so the code runs on Python 3.12, where `imp` was [removed](https://docs.python.org/3/whatsnew/3.12.html#removed).

| Rule | Before | After | Import added |
|---|---|---|---|
| `python.symbol.imp.reload` | `imp.reload(m)` | `importlib.reload(m)` | `import importlib` |
| `python.symbol.imp.new-module` | `imp.new_module(n)` | `types.ModuleType(n)` | `import types` |
| `python.symbol.imp.get-magic` | `imp.get_magic()` | `importlib.util.MAGIC_NUMBER` | `import importlib.util` |
| `python.symbol.imp.get-tag` | `imp.get_tag()` | `sys.implementation.cache_tag` | `import sys` |
| `python.symbol.imp.cache-from-source` | `imp.cache_from_source(p)` | `importlib.util.cache_from_source(p)` | `import importlib.util` |
| `python.symbol.imp.source-from-cache` | `imp.source_from_cache(p)` | `importlib.util.source_from_cache(p)` | `import importlib.util` |

Each equivalence is documented by the standard library: [`importlib.reload`](https://docs.python.org/3/library/importlib.html#importlib.reload), [`types.ModuleType`](https://docs.python.org/3/library/types.html#types.ModuleType), [`importlib.util.MAGIC_NUMBER`](https://docs.python.org/3/library/importlib.html#importlib.util.MAGIC_NUMBER), [`sys.implementation.cache_tag`](https://docs.python.org/3/library/sys.html#sys.implementation), [`importlib.util.cache_from_source`](https://docs.python.org/3/library/importlib.html#importlib.util.cache_from_source), and [`importlib.util.source_from_cache`](https://docs.python.org/3/library/importlib.html#importlib.util.source_from_cache).

Each needed import is added on the line after `import imp` when it is not already present. When every `imp.` use in the file was rewritten, the `import imp` line is replaced by the added imports, because `import imp` itself fails on Python 3.12. When any use remains, `import imp` stays and the new imports are inserted after it.

```python
import imp

module = imp.reload(existing)
magic = imp.get_magic()
```

becomes

```python
import importlib
import importlib.util

module = importlib.reload(existing)
magic = importlib.util.MAGIC_NUMBER
```

Refused, with the reason in `fix --json`:

- `imp.find_module`, `imp.load_module`, `imp.load_source`, and `imp.get_suffixes`, which have no exact equivalent;
- a keyword argument the replacement does not accept, such as `imp.reload(m, file=...)`;
- a second positional argument to `imp.cache_from_source`, where it means `debug_override` in `imp` but `optimization` in `importlib.util`;
- any argument to `imp.get_magic` or `imp.get_tag`, whose replacement is a constant;
- a splat argument, whose names are not visible in the source text;
- a call written through a rebinding, such as `reload = imp.reload; reload(m)`;
- `from imp import ...`, `import imp as ...`, an `import imp` statement that also imports other modules, more than one `import imp`, or one that shares its line with other code;
- a file that cannot be read, has syntax errors, or does not end with a newline.
