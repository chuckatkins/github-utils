#!/bin/bash

if [[ ! -f package.json ]]
then
    echo "error: $0: No package.json detected in current working directory."
    exit 1
fi

if ! command -v jest > /dev/null 2>&1
then
    echo "error: $0: command jest not found."
    exit 1
fi

script_dir="$(realpath -Les "${BASH_SOURCE[0]%/*}")"
root_dir="${script_dir%/scripts/npm}"
cwd="$(realpath --relative-to "${root_dir}" "${PWD}")"

possible_configs=(jest.config.js jest.config.mjs)
config_found=0
for config in "${possible_configs[@]}"
do
    if ls ${config} >/dev/null 2>&1
    then
        config_found=1
        break
    fi
done
if [[ ${config_found} -eq 0 ]]
then
    echo "error: $0: No jest config file detected at: ${possible_configs[@]}"
    exit 1
fi

echo "cwd: ${cwd}"
cmd=(jest "$@")
echo "${cmd[@]}"
exec "${cmd[@]}"
