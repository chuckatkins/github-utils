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

clean=( lib dist )

cmd=(rm -rf "${clean[@]}")
echo "${cmd[@]}"
exec "${cmd[@]}"
