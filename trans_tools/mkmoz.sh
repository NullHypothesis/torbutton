#!/bin/bash -x
#

LOCALEDIR="../src/chrome/locale"

poDir="po" 
directories="`ls -1 ./$poDir|tr _ -`"
mozDir="moz"
input="en"
template="torbutton.dtd"

for dir in $directories
do
    pootleDir="`echo $dir|tr - _`";
    echo "$pootleDir"
    mkdir -p $mozDir/$dir/
    po2moz -i $poDir/$pootleDir/ -t ${LOCALEDIR}/${input}/ -o $mozDir/$dir/ 
    #po2moz -i $poDir/$pootleDir/ -t pootle/templates/ -o $mozDir/$dir/ 
done

