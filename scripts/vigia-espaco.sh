#!/usr/bin/env bash
# Vigia do espaco: o disco dos arquivos ou o banco passou de 70%? Roda no
# GitHub Actions junto com o vigia externo (.github/workflows/vigia-externo.yml),
# mas abre um alarme PROPRIO — disco enchendo nao e sistema fora do ar, e
# pede outra providencia (aumentar o volume no Railway, ver docs/VIGIA-EXTERNO.md).
#
# Sai com 0 quando esta abaixo de 70% (ou quando nao responde: isso e com o
# vigia externo); com 1 e o relatorio quando passou.
set -u
DOMINIO="${VIGIA_DOMINIO:-birdjud.com.br}"
corpo=$(curl -sS --max-time 20 -w '\n%{http_code}' "https://$DOMINIO/api/saude/espaco") || { echo "sem resposta (o vigia externo cuida disso)"; exit 0; }
codigo="${corpo##*$'\n'}"; corpo="${corpo%$'\n'*}"
if [ "$codigo" = "200" ]; then
  echo "ok: espaco abaixo de 70% ($(date -u +%FT%TZ))"
  exit 0
fi
if [[ "$corpo" == *'"acima"'* ]]; then
  echo "ESPACO acima de 70% em $DOMINIO ($(date -u +%FT%TZ)): ${corpo:0:200}"
  echo "arquivos = volume do APP (/dados); banco = volume do Postgres. Aumentar o volume no Railway antes de chegar a 90%."
  exit 1
fi
echo "medida de espaco nao respondeu: HTTP $codigo ${corpo:0:120} (sem alarme)"
exit 0
