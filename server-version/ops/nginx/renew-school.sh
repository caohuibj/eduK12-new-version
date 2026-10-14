#!/bin/sh
set -eu
[ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/school.eduk12.top ] || exit 0
grep -Fq "ssl_certificate /etc/letsencrypt/live/school.eduk12.top/fullchain.pem;" /etc/nginx/conf.d/eduk12-school.conf || exit 0
/usr/sbin/nginx -t
/bin/systemctl reload nginx
