#!/usr/bin/python

from __future__ import unicode_literals, print_function

import polib
import sys
import getopt

symbols = [
    '(', ')', '<', '>', '{',
    '}', '[', ']', '\"', ';'
    ]

counts = {}

def reset():
  for s in symbols:
    counts[s] = 0

def parse_orig_string(string):
  for ch in string:
    if ch in symbols:
      counts[ch] += 1

def parse_trans_string(string):
  for ch in string:
    if ch in symbols:
      counts[ch] -= 1

def get_strings(file):
  entries = []
  po = polib.pofile(file, autodetect_encoding=True)

  for entry in po:
    entries.append((entry.msgid, entry.msgstr, 0))

  return entries

def warn():
  for s in symbols:
    if counts[s] < 0:
      return True
  return False

def usage():
  print("Usage: %s -i/--input=<file.po> -l/--logfile=<logfile>" % sys.argv[0])

def log(string, file_to_check, log_file, linenum = -1):
  f = log_file
  if linenum == -1:
    f.write(("%s: %s\n" % (file_to_check, string)).encode("utf-8"))
  else:
    f.write(("%s (%s): %s\n" % (file_to_check, linenum, string)).encode("utf-8"))
  #f.close()

def check(file_to_check, log_file):
  errors = 0

  strings = get_strings(file_to_check)
  for (orig, trans, linenum) in strings:
    reset()
    parse_orig_string(orig)
    parse_trans_string(trans)
    if warn():
      errors += 1
      log(trans, file_to_check, log_file, linenum)

  if errors != 0:
    log("Total count of warnings %d\n" % errors, file_to_check, log_file)

if __name__ == '__main__':
  try:
    opts, args = getopt.getopt(sys.argv[1:], "i:hl:", ["input=", "help", "logfile="])
  except getopt.GetoptError, err:
    print(str(err))
    sys.exit(2)

  file_to_check = None
  log_file = sys.stdout

  for opt, arg in opts:
    if opt in ("-i", "--input"):
      file_to_check = arg
    elif opt in ("-h", "--help"):
      usage()
      sys.exit()
    elif opt in ("-l", "--logfile"):
      log_file = arg

  if file_to_check is None or log_file is None:
    print("ERROR: You need to specify both the input and the logfile")
    sys.exit(2)

  check(file_to_check, log_file)
