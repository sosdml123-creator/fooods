const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'www');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// Copy HTML file
fs.copyFileSync(
  path.join(__dirname, 'index.html'),
  path.join(distDir, 'index.html')
);

// Copy CSS file
fs.copyFileSync(
  path.join(__dirname, 'style.css'),
  path.join(distDir, 'style.css')
);

// Copy Landing HTML file
fs.copyFileSync(
  path.join(__dirname, 'landing.html'),
  path.join(distDir, 'landing.html')
);

// Copy app.js if exists
if (fs.existsSync(path.join(__dirname, 'app.js'))) {
  fs.copyFileSync(
    path.join(__dirname, 'app.js'),
    path.join(distDir, 'app.js')
  );
}

// Copy privacy.html if exists
if (fs.existsSync(path.join(__dirname, 'privacy.html'))) {
  fs.copyFileSync(
    path.join(__dirname, 'privacy.html'),
    path.join(distDir, 'privacy.html')
  );
}

// Copy terms.html if exists
if (fs.existsSync(path.join(__dirname, 'terms.html'))) {
  fs.copyFileSync(
    path.join(__dirname, 'terms.html'),
    path.join(distDir, 'terms.html')
  );
}

// Copy assets folder if exists
const assetsSrc = path.join(__dirname, 'assets');
const assetsDest = path.join(distDir, 'assets');
if (fs.existsSync(assetsSrc)) {
  fs.cpSync(assetsSrc, assetsDest, { recursive: true });
}

console.log('✨ Web assets successfully copied to the /www folder!');
