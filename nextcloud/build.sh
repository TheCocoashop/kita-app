#!/bin/bash
# Baut kitaapp.tar.gz: PHP-Teil aus nextcloud/kitaapp + Oberfläche aus kita-app/
set -euo pipefail
cd "$(dirname "$0")"
OUT=build/kitaapp
# Ordner selbst stehen lassen (er ist im Test-Container eingebunden), nur den Inhalt erneuern
mkdir -p "$OUT" && find "$OUT" -mindepth 1 -delete && mkdir -p "$OUT"/{js,css,img}
cp -R kitaapp/appinfo kitaapp/lib kitaapp/templates "$OUT"/
cp ../kita-app/releases.js ../kita-app/api.js ../kita-app/app.js "$OUT"/js/
cp ../kita-app/app.css "$OUT"/css/
cp ../kita-app/icon.svg "$OUT"/img/app.svg
# Logo für die Rückblick-Mail ist optional und liegt nicht im Repository (siehe INSTALL.md)
[ -f kitaapp/mail-logo.png ] && cp kitaapp/mail-logo.png "$OUT"/img/mail-logo.png || true
COPYFILE_DISABLE=1 tar --no-xattrs --exclude="._*" -C build -czf kitaapp.tar.gz kitaapp
echo "Fertig: $(pwd)/kitaapp.tar.gz"
