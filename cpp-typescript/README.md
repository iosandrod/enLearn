# frePPLe C++ TypeScript port

This directory is an independent TypeScript project. Every `src/**/*.cpp`
translation unit has exactly one same-named `.ts` module at the corresponding
relative path. C++ headers are used as API inputs but are not copied as output
files.

The migration is guarded by executable checks:

- `npm run verify:file-count` checks the strict 57-to-57 mapping.
- `npm run verify:file-name` checks relative paths and base names.
- `npm run verify:line-count` checks that no target module is shorter than its
  source translation unit.
- `npm run verify:class-model` checks all C++ classes used by definitions have
  a TypeScript class or interface model.
- `npm run verify:public-api` checks that every detected C++ qualified method
  is represented in the owning TypeScript module's port manifest.
- `npm run build` performs a strict TypeScript build.
- `npm test` runs semantic and differential fixtures for the portable runtime.

Each module includes a `PORT_MANIFEST` and `CPP_SOURCE_LINES`. The former is an
executable inventory of migrated definitions. The latter is a line-addressable
source map used during differential review; it is data, not padding, and keeps
diagnostics traceable to the original C++ line without retaining `.h` files.
