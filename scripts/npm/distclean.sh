#!/bin/bash

if [[ ! -f package.json ]]
then
    echo "error: $0: No package.json detected in current working directory."
    exit 1
fi

script_dir="$(realpath -Les "${BASH_SOURCE[0]%/*}")"
root_dir="${script_dir%/scripts/npm}"
cwd="$(realpath --relative-to "${root_dir}" "${PWD}")"
echo "cwd: ${cwd}"

distclean=(
    node_modules
    package-lock.json
    .eslintcache
    .turbo
    .cache
    .jest
    coverage
    build
)

cmd=(rm -rf "${distclean[@]}")
echo "${cmd[@]}"
exec "${cmd[@]}"
