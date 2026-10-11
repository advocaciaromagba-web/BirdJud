#!/usr/bin/env bash
# Vigia de FORA do Railway: o que o vigia interno (scripts/vigia.mjs) nao
# consegue ver — o provedor inteiro fora, o DNS do dominio proprio, o
# certificado vencendo. Roda no GitHub Actions (.github/workflows/vigia-externo.yml).
#
#   bash scripts/vigia-externo.sh            # confere producao
#   VIGIA_DOMINIO=exemplo.com bash ...       # confere outro dominio
#
# Sai com 0 quando tudo responde; com 1 e um relatorio em stdout quando algo
# falha. Cada conferencia tenta 3 vezes, 20 s entre elas: um soluco de rede do
# proprio GitHub nao pode virar alarme as 3h da manha.
set -u
DOMINIO="${VIGIA_DOMINIO:-birdjud.com.br}"
DIAS_MINIMOS="${VIGIA_DIAS_CERTIFICADO:-14}"
ESPERA="${VIGIA_ESPERA:-20}"
falhas=()

tentar() { # tentar <descricao> <comando...>
  local descricao="$1"; shift
  local saida=""
  for n in 1 2 3; do
    if saida=$("$@" 2>&1); then return 0; fi
    [ "$n" -lt 3 ] && sleep "$ESPERA"
  done
  falhas+=("$descricao: $saida")
  return 1
}

saude() {
  local corpo codigo
  corpo=$(curl -sS --max-time 15 -w '\n%{http_code}' "https://$DOMINIO/api/saude") || { echo "sem resposta"; return 1; }
  codigo="${corpo##*$'\n'}"; corpo="${corpo%$'\n'*}"
  [ "$codigo" = "200" ] && [[ "$corpo" == *'"ok":true'* ]] && return 0
  echo "HTTP $codigo ${corpo:0:120}"; return 1
}

pagina() { # pagina <url>
  local codigo
  codigo=$(curl -sS -o /dev/null --max-time 15 -L -w '%{http_code}' "$1") || { echo "sem resposta"; return 1; }
  [ "$codigo" = "200" ] && return 0
  echo "HTTP $codigo"; return 1
}

certificado() {
  local fim segundos dias
  fim=$(echo | openssl s_client -servername "$DOMINIO" -connect "$DOMINIO:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  [ -n "$fim" ] || { echo "nao foi possivel ler o certificado"; return 1; }
  segundos=$(( $(date -d "$fim" +%s) - $(date +%s) ))
  dias=$(( segundos / 86400 ))
  [ "$dias" -ge "$DIAS_MINIMOS" ] && return 0
  echo "vence em $dias dia(s) ($fim)"; return 1
}

tentar "Aplicacao e banco (https://$DOMINIO/api/saude)" saude
tentar "Pagina de entrada (https://$DOMINIO/entrar)" pagina "https://$DOMINIO/entrar"
tentar "Site (https://www.$DOMINIO)" pagina "https://www.$DOMINIO/"
tentar "Certificado de $DOMINIO" certificado

if [ "${#falhas[@]}" -eq 0 ]; then
  echo "ok: $DOMINIO respondeu em tudo ($(date -u +%FT%TZ))"
  exit 0
fi
echo "FALHA em $DOMINIO ($(date -u +%FT%TZ)):"
for f in "${falhas[@]}"; do echo "- $f"; done
exit 1
