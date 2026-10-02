// Builds dist/rebet.html: index.html with parser.js inlined, so it is one file you can save and open anywhere.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const parser = fs.readFileSync(path.join(root, 'parser.js'), 'utf8');
const tag = '<script src="parser.js"></script>';
if (!html.includes(tag)) throw new Error('index.html no longer references parser.js; update scripts/build-single.js');
const inline = '<script>\n' + parser.replace(/<\/script/gi, '<\\/script') + '\n</script>';
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/rebet.html'), html.replace(tag, () => inline));
console.log('wrote dist/rebet.html (' + fs.statSync(path.join(root, 'dist/rebet.html')).size + ' bytes)');
