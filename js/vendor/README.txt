GDS viewer (kwasm)
==================
The "View layout" button uses kwasm, an open-source (GPL-3.0) KLayout-based viewer that runs
entirely in the browser as one JavaScript file. Add that file here as:

    js/vendor/kwasm.js

Get it (needs Python 3):

    pip download kwasm==0.3.0 --no-deps
    unzip kwasm-0.3.0-py3-none-any.whl -d kwasm_pkg
    find kwasm_pkg -name "*.js"          # copy the file it prints to js/vendor/kwasm.js

Or load it from a CDN instead: run
    pip install kwasm==0.3.0
    python -c "import kwasm; print(kwasm.CDN_URL)"
and paste that address into kwasmUrl in js/config.js.

The tracker was written against the kwasm 0.3.0 interface (Kwasm.mount with initial GDS data).
If you use a different version and the viewer does not open, check its protocol notes on PyPI.
