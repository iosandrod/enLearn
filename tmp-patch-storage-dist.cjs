const fs = require('node:fs');
const file = '/app/api/dist/files-service/supabase-storage.driver.js';
let source = fs.readFileSync(file, 'utf8');
const helper = `function readPublicSupabaseUrl() {
    const env = (0, env_1.getEnv)();
    const value = String(env.SUPABASE_PUBLIC_URL ?? '').trim().replace(/\\/+$/, '');
    return value || 'http://117.72.155.0:54321';
}
function toPublicSupabaseUrl(value) {
    const internalUrl = readSupabaseUrl();
    const publicUrl = readPublicSupabaseUrl();
    if (publicUrl === internalUrl) return value;
    return value.startsWith(internalUrl + '/') ? publicUrl + value.slice(internalUrl.length) : value;
}
`;
if (!source.includes('function readPublicSupabaseUrl()')) {
  source = source.replace('function readServiceRoleKey() {', helper + 'function readServiceRoleKey() {');
}
source = source.replace(
  "const signedUrl = rawUrl.startsWith('/') ? storageBase + rawUrl : rawUrl;",
  "const signedUrl = toPublicSupabaseUrl(rawUrl.startsWith('/') ? storageBase + rawUrl : rawUrl);"
);
source = source.replace(
  "objectUrl: supabaseUrl + '/storage/v1/object/authenticated/' +",
  "objectUrl: toPublicSupabaseUrl(supabaseUrl + '/storage/v1/object/authenticated/' +"
);
source = source.replace(
  "encodeURIComponent(input.bucket) + '/' + encodeObjectPath(input.objectKey)\n        };",
  "encodeURIComponent(input.bucket) + '/' + encodeObjectPath(input.objectKey))\n        };"
);
source = source.replace('signedUrl: data.signedUrl,', 'signedUrl: toPublicSupabaseUrl(data.signedUrl),');
fs.writeFileSync(file, source);
console.log('patched', file);
