#!/bin/bash

# set -e

findRootDir() {
  dir="$(pwd)"
  while [[ "$dir" != "" && ! -e "$dir/mops.toml" ]]; do
    dir=${dir%/*}
  done
  echo "$dir"
}

rootDir=$(findRootDir)
mopsToml="$rootDir/mops.toml"

if [[ $rootDir == "" ]] || [[ ! -f $mopsToml ]]; then
  mocPath="$(mops toolchain bin moc)" || mocPath=""
else
  if command -v openssl >/dev/null 2>&1; then
    mopsTomlHash=$(openssl sha256 $mopsToml | awk -F'= ' '{print $2}')
  else
    mopsTomlHash=$(shasum $mopsToml -a 256 | awk -F' ' '{print $1}')
  fi;

  cached="$rootDir/.mops/moc-$(uname -n)-$mopsTomlHash"

  if [ -f $cached ]; then
    mocPath=$(cat $cached)
  fi;

  if [[ "$mocPath" != *"/moc" ]] ; then
    mocPath="$(mops toolchain bin moc)" || mocPath=""
    # Only cache a real path. Caching a failed lookup leaves a zero-byte file
    # that every later run reads back as an empty command.
    if [[ "$mocPath" == *"/moc" ]] ; then
      mkdir -p "$(dirname $cached)"
      echo -n $mocPath > "$cached"
    fi;
  fi;
fi;

# Check the shape, not just emptiness: `mops toolchain bin` exits non-zero with
# a hint when [toolchain] moc is unset, and executing that text would report a
# missing `Run` command instead of the real problem.
if [[ "$mocPath" != */moc ]]; then
  echo "moc-wrapper: could not resolve moc." >&2
  echo "Pin one with 'mops toolchain use moc <version>'." >&2
  exit 1
fi;

"$mocPath" "$@"
