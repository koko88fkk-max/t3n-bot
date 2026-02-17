const https = require('https');
const fs = require('fs');

const url = 'https://github.com/google/fonts/raw/main/ofl/cairo/static/Cairo-Bold.ttf';

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                download(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => { fs.unlink(dest, () => { }); reject(err); });
    });
}

download(url, 'assets/Cairo-Bold.ttf')
    .then(() => console.log('✅ Font downloaded!'))
    .catch(e => console.error('❌', e.message));
