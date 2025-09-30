@echo off
REM Windows batch script to build WASM

REM Source Emscripten environment
call ..\emsdk\emsdk_env.bat

REM Compile to WASM
emcc freeform_wasm.c ^
  -o freeform.js ^
  -s EXPORTED_FUNCTIONS="[\"_malloc\",\"_free\"]" ^
  -s EXPORTED_RUNTIME_METHODS="[\"ccall\",\"cwrap\",\"getValue\",\"setValue\"]" ^
  -s MODULARIZE=1 ^
  -s EXPORT_NAME="createFreeFormModule" ^
  -s ALLOW_MEMORY_GROWTH=1 ^
  -s ENVIRONMENT="web" ^
  -O3 ^
  -I../extern/free_form

echo Build complete! Output: freeform.js and freeform.wasm