#!/bin/bash

if [[ ! -f package.json ]]
then
    echo "error: $0: No package.json detected in current working directory."
    exit 1
fi

if ! command -v prettier > /dev/null 2>&1
then
    echo "error: $0: command prettier not found."
    exit 1
fi

script_dir="$(realpath -Les "${BASH_SOURCE[0]%/*}")"
root_dir="${script_dir%/scripts/npm}"
config="$(realpath -Les --relative-to "${PWD}" "${root_dir}/.prettierrc.yml")"
if [[ ! -f ${config} ]]
then
    echo "error: $0: No prettier config file detected at \"${config}\"."
    exit 1
fi

ignore="$(realpath -Les --relative-to "${PWD}" "${root_dir}/.prettierignore")"
if [[ ! -f ${ignore} ]]
then
    echo "error: $0: No prettier ignore file detected at \"${ignore}\"."
    exit 1
fi

cwd="$(realpath --relative-to "${root_dir}" "${PWD}")"
echo "cwd: ${cwd}"

cmd=(prettier --config "${config}" --ignore-path "${ignore}" "$@")
echo "${cmd[@]}"
exec "${cmd[@]}"
