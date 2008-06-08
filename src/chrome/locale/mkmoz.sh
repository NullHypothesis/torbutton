#!/bin/bash -x
#

directories="ar de-DE es hr-HR nl-NL pt-BR sl-SI de-AT el-GR fa-IR it-IT pl-PL zh-CN de-CH fr-FR ru zh-TW"
poDir="po" 
mozDir="moz"
input="en-US"
template="torbutton.dtd"

for dir in $directories
do
    pootleDir="`echo $dir|tr - _`";
    mkdir -p $mozDir/$dir/
    po2moz -i $poDir/$pootleDir/ -t $input/ -o $mozDir/$dir/ 
done

