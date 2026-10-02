// Build a standalone offline document from the canonical UI and shared modules.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const name of ['parser.js', 'calendar.js']) {
  const tag = '<script src="' + name + '"></script>';
  if (!html.includes(tag)) throw new Error('Missing script reference: ' + name);
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  html = html.replace(tag, () => '<script>\n' + source.replace(/<\/script/gi, '<\\/script') + '\n</script>');
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/rebet.html'), html);
console.log('wrote dist/rebet.html (' + Buffer.byteLength(html) + ' bytes)');

// Publish only the app, not source fixtures or project documentation.
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/index.html'), html);
fs.writeFileSync(path.join(root, 'docs/.nojekyll'), '');
console.log('wrote docs/index.html for GitHub Pages');
