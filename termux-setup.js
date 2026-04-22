const { execSync } = require('child_process');

// 检查是否在 Termux 环境中
if (process.env.PREFIX && process.env.PREFIX.includes('com.termux')) {
  console.log('📱 检测到 Termux 环境，正在自动安装 sqlite3 编译所需的依赖...');
  try {
    // 自动更新并安装 python, make, clang 等编译工具
    execSync('pkg update && pkg install python make clang pkg-config binutils libsqlite -y', { 
      stdio: 'inherit' 
    });
    console.log('✅ Termux 编译依赖安装完成！');
  } catch (err) {
    console.error('❌ Termux 编译依赖安装失败，请尝试手动运行: pkg install python make clang pkg-config binutils libsqlite -y');
    process.exit(1);
  }
} else {
  console.log('🖥️ 非 Termux 环境，跳过特殊编译依赖安装。');
}
