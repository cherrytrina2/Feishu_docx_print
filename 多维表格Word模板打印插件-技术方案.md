# 多维表格「设计 Word 模板 + 填充字段数据」打印插件 — 技术方案

## 1. 需求背景

参考飞书多维表格官方插件"排版打印"的能力：用户可以在多维表格的某条记录（或整表记录）上，
按照预先设计好的 Word/版式结构，把该记录的字段值自动填充到指定位置，生成可打印或导出为
PDF 的文档（如出入库单、发票、合同、员工档案等）。

目标：不依赖飞书官方收费插件，用开源组件自己实现一个功能等价的插件/工具。

## 2. 结论：没有现成的"拖拽设计版式 + 绑定多维表格字段"开源整合项目

调研结论：
- 市面上有零散的"多维表格打印插件"开源项目（如 `nullwuwu/lark-table-printing-plugin`），
  但它们只是**按字段列表顺序打印**，不支持像 Word 那样自由设计版式结构（页眉、印章位置、
  表格嵌套、图文混排等）。
- 真正能做"设计 Word 结构 + 填充字段"的能力，来自通用的 **Word 模板引擎**，需要自己把它和
  多维表格的数据源、以及一个模板管理界面组合起来。

因此推荐的实现路径是"组合方案"，而不是找一个大而全的现成插件。

## 3. 推荐技术组合

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌───────────────────────┐
│  Word 模板设计        │     │  多维表格数据读取           │     │  模板渲染引擎            │
│  (占位符 {字段名})     │ ──► │  (SDK 拉取选中记录的字段值)  │ ──► │  (docxtemplater 等)     │
└─────────────────────┘     └──────────────────────────┘     └───────────────────────┘
                                                                          │
                                                                          ▼
                                                          生成填好数据的 docx/pdf，供下载/打印
```

### 3.1 模板设计层：用 Word 本身当"设计器"

不需要额外做一个可视化设计器，直接让用户用 Word（或 WPS）设计版式：

- 在需要插入字段值的位置，写入占位符，例如：`{invoice_no}`、`{amount}`、`{customer_name}`
- 需要循环生成的表格行（比如发票明细多行），用循环语法包裹：
  ```
  {#items}
  {item_name}    {quantity}    {unit_price}
  {/items}
  ```
- 需要按条件显示/隐藏某段内容，用条件语法包裹：
  ```
  {#is_paid}已付款{/is_paid}{^is_paid}未付款{/is_paid}
  ```
- 图片、印章等可以用图片模块的占位符替换

这样，"设计 Word 结构"这件事完全交给 Word 完成，用户体验和飞书插件里拖拽布局的效果类似
（所见即所得），只是工具换成了 Word。

### 3.2 数据读取层：多维表格 SDK

以飞书多维表格为例，使用官方 **Base JS SDK**（`@lark-base-open/js-sdk`）：

- 文档：https://lark-base-team.github.io/js-sdk-docs/zh/
- 核心用法：
  ```javascript
  import { bitable } from '@lark-base-open/js-sdk';

  // 获取当前激活的数据表
  const table = await bitable.base.getActiveTable();

  // 获取用户当前选中的记录
  const selection = await bitable.base.getSelection();
  const recordId = selection.recordId;

  // 获取该记录的所有字段值
  const record = await table.getRecordById(recordId);
  const fieldMetaList = await table.getFieldMetaList();
  ```
- 拿到字段值后，整理成一个普通的 JS 对象，例如：
  ```javascript
  const data = {
    invoice_no: 'B16I202607000022',
    amount: 12000,
    customer_name: '示例公司',
    items: [
      { item_name: '运费', quantity: 1, unit_price: 12000 }
    ]
  };
  ```

> 如果不是飞书多维表格，而是其他系统（如 Vika 维格表、SeaTable、NocoDB、Airtable、自建数据库），
> 替换成对应的开放 API 即可，本质都是"读取一条记录的字段 → 组装成 JSON 对象"，
> 后面的渲染逻辑完全不变。

### 3.3 渲染层：docxtemplater（核心引擎）

- 开源仓库：https://github.com/open-xml-templating/docxtemplater
- 官网/文档：https://docxtemplater.com/
- 核心能力免费开源（AGPL），部分高级模块（如某些复杂图表）为付费扩展，但发票、合同这类
  常规场景用免费核心功能即可覆盖
- 支持：文本占位符替换、循环（生成多行表格）、条件显示、图片替换、页眉页脚、
  Word/PPT/Excel 模板均可处理

基本调用示例（Node.js / 浏览器通用思路）：

```javascript
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

// 1. 读取设计好的 Word 模板（二进制）
const content = await fetch('/templates/invoice-template.docx').then(r => r.arrayBuffer());

// 2. 用 pizzip 解压 docx（docx 本质是一个 zip 包）
const zip = new PizZip(content);

// 3. 初始化 docxtemplater
const doc = new Docxtemplater(zip, {
  paragraphLoop: true,
  linebreaks: true,
});

// 4. 把从多维表格读到的数据灌入模板
doc.render(data);

// 5. 导出生成好的 docx 文件
const buf = doc.getZip().generate({ type: 'blob' });

// 6. 触发浏览器下载，或进一步转成 PDF 打印
saveAs(buf, `invoice_${data.invoice_no}.docx`);
```

如果需要直接生成 PDF 供打印（而不是先下载 docx 再手动转 PDF），可以：
- 前端方案：生成 docx 后调用 LibreOffice / 云端转换服务转 PDF
- 后端方案：把上述渲染逻辑搬到 Node.js 服务端，用 `libreoffice-convert` 等库把 docx 转 PDF 后返回

### 3.4 参考的同类开源项目

| 项目 | 地址 | 作用 |
|---|---|---|
| lark-table-printing-plugin | https://github.com/nullwuwu/lark-table-printing-plugin | 飞书多维表格打印插件（字段列表式打印，可参考插件工程结构、SDK 用法） |
| docxtemplater | https://github.com/open-xml-templating/docxtemplater | Word/PPT/Excel 模板渲染引擎，本方案的核心 |
| docxtemplater-cli | https://github.com/open-xml-templating/docxtemplater-cli | 命令行版本，适合批量/自动化生成场景 |
| Base JS SDK 文档 | https://lark-base-team.github.io/js-sdk-docs/zh/ | 飞书多维表格插件开发官方文档 |

## 4. 落地步骤建议

1. **确定数据源**：明确是飞书多维表格，还是其他系统（Vika/SeaTable/自建数据库等），
   确认其开放 API 或 SDK 能否读取"选中记录的字段值"。
2. **设计 Word 模板**：拿一份真实业务文档（如发票、合同）为基础，在需要动态填充的位置
   替换成 `{字段名}` 占位符，明细表格部分用 `{#items}...{/items}` 循环语法包裹。
3. **搭建最小可跑通的渲染脚本**：先写一个本地脚本，手动传入一份 JSON 测试数据，
   验证 docxtemplater 能正确渲染出预期的 docx。
4. **接入真实数据源**：把第 3 步里手写的 JSON，替换成从多维表格 SDK/API 实时读取的数据。
5. **（可选）UI 封装**：
   - 如果是飞书插件，用 `@lark-base-open/js-sdk` + 前端框架（Vue/React）做一个侧边栏插件，
     界面上放"选择模板"“打印/导出”按钮
   - 如果是独立工具，可以做成一个小型 Web 页面或桌面工具，用户上传模板 + 选择数据表 +
     点击生成
6. **（可选）批量与自动化**：结合定时任务或多维表格的自动化触发器，实现"新增记录时
   自动生成 PDF 并存回附件字段"这类飞书原插件里的高级功能。

## 5. 已知限制与注意事项

- docxtemplater 的免费开源版本覆盖绝大多数常规场景（文本、循环、条件、图片、表格），
  但一些高级效果（如动态图表、复杂分栏排版）可能需要额外付费模块或自行用 OOXML 处理。
- Word 占位符语法需要注意：占位符前后不能被 Word 自动拆成多个 run（比如输入法/自动更正
  把 `{invoice_no}` 拆成了多段带不同格式的文字），建议先整体输入占位符文字，再统一设置格式，
  避免渲染时报"未闭合标签"错误。
- 若目标是生成"盖章扫描件"效果的 PDF，需要额外引入 docx→PDF 转换环节
  （浏览器端较难做到高保真转换，建议放到服务端用 LibreOffice 处理）。
