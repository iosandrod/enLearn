# Node Defaults

The files in this directory are the single source of truth for values used when
the print designer creates a node or restores a node with missing properties.
Each node type has its own module so changing one node's initial appearance does
not require editing the toolbar or shape utility implementation.

Keep editor state-dependent values, such as the current color or fill style,
in the creation code. Those values are intentionally resolved from the editor
at creation time rather than stored as static defaults.
