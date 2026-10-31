import imp

module = imp.reload(existing)
finder = imp.find_module("example")
