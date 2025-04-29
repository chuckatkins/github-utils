#!/bin/bash

if [[ ! -f package.json ]]
then
    echo "error: $0: No package.json detected in current working directory."
    exit 1
fi

if ! command -v eslint > /dev/null 2>&1
then
    echo "error: $0: command eslint not found."
    exit 1
fi

script_dir="$(realpath -Les "${BASH_SOURCE[0]%/*}")"
root_dir="${script_dir%/scripts/npm}"
cwd="$(realpath --relative-to "${root_dir}" "${PWD}")"

possible_configs=("*.eslint.json" "eslint.config.mjs")
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
    echo "error: $0: No eslint config file detected at: ${possible_configs[@]}"
    exit 1
fi

echo "cwd: ${cwd}"
cmd=(eslint "$@")
echo "${cmd[@]}"
exec "${cmd[@]}"
