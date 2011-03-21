#!/bin/bash

for locale in `ls -1 moz/`;
do
  mv -v moz/$locale/*.{dtd,properties} ../src/chrome/locale/$locale/
done
