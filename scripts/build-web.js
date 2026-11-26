const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'dist');
const configuredUrl = process.env.MULTIPLAYER_SERVER_URL?.trim();
let origin = '';

if (configuredUrl) {
    const url = new URL(configuredUrl);
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
        throw new Error('MULTIPLAYER_SERVER_URL must be an HTTPS origin, without a path or credentials.');
    }
    origin = url.origin;
}

fs.mkdirSync(output, { recursive: true });
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
fs.writeFileSync(path.join(output, 'index.html'), html.replace(
    '<meta name="multiplayer-server" content="">',
    `<meta name="multiplayer-server" content="${origin}">`
));

for (const directory of ['assets', 'sounds']) {
    fs.cpSync(path.join(root, directory), path.join(output, directory), { recursive: true });
}
