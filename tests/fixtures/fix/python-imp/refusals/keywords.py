import imp

module = imp.reload(existing, file=sys.stderr)
magic = imp.get_magic(flag=True)
cache = imp.cache_from_source("module.py", True)
finder = imp.find_module("example", path=[], descriptor=1)
