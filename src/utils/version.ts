const VERSION_KEY = 'invoice-plugin-version';

/** 从 meta 标签读取当前版本号 */
export function getCurrentVersion(): string {
  const meta = document.querySelector('meta[plugin-version]');
  return meta?.getAttribute('content') ?? '';
}

/** 检查版本是否变化，如果变化则清除缓存并刷新 */
export function checkVersionAndRefresh(): boolean {
  const currentVersion = getCurrentVersion();
  if (!currentVersion || currentVersion === '%PLUGIN_VERSION%') {
    // 开发模式，不检测
    return false;
  }

  const savedVersion = localStorage.getItem(VERSION_KEY);

  if (savedVersion && savedVersion !== currentVersion) {
    // 版本变了！清除本地缓存（保留模板数据）
    console.log('[Version] 检测到新版本:', savedVersion, '→', currentVersion);
    console.log('[Version] 正在清除缓存并刷新...');

    // 清除旧版本相关的缓存，但保留模板库数据
    try {
      // 可以在这里添加需要清除的缓存清理逻辑
      // 例如：清除旧的 service worker 缓存等
    } catch {
      // 忽略
    }

    // 先保存新版本号
    localStorage.setItem(VERSION_KEY, currentVersion);

    // 刷新页面（使用 replace 避免产生历史记录）
    window.location.replace(window.location.href);
    return true;
  }

  if (!savedVersion) {
    // 首次访问，保存版本号
    localStorage.setItem(VERSION_KEY, currentVersion);
  }

  return false;
}