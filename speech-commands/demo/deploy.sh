#!/bin/bash

set -e

tag="$1"

if [[ -z ${tag} ]]; then
  echo "Usage: deploy.sh <TAG>"
  exit 1
fi

rm -rf dist
yarn build

BASE_DIR="gs://tfjs-speech-model-test/${tag}"
DIST_DIR="${BASE_DIR}/dist"

gsutil -m cp "dist/*" "${DIST_DIR}"

gsutil -m setmeta -h "Cache-Control:private" "${DIST_DIR}/**.html"
gsutil -m setmeta -h "Cache-Control:private" "${DIST_DIR}/**.css"
gsutil -m setmeta -h "Cache-Control:private" "${DIST_DIR}/**.js"
