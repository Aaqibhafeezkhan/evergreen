"""A service that still uses standard-library modules Python 3.12 and 3.13 removed."""

import cgi
from telnetlib import Telnet
import datetime


def legacy_headers():
    return cgi.escape("<b>")


def build_timestamp():
    return datetime.datetime.utcnow()


def compile_grammar():
    import lib2to3

    return lib2to3
