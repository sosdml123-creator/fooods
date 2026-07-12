const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 재귀적으로 폴더를 복사하는 헬퍼 함수
function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

try {
  const frontendDir = path.join(__dirname, 'frontend');
  const backendWwwDir = path.join(__dirname, 'backend', 'www');
  const rootDistDir = path.join(__dirname, 'dist');

  // ==========================================
  // [1/6] Installing frontend packages...
  // ==========================================
  console.log('\n[1/6] 📦 Installing frontend packages...');
  const buildEnv = { ...process.env, NODE_ENV: 'development' };
  
  try {
    console.log('🤖 Trying fast clean install (npm ci)...');
    execSync('npm ci --include=dev --no-audit --no-fund', { 
      cwd: frontendDir, 
      stdio: 'inherit',
      env: buildEnv
    });
  } catch (ciError) {
    console.warn('⚠️ npm ci failed. Falling back to standard npm install...');
    execSync('npm install --include=dev --legacy-peer-deps --no-audit --no-fund', { 
      cwd: frontendDir, 
      stdio: 'inherit',
      env: buildEnv
    });
  }

  // ==========================================
  // [2/6] Building frontend...
  // ==========================================
  console.log('\n[2/6] 🚀 Building frontend (Vite Compile)...');
  execSync('npm run build', { 
    cwd: frontendDir, 
    stdio: 'inherit',
    env: buildEnv
  });

  // ==========================================
  // [3/6] Copying build...
  // ==========================================
  console.log('\n[3/6] 📂 Copying build output to root /dist folder...');
  if (!fs.existsSync(backendWwwDir)) {
    throw new Error(`Vite build directory not found at: ${backendWwwDir}`);
  }
  
  // 기존 루트 dist 폴더가 있다면 말끔히 삭제 후 갱신 복사
  if (fs.existsSync(rootDistDir)) {
    fs.rmSync(rootDistDir, { recursive: true, force: true });
  }
  copyFolderSync(backendWwwDir, rootDistDir);
  console.log('✅ Sync completed: backend/www/ -> dist/');

  // ==========================================
  // [4/6] Preparing backend...
  // ==========================================
  console.log('\n[4/6] ⚙️ Preparing backend serverless bindings...');
  const apiIndexExists = fs.existsSync(path.join(__dirname, 'api', 'index.js'));
  console.log(`api/index.js exists: ${apiIndexExists}`);

  // ==========================================
  // [5/6] Finalizing...
  // ==========================================
  console.log('\n[5/6] 🔍 Finalizing and verifying build artifacts...');
  const finalIndexPath = path.join(rootDistDir, 'index.html');
  const exists = fs.existsSync(finalIndexPath);
  console.log(`dist/index.html verified: ${exists}`);

  if (!exists) {
    throw new Error('Critical build asset (dist/index.html) was not found in final target!');
  }

  // ==========================================
  // [6/6] Build Complete
  // ==========================================
  console.log('\n[6/6] ✨ Build Complete! Vercel project is ready to serve.\n');

} catch (error) {
  console.error('\n❌ Build failed with error:', error.message);
  process.exit(1);
}
