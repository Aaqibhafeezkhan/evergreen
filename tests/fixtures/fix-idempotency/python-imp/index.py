import imp

module = imp.reload(existing)
created = imp.new_module("example")
magic = imp.get_magic()
tag = imp.get_tag()
cache = imp.cache_from_source("module.py")
source = imp.source_from_cache("module.pyc")
