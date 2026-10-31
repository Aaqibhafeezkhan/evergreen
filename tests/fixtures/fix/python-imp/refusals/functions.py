import imp

finder = imp.find_module("example")
loader = imp.load_module("example", *args)
source = imp.load_source("example", "/tmp/example.py")
suffixes = imp.get_suffixes()
