#!/bin/bash

for i in `ls -1 ./po`
do
  ./validate.py --input=./po/$i/torbutton.dtd.po
  ./validate.py --input=./po/$i/torbutton.properties.po
done
