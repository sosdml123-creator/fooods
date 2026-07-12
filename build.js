const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  const frontendDir = path.join(__dirname, 'frontend');

  console.log('📦 Installing frontend dependencies inside /frontend...');
  execSync('npm install --legacy-peer-deps', { cwd: frontendDir, stdio: 'inherit' });

  console.log('🚀 Running Vite production build inside /frontend...');
  execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });

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
