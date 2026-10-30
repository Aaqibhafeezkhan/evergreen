"""A small service that still imports a module Python 3.13 removed."""

import cgi

from telnetlib import Telnet


def form_fields():
    return cgi.FieldStorage()


def open_console(host):
    return Telnet(host)
