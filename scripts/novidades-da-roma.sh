#!/bin/sh
# Lista os commits do sistema da Advocacia Roma depois do ultimo revisado.
#
# O hash revisado mora em docs/ESPELHO-DA-ROMA.md; este script so le. Nada do
# clone da Roma entra neste repositorio: e um clone local, no caminho que
# voce passar (ou ../sistema-advocacia-roma).
set -eu

AQUI=$(cd "$(dirname "$0")/.." && pwd)
CLONE=${1:-"$AQUI/../sistema-advocacia-roma"}
DOC="$AQUI/docs/ESPELHO-DA-ROMA.md"

if [ ! -d "$CLONE/.git" ]; then
  echo "Clone da Roma nao encontrado em: $CLONE" >&2
  echo "Uso: scripts/novidades-da-roma.sh /caminho/do/clone" >&2
  exit 2
fi

ULTIMO=$(grep -o 'Ultimo commit revisado | `[0-9a-f]\{40\}`' "$DOC" | grep -o '[0-9a-f]\{40\}')
if [ -z "$ULTIMO" ]; then
  echo "Nao achei o hash do ultimo commit revisado em $DOC" >&2
  exit 2
fi

git -C "$CLONE" fetch -q origin main 2>/dev/null || echo "(sem rede: usando o que o clone ja tem)" >&2

if ! git -C "$CLONE" cat-file -e "$ULTIMO" 2>/dev/null; then
  echo "O clone nao tem o commit $ULTIMO (clone raso?). Rode: git -C \"$CLONE\" fetch --unshallow" >&2
  exit 2
fi

NOVOS=$(git -C "$CLONE" rev-list --count "$ULTIMO..origin/main" 2>/dev/null || git -C "$CLONE" rev-list --count "$ULTIMO..HEAD")
if [ "$NOVOS" = "0" ]; then
  echo "Nada novo na Roma desde $ULTIMO."
  exit 0
fi

echo "$NOVOS commit(s) novo(s) na Roma desde $ULTIMO:"
echo
git -C "$CLONE" log --reverse --date=short --stat=100 --format='%n== %h  %ad  %s' "$ULTIMO..origin/main" 2>/dev/null \
  || git -C "$CLONE" log --reverse --date=short --stat=100 --format='%n== %h  %ad  %s' "$ULTIMO..HEAD"
echo
echo "Para cada um: ja existe aqui, existe em parte, ou reescrever. Ver docs/ESPELHO-DA-ROMA.md."
