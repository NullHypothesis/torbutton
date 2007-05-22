#!/bin/bash
APP_NAME=torbutton
VERSION=`grep em:version src/install.rdf | cut -d\" -f2`
XPI_NAME=$APP_NAME-$VERSION.xpi

if [ -e "pkg/$XPI_NAME" ]; then
  echo pkg/$XPI_NAME already exists.
  exit 1
fi

# create jar file (we're just storing files here)
echo ---------- create $APP_NAME.jar file ----------
cd src/chrome
zip -r0 ../../$APP_NAME.jar ./
cd ../..

# create .xpi
echo ---------- create $APP_NAME.xpi ----------
cd src
echo zip -9r ../pkg/$XPI_NAME ./ -x chrome/\*
zip -9r ../pkg/$XPI_NAME ./ -x "chrome/*"
mv ../$APP_NAME.jar ./chrome
zip -9m ../pkg/$XPI_NAME chrome/$APP_NAME.jar
cd ..

#zip -9m ../../downloads/$sXpiName  chrome/$APP_NAME.jar
#zip -9  ../../downloads/$sXpiName  install.rdf
#cd ..
