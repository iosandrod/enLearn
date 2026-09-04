import type { Component } from 'vue';
import { resolveLowCodeMaterialModule } from './module-registry';
import {
  assertLowCodeMaterialSfc,
  lowCodeMaterialTypeFileSystem,
  materialCompilerFilename,
} from './compiler-policy';
import type {
  LowCodeCompiledMaterial,
  LowCodeMaterialModuleResolver,
  LowCodeMaterialRow,
} from './types';

const compiledComponentCache = new Map<string, Promise<LowCodeCompiledMaterial>>();

function errorMessages(errors: Array<string | { message?: string }>) {
  return errors.map((error) => typeof error === 'string' ? error : error.message ?? String(error));
}

function injectStyles(styleId: string, css: string) {
  if (!css || typeof document === 'undefined') return;
  const selector = `style[data-lowcode-material-style="${styleId}"]`;
  if (document.head.querySelector(selector)) return;
  const style = document.createElement('style');
  style.dataset.lowcodeMaterialStyle = styleId;
  style.textContent = css;
  document.head.appendChild(style);
}

function stripRuntimeTypeImports(source: string) {
  return source.replace(/(^|\n)\s*import\s+type\s+[^;]+;?/g, '$1');
}

function stripMacroGeneric(source: string, macro: 'defineProps' | 'defineEmits') {
  const marker = `${macro}<`;
  let cursor = 0;
  let output = '';
  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start < 0) {
      output += source.slice(cursor);
      break;
    }
    output += source.slice(cursor, start) + macro;
    let index = start + marker.length;
    let depth = 1;
    let quote: string | undefined;
    for (; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === quote && source[index - 1] !== '\\') quote = undefined;
        continue;
      }
      if (char === `'` || char === '"' || char === '`') {
        quote = char;
        continue;
      }
      if (char === '<') depth += 1;
      else if (char === '>') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) {
      output += source.slice(start + marker.length);
      break;
    }
    cursor = index + 1;
  }
  return output;
}

function stripRuntimeMacroTypes(source: string) {
  let result = stripRuntimeTypeImports(source);
  result = stripMacroGeneric(result, 'defineProps');
  return stripMacroGeneric(result, 'defineEmits');
}

async function compileMaterial(
  row: LowCodeMaterialRow,
  resolveDynamic?: LowCodeMaterialModuleResolver,
): Promise<LowCodeCompiledMaterial> {
  const [{ compileScript, compileStyle, parse }, { compile: compileDom }, tsModule] = await Promise.all([
    import('@vue/compiler-sfc'),
    import('@vue/compiler-dom'),
    import('typescript'),
  ]);
  const ts = tsModule.default ?? tsModule;
  const filename = materialCompilerFilename(row.source_path);
  const compilerId = `lc-${row.source_hash.slice(0, 12)}`;
  const scopeId = `data-v-${compilerId}`;
  // Database sources are compiled by a CommonJS Function wrapper, so the
  // ESM-only import.meta flag must be replaced in the runtime copy. The
  // canonical source_text remains unchanged in the database.
  const runtimeSource = row.source_text.replace(/import\.meta\.env\.DEV/g, 'false');
  const parsed = parse(runtimeSource, { filename });
  if (parsed.errors.length) {
    throw new Error(errorMessages(parsed.errors as Array<string | { message?: string }>).join('\n'));
  }
  let { descriptor } = parsed;
  assertLowCodeMaterialSfc(descriptor, row.material_kind, row.code);
  // Run the DOM compiler explicitly as a syntax/transform gate.  The SFC
  // compiler invokes the same compiler when `inlineTemplate` is enabled, but
  // keeping this pass visible makes the runtime contract clear and lets us
  // surface template diagnostics before executing database code.
  if (descriptor.template) {
    const templateErrors: Array<string | { message?: string }> = [];
    compileDom(descriptor.template.content, {
      // The browser build of compiler-dom intentionally exposes the
      // function-mode compiler; prefixIdentifiers is only available in the
      // compiler-core module build. SFC compileScript performs the actual
      // module-mode transform below, so this pass is a portable syntax gate.
      mode: 'function',
      onError: (error) => templateErrors.push(error),
    });
    if (templateErrors.length) {
      throw new Error(errorMessages(templateErrors).join('\n'));
    }
  }

  const compileScriptOptions = {
    id: compilerId,
    inlineTemplate: true,
    fs: lowCodeMaterialTypeFileSystem,
    templateOptions: {
      compilerOptions: {
        scopeId: descriptor.styles.some((style) => style.scoped) ? scopeId : undefined,
      },
    },
  } as const;
  let script;
  try {
    script = compileScript(descriptor, compileScriptOptions);
  } catch (error) {
    if (!(error instanceof Error) || !/Unresolvable type reference|unsupported built-in utility type/.test(error.message)) {
      throw error;
    }
    const fallback = parse(runtimeSource.replace(
      /(<script\s+setup\s+lang=["']ts["'][^>]*>)([\s\S]*?)(<\/script>)/i,
      (_match, open: string, content: string, close: string) =>
        `${open}${stripRuntimeMacroTypes(content)}${close}`,
    ), { filename });
    if (fallback.errors.length) {
      throw new Error(errorMessages(fallback.errors as Array<string | { message?: string }>).join('\n'));
    }
    descriptor = fallback.descriptor;
    assertLowCodeMaterialSfc(descriptor, row.material_kind, row.code);
    script = compileScript(descriptor, compileScriptOptions);
  }
  const transpiled = ts.transpileModule(script.content, {
    fileName: filename.replace(/\.vue$/, '.ts'),
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      isolatedModules: true,
      sourceMap: false,
    },
  });
  const diagnostics = (transpiled.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  if (diagnostics.length) throw new Error(diagnostics.join('\n'));

  const module = { exports: {} as Record<string, unknown> };
  const localRequire = (request: string) =>
    resolveLowCodeMaterialModule(filename, request, resolveDynamic);
  const execute = new Function(
    'require',
    'module',
    'exports',
    `${transpiled.outputText}\n//# sourceURL=lowcode-material://${row.material_kind}/${row.code}.js`,
  );
  execute(localRequire, module, module.exports);
  const component = module.exports.default as Component | undefined;
  if (!component) throw new Error(`Material ${row.code} did not export a Vue component.`);
  // `compileStyle({ scoped: true })` rewrites selectors to include the SFC
  // scope attribute, but the runtime compiler does not run the Vite SFC
  // plugin that normally attaches `__scopeId` to the component definition.
  // Attach it here so fragment roots (for example a panel plus Teleports)
  // receive the same `data-v-*` attribute as regular SFC roots.
  if (descriptor.styles.some((style) => style.scoped)) {
    (component as Component & { __scopeId?: string }).__scopeId = scopeId;
  }

  const cssParts: string[] = [];
  descriptor.styles.forEach((style, index) => {
    const result = compileStyle({
      id: scopeId,
      filename,
      source: style.content,
      scoped: style.scoped,
    });
    if (result.errors.length) {
      throw new Error(`Style ${index + 1}: ${errorMessages(result.errors as Array<string | { message?: string }>).join('\n')}`);
    }
    cssParts.push(result.code);
  });
  const css = cssParts.join('\n');
  if (css) injectStyles(row.source_hash, css);

  return { component, ...(css ? { styleId: row.source_hash } : {}) };
}

export function compileLowCodeMaterialSfc(
  row: LowCodeMaterialRow,
  resolveDynamic?: LowCodeMaterialModuleResolver,
) {
  const cacheKey = [
    row.material_kind,
    row.code,
    row.material_version,
    row.source_hash,
  ].join(':');
  let pending = compiledComponentCache.get(cacheKey);
  if (!pending) {
    pending = compileMaterial(row, resolveDynamic);
    compiledComponentCache.set(cacheKey, pending);
    pending.catch(() => compiledComponentCache.delete(cacheKey));
  }
  return pending;
}

export function clearLowCodeMaterialCompilerCache() {
  compiledComponentCache.clear();
}
