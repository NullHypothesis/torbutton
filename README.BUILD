To build an XPI that is suitable for Babelzilla, do the following:

    patch -p0 < no-english.diff
    chmod +x makexpi.sh
    ./makexpi.sh
    cd pkg/

You should see:

    file torbutton-1.2.0rc1.xpi
    pkg/torbutton-1.2.0rc1.xpi: Zip archive data, at least v1.0 to extract

This is to work around the fact that an xpi requires empty strings for
incomplete translations or the formatting of various dialogs will be broken.
Furthermore, Babelzilla doesn't know an english string from a Japanese string
and simply records translations as matching strings. The XPI resulting from
the above build process will be ready for Babelzilla but should not be used by
anyone else.

