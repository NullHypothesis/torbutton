#!/bin/bash -x
#

LOCALEDIR="../src/chrome/locale/"

directories="ar de-DE es hr-HR nl-NL pt-BR sl-SI de-AT el-GR fa-IR it-IT pl-PL zh-CN de-CH fr-FR ru zh-TW"
outdir="po"
#input="en-US/torbutton.dtd"
input="en"
template="torbutton.dtd"

for dir in $directories
do
    pootleDir="`echo $dir|tr - _`";
    mkdir -p $outdir/$pootleDir/
    #moz2po -i $dir/$template -t $input -o $outdir/$pootleDir/torbutton.po
    moz2po -i $LOCALEDIR/$dir/ -t $LOCALEDIR/$input/ -o $outdir/$pootleDir/
done


