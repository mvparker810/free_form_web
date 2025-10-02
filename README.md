Source code for the web demo of the [free_form library](https://github.com/mvparker810/free_form).  
Try it out [here](https://mvparker810.github.io/free_form_web).

## Architecture

This is a **client-side CAD application**, meaning everything runs in your browser with no backend server.

- **Frontend**: React + TypeScript with HTML5 Canvas for 2D rendering.
- **Solver**: C based parametric constraint solver compiled to WebAssembly.
- **Build**: Vite for frontend, Emscripten for WASM compilation.
