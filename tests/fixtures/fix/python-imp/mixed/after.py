import imp
import importlib

module = importlib.reload(existing)
finder = imp.find_module("example")
