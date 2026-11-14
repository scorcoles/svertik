#!/bin/sh
# Compila los kernels a WebAssembly y los deja junto al motor.
#
#   ./packages/kernels/build.sh
#
# Si no está instalado Rust, el motor sigue funcionando (usa la versión en TypeScript).
set -e
here=$(cd "$(dirname "$0")" && pwd)
cargo build --release --target wasm32-unknown-unknown --manifest-path "$here/Cargo.toml"
mkdir -p "$here/../engine/src/kernels"
cp "$here/target/wasm32-unknown-unknown/release/svertik_kernels.wasm" "$here/../engine/src/kernels/svertik_kernels.wasm"
echo "kernels: $here/../engine/src/kernels/svertik_kernels.wasm"
