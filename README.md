# 多维表格 Word 模板打印插件

飞书多维表格「设计 Word 模板 + 填充字段数据」打印插件。用 Word 当设计器写占位符，读取多维表格选中记录，用 docxtemplater 渲染生成 docx 并支持浏览器打印。功能等价于飞书官方收费「排版打印」插件。

## 功能特性

- 📋 **自动读取选中记录**：在多维表格选中任意记录，插件自动拉取并按字段类型解析
- 📝 **Word 模板渲染**：用 docxtemplater 把字段值灌入 `.docx` 模板，支持文本/循环/条件
- 🖼️ **图片插入**：附件字段（印章、Logo）通过 `{%字段名}` 插入到 Word
- 📁 **模板管理**：内置默认运费发票模板，支持上传自定义 `.docx` 模板（存浏览器 IndexedDB）
- 🖨️ **打印预览**：生成 docx 后用 docx-preview 渲染，调起浏览器打印对话框
- 🌗 **深浅主题**：跟随飞书多维表格主题切换

## 技术栈

| 能力 | 选型 |
|---|---|
| 构建 | Vite + React 18 + TypeScript |
| 数据源 | `@lark-base-open/js-sdk` |
| 渲染引擎 | `docxtemplater` + `pizzip` |
| 图片模块 | `docxtemplater-image-module-free` |
| 下载 | `file-saver` |
| 模板存储 | `idb`（IndexedDB） |
| 打印预览 | `docx-preview` |
| 日期 | `dayjs` |

## 开发

```bash
# 安装依赖
npm install

# 本地开发（默认端口 5173）
npm run dev

# 构建（会先生成内置模板再打包）
npm run build

# 仅重新生成内置默认模板
npm run gen:template
```

> 构建产物在 `dist/`，`package.json` 已配置 `"output": "dist"` 供飞书部署使用。

## 接入飞书多维表格

1. `npm run dev` 启动本地服务（`http://localhost:5173/`）
2. 打开任意飞书多维表格 → 点击「插件」→「自定义插件」→「+ 新增插件」
3. 填入运行地址 `http://localhost:5173/`，确定
4. 在数据表里选中一条记录，回到插件即可使用

## 部署

飞书要求 HTTPS 协议。把 `dist/` 部署到任意 HTTPS 静态托管（Vercel / GitHub Pages / 自有服务器），然后在多维表格「自定义插件」填入部署地址。

> `vite.config.ts` 中 `base: './'` 是飞书部署的必需配置，请勿删除。

## 模板占位符语法

在 Word（或 WPS）里设计模板，按以下语法写占位符。**注意：占位符要整体输入，避免被输入法/自动更正拆成多段格式不同的文字，否则 docxtemplater 会报"未闭合标签"错误。**

### 文本占位符

```
发票号码：{发票号码}
客户名称：{客户名称}
开票日期：{开票日期}
合计金额：{合计金额}
```

占位符的 key 就是多维表格的**字段名**（支持中文）。

### 图片占位符

附件字段用 `{%字段名}` 语法（注意百分号）：

```
印章：{%印章}
```

附件字段取第一个附件的图片插入，等比缩放到最大 200px。

### 循环（多行明细）

明细表格行用 `{#字段名}...{/字段名}` 包裹。docxtemplater 会复制该表格行 N 次：

```
| 项目名称           | 数量    | 单价    | 小计              |
| {#items}{项目名称} | {数量}  | {单价}  | {小计}{/items}    |
```

`items` 需为对象数组。本插件默认按字段名扁平化，如需循环明细，可在数据层扩展为子表读取。

### 条件

```
{#is_paid}已付款{/is_paid}{^is_paid}未付款{/is_paid}
```

## 字段类型映射

插件按多维表格字段类型自动解析为字符串：

| 字段类型 | 解析结果 |
|---|---|
| 多行文本 | 拼接为纯文本 |
| 数字 / 货币 / 进度 / 评分 | 数值字符串 |
| 单选 | 选项文本 |
| 多选 | 用 `、` 连接 |
| 日期 / 创建时间 / 修改时间 | `YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm` |
| 复选框 | 是 / 否 |
| 人员 | 用 `、` 连接姓名 |
| 电话 / 邮箱 | 原文 |
| 超链接 | 链接文本 |
| 自动编号 | 原文 |
| 附件 | 取第一个附件作为图片（`{%字段名}`） |

## 项目结构

```
├── public/templates/default-invoice.docx   # 内置默认模板（由 scripts 生成）
├── scripts/generate-template.mjs           # 内置模板生成脚本
├── src/
│   ├── App.tsx                             # 主界面
│   ├── components/                         # UI 组件
│   ├── services/
│   │   ├── dataService.ts                  # 读取选中记录
│   │   ├── fieldParser.ts                  # 字段值解析
│   │   ├── attachmentService.ts            # 附件转二进制
│   │   ├── templateRenderer.ts             # docxtemplater 渲染
│   │   └── templateStore.ts                # IndexedDB 模板存储
│   ├── hooks/                              # useTheme / useSelection
│   └── types.ts
├── vite.config.ts
└── package.json
```

## 已知限制

- docxtemplater 免费版覆盖文本/循环/条件/图片，动态图表等高级效果需付费模块
- PDF 高保真转换需后端 LibreOffice，本插件用浏览器打印替代
- 附件临时 URL 有效期 10 分钟，生成后请及时下载
- 占位符若被 Word 拆成多段 run 会渲染失败，建议整体输入后再统一设格式
