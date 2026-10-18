#!/bin/bash
cd "$(dirname "$0")"
keys="intro mercadito servicios trabajo yavayago comunidad violeta santuario animales confianza cierre"
for k in $keys; do until grep -q "^$k .* frames" rv-a.log rv-b.log rv-c.log 2>/dev/null; do sleep 20; done; done
echo "core_v done $(date -u +%H:%M)"
python3 render_v.py --teaser 2>&1 | grep -v WARN
python3 assemble_v.py guia > asmv-g.log 2>&1 &
python3 assemble_v.py mercadito servicios trabajo yavayago teaser > asmv-a.log 2>&1 &
python3 assemble_v.py comunidad violeta santuario animales confianza > asmv-b.log 2>&1 &
wait
grep -v WARN asmv-*.log
echo "all assembled $(date -u +%H:%M)"
