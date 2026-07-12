const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  console.log('📦 Installing frontend dependencies...');
  execSync('npm --prefix frontend install', { stdio: 'inherit' });

  console.log('🚀 Running Vite production build...');
  execSync('npm --prefix frontend run build', { stdio: 'inherit' });

  // www/index.html 존재 여부 확인
  const indexPath = path.join(__dirname, 'www', 'index.html');
  const exists = fs.existsSync(indexPath);

  console.log('✨ Build completed.');
  console.log(`www/index.html exists: ${exists}`);

  if (!exists) {
    throw new Error('Vite build output (www/index.html) was not found!');
  }

} catch (error) {
  console.error('❌ Build failed with error:', error.message);
  process.exit(1);
}
