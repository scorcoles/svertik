#!/bin/sh
# Compiles the kernels to WebAssembly and puts them next to the engine.
#
#   ./packages/kernels/build.sh
#
# Without Rust installed, the engine still works (it uses the TypeScript version).
set -e
here=$(cd "$(dirname "$0")" && pwd)
cargo build --release --target wasm32-unknown-unknown --manifest-path "$here/Cargo.toml"
mkdir -p "$here/../engine/src/kernels"
cp "$here/target/wasm32-unknown-unknown/release/svertik_kernels.wasm" "$here/../engine/src/kernels/svertik_kernels.wasm"
echo "kernels: $here/../engine/src/kernels/svertik_kernels.wasm"
