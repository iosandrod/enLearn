# Shape property registry

`baseProps` in `base.ts` is the common property layer for every custom node. It
currently owns `w` and `h`; every node shape util extends its validators and
defaults from this registry.

Keep custom shape property definitions in this directory. A registry entry owns:

- the tldraw validator;
- the default value;
- the property-panel field;
- input normalization.

When adding a persisted property, add it to the node's registry and add a
versioned migration in the shape's registry file. Do not add node-specific
properties to `baseProps` unless every node can safely validate and use them.
Rendering and SVG export still need explicit behavior because a property definition cannot infer how
the shape should look.

Business-only dynamic data should use `shape.meta` instead of adding unrestricted top-level props.
