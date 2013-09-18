#!/bin/bash

moz2po -P -i ../src/chrome/locale/en/ -o po/templates/

for i in `ls -1 po`
do
   msgmerge -U ./po/$i/torbutton.dtd.po ./po/templates/torbutton.dtd.pot
   msgmerge -U ./po/$i/torbutton.properties.po ./po/templates/torbutton.properties.pot
   msgmerge -U ./po/$i/browser.dtd.po ./po/templates/browser.dtd.pot
   msgmerge -U ./po/$i/browser.properties.po ./po/templates/browser.properties.pot
done

svn diff po
svn commit po

cd po
tx push --source
tx push --translation
cd ..

