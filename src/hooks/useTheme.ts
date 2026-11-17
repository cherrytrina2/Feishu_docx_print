import { useEffect, useState } from 'react';
import { bitable } from '@lark-base-open/js-sdk';

export type Theme = 'LIGHT' | 'DARK';

/**
 * 订阅飞书多维表格主题变化，返回当前主题。
 * 调用方根据 theme 切换 CSS 变量或类名。
 */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>('LIGHT');

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const t = await bitable.bridge.getTheme();
        if (!cancelled) setTheme(t as Theme);
      } catch {
        // 非飞书环境（本地浏览器调试）忽略
      }
      try {
        off = bitable.bridge.onThemeChange((ev) => {
          if (!cancelled) setTheme(ev.data.theme as Theme);
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  return theme;
}
