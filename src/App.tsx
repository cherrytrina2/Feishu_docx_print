import { useEffect, useState } from 'react';
import { useTheme } from './hooks/useTheme';
import { useSelection } from './hooks/useSelection';
import { TemplateSelector } from './components/TemplateSelector';
import { TemplateLibraryModal } from './components/TemplateLibrary';
import { TemplateMappingEditor } from './components/TemplateMappingEditor';
import { RecordFieldsPanel } from './components/RecordFieldsPanel';
import { ExportBar } from './components/ExportBar';
import { PrintPreviewModal } from './components/PrintPreviewModal';
import { EmptyState } from './components/EmptyState';
import { applyTemplateMapping } from './core/templateMapping';
import { renderTemplate, renderMergedTemplate } from './services/templateRenderer';
import {
  deleteTemplate,
  ensureBuiltinTemplate,
  getTemplate,
  listTemplates,
  saveTemplate,
  updateTemplateSettings,
} from './services/templateStore';
import {
  deleteCloudTemplate,
  createCloudTemplateFolder,
  getCloudTemplate,
  listCloudTemplateFolders,
  listCloudTemplates,
  saveCloudTemplate,
} from './services/cloudTemplateStore';
import { buildTemplateAudit } from './phase1';
import type { TemplateAuditReport } from './phase1';
import { saveAs } from 'file-saver';
import { DEFAULT_FILE_NAME_PATTERN, type TemplateFolder, type TemplateMeta, type TemplateSettings } from './types';

export default function App() {
  const theme = useTheme();
  const { data, loading, error, refresh, selectMulti, clear } = useSelection();
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [cloudTemplates, setCloudTemplates] = useState<TemplateMeta[]>([]);
  const [cloudFolders, setCloudFolders] = useState<TemplateFolder[]>([]);
  const [librarySelectedFolderId, setLibrarySelectedFolderId] = useState('');
  const [pendingLibraryUpload, setPendingLibraryUpload] = useState<{ templateId: string; templateName: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [templateAudit, setTemplateAudit] = useState<TemplateAuditReport | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const currentTemplate = templates.find((t) => t.id === selectedId) ?? null;
  const records = Array.isArray(data?.records) ? data.records : [];

  // 加载本地模板
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureBuiltinTemplate();
        const list = await listTemplates();
        if (cancelled) return;
        setTemplates(list);
        if (list.length > 0) setSelectedId(list[0].id);
      } catch (e) {
        if (!cancelled) setInitError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 加载云端模板（在模板库弹窗打开时加载）
  const loadCloudTemplates = async () => {
    setLibraryLoading(true);
    try {
      // 建表/补字段是对 Base 的写操作，串行执行可避免首次使用时的 schema 竞争。
      const folders = await listCloudTemplateFolders();
      const list = await listCloudTemplates();
      setCloudTemplates(list);
      setCloudFolders(folders);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setLibraryLoading(false);
    }
  };

  const openLibrary = async () => {
    setPendingLibraryUpload(null);
    setLibraryOpen(true);
    await loadCloudTemplates();
  };

  // 模板审核
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const currentRecords = Array.isArray(data?.records) ? data.records : [];
      if (!selectedId || currentRecords.length === 0) {
        if (!cancelled) setTemplateAudit(null);
        return;
      }
      try {
        const tpl = await getTemplate(selectedId);
        if (!tpl || cancelled) {
          if (!cancelled) setTemplateAudit(null);
          return;
        }
        const fieldNames = new Set<string>();
        for (const record of currentRecords) {
          const recordFields = Array.isArray(record.fields) ? record.fields : [];
          for (const field of recordFields) {
            fieldNames.add(field.name);
          }
        }
        const report = buildTemplateAudit(tpl.buffer, [...fieldNames], tpl.fieldMappings ?? {});
        if (!cancelled) setTemplateAudit(report);
      } catch {
        if (!cancelled) setTemplateAudit(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, selectedId, templates]);

  const reloadTemplates = async () => {
    await ensureBuiltinTemplate();
    const list = await listTemplates();
    setTemplates(list);
  };

  const handleUpload = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const name = file.name.replace(/\.docx$/i, '');
    await saveTemplate({ name, buffer });
    await reloadTemplates();
  };

  // 从云端导入到本地
  const handleCloudImport = async (id: string) => {
    const tpl = await getCloudTemplate(id);
    if (!tpl) {
      setErrors(['下载云端模板失败']);
      return;
    }
    const newId = await saveTemplate({
      name: tpl.name,
      buffer: tpl.buffer,
      fieldMappings: tpl.fieldMappings ?? {},
      fileNamePattern: tpl.fileNamePattern ?? DEFAULT_FILE_NAME_PATTERN,
    });
    await reloadTemplates();
    setSelectedId(newId);
    setLibraryOpen(false); // 导入后关闭弹窗
  };

  // 从云端删除
  const handleCloudDelete = async (id: string) => {
    await deleteCloudTemplate(id);
    await loadCloudTemplates();
  };

  const handleDelete = async (id: string) => {
    await deleteTemplate(id);
    const list = await listTemplates();
    setTemplates(list);
    if (selectedId === id) {
      // 回退到第一个可用模板
      setSelectedId(list.length > 0 ? list[0].id : null);
    }
  };

  const handleSaveMappings = async (templateId: string, settings: TemplateSettings) => {
    await updateTemplateSettings(templateId, settings);
    await reloadTemplates();
  };

  // 保存配置后在模板库选择一级文件夹，再确认上传。
  const handleSaveAndUpload = async (templateId: string, settings: TemplateSettings) => {
    await updateTemplateSettings(templateId, settings);
    await reloadTemplates();
    const tpl = await getTemplate(templateId);
    if (!tpl) {
      setErrors(['模板不存在']);
      return;
    }
    setErrors([]);
    setPendingLibraryUpload({ templateId, templateName: tpl.name });
    setLibraryOpen(true);
    await loadCloudTemplates();
  };

  const handleCreateCloudFolder = async (name: string) => {
    const folder = await createCloudTemplateFolder(name);
    setCloudFolders((previous) => [...previous, folder].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')));
    setLibrarySelectedFolderId(folder.id);
  };

  const handleConfirmLibraryUpload = async (folderId: string) => {
    const pending = pendingLibraryUpload;
    if (!pending) return;
    const tpl = await getTemplate(pending.templateId);
    if (!tpl) throw new Error('本地模板不存在，请重新选择模板后再上传');
    await saveCloudTemplate(
      tpl.name,
      tpl.buffer,
      tpl.fieldMappings ?? {},
      tpl.fileNamePattern ?? DEFAULT_FILE_NAME_PATTERN,
      folderId,
    );
    await loadCloudTemplates();
    setPendingLibraryUpload(null);
    setErrors([]);
  };

  const doRenderOne = async (recordData: Record<string, unknown>): Promise<Blob | null> => {
    if (!selectedId) return null;
    const tpl = await getTemplate(selectedId);
    if (!tpl) {
      setErrors(['模板不存在，请重新选择']);
      return null;
    }
    const mappedData = applyTemplateMapping(recordData, tpl.fieldMappings ?? {});
    const result = renderTemplate(tpl.buffer, mappedData);
    if (result.ok) return result.blob;
    setErrors(formatRenderErrors(result.errors));
    return null;
  };

  const handleDownload = async () => {
    if (records.length === 0) return;
    setBusy(true);
    setErrors([]);
    try {
      for (const record of records) {
        const blob = await doRenderOne(record.data);
        if (blob) {
          const mappedData = applyTemplateMapping(record.data, currentTemplate?.fieldMappings ?? {});
          saveAs(blob, buildExportFileName(mappedData, currentTemplate?.fileNamePattern));
        }
      }
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadAll = async () => {
    if (records.length <= 1) return;
    setBusy(true);
    setErrors([]);
    try {
      const tpl = await getTemplate(selectedId!);
      if (!tpl) {
        setErrors(['模板不存在']);
        return;
      }
      const recordsData = records.map((r) => applyTemplateMapping(r.data, tpl.fieldMappings ?? {}));
      const result = renderMergedTemplate(tpl.buffer, recordsData);
      if (result.ok) {
        saveAs(result.blob, `运费发票-批量-${Date.now()}.docx`);
      } else {
        setErrors(formatRenderErrors(result.errors));
      }
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = async () => {
    if (records.length === 0) return;
    setBusy(true);
    setErrors([]);
    try {
      if (records.length === 1) {
        const blob = await doRenderOne(records[0].data);
        if (blob) setPreviewBlob(blob);
      } else {
        const tpl = await getTemplate(selectedId!);
        if (!tpl) {
          setErrors(['模板不存在']);
          return;
        }
        const recordsData = records.map((r) => applyTemplateMapping(r.data, tpl.fieldMappings ?? {}));
        const result = renderMergedTemplate(tpl.buffer, recordsData);
        if (result.ok) {
          setPreviewBlob(result.blob);
        } else {
          setErrors(formatRenderErrors(result.errors));
        }
      }
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  };

  const recordCount = records.length;
  const hasData = recordCount > 0;

  const themeClass = theme === 'DARK' ? 'theme-dark' : 'theme-light';

  return (
    <div className={`app ${themeClass}`}>
      <header className="app-header no-print">
        <h1>Word 模板打印</h1>
        <div className="header-actions">
          <button
            type="button"
            onClick={selectMulti}
            className="btn-secondary btn-sm"
            disabled={loading}
            title="从多维表格中勾选多条记录"
          >
            选择多条记录
          </button>
          <button
            type="button"
            onClick={openLibrary}
            className="btn-primary btn-sm"
            title="打开云端模板库（团队共享）"
          >
            模板库
          </button>
          <button
            type="button"
            onClick={refresh}
            className="btn-refresh"
            disabled={loading}
            title="重新读取当前选中记录"
          >
            {loading ? '刷新中…' : '刷新'}
          </button>
          {hasData && recordCount > 1 && (
            <button
              type="button"
              onClick={clear}
              className="btn-refresh"
              title="清除选中数据"
            >
              清除
            </button>
          )}
        </div>
      </header>

      {initError && (
        <div className="alert alert-error no-print">
          初始化失败：{initError}
        </div>
      )}

      <TemplateSelector
        templates={templates}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUpload={handleUpload}
        onDelete={handleDelete}
        onOpenLibrary={openLibrary}
      />

      <TemplateMappingEditor
        template={currentTemplate}
        audit={templateAudit}
        fieldNames={records.flatMap((r) => (Array.isArray(r.fields) ? r.fields : []).map((f) => f.name))}
        onSave={handleSaveMappings}
        onSaveAndUpload={handleSaveAndUpload}
      />

      {templateAudit && (
        <div className="phase1-audit no-print">
          <div className="panel-title">一期检查</div>
          <div className="phase1-audit-summary">
            标签 {templateAudit.tags.length} 个，已匹配 {templateAudit.matchedCount} 个，缺失 {templateAudit.missing.length} 个
          </div>
          {templateAudit.missing.length > 0 ? (
            <div className="phase1-audit-missing">
              <span className="phase1-audit-label">未匹配：</span>
              <span>{templateAudit.missing.join('、')}</span>
            </div>
          ) : (
            <div className="phase1-audit-ok">当前模板标签已全部匹配</div>
          )}
        </div>
      )}

      {error && <div className="alert alert-error no-print">{error}</div>}

      {loading && !data && <div className="loading-tip no-print">读取记录中…</div>}

      {!data && !loading && !error && (
        <EmptyState
          message="未选中记录"
          hint="请在多维表格中点击任意单元格，或点击上方「选择多条记录」"
        />
      )}

      {hasData && (
        <RecordFieldsPanel multiData={{ records }} />
      )}

      {errors.length > 0 && (
        <div className="alert alert-error no-print">
          <div className="alert-title">模板渲染出现错误：</div>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <ExportBar
        recordCount={recordCount}
        onDownload={handleDownload}
        onDownloadAll={recordCount > 1 ? handleDownloadAll : undefined}
        onPrint={handlePrint}
        disabled={!hasData || !selectedId}
        busy={busy}
      />

      <TemplateLibraryModal
        open={libraryOpen}
        onClose={() => {
          setLibraryOpen(false);
          setPendingLibraryUpload(null);
        }}
        templates={cloudTemplates}
        folders={cloudFolders}
        selectedFolderId={librarySelectedFolderId}
        onSelectFolder={setLibrarySelectedFolderId}
        onCreateFolder={handleCreateCloudFolder}
        pendingUpload={pendingLibraryUpload ? { templateName: pendingLibraryUpload.templateName } : null}
        onConfirmUpload={handleConfirmLibraryUpload}
        onImport={handleCloudImport}
        onDelete={handleCloudDelete}
        isCloud={true}
        loading={libraryLoading}
      />

      <PrintPreviewModal blob={previewBlob} onClose={() => setPreviewBlob(null)} />
    </div>
  );
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

function buildExportFileName(data: Record<string, unknown>, pattern: string | undefined): string {
  const rawPattern = (pattern?.trim() || DEFAULT_FILE_NAME_PATTERN).replace(/\.docx$/i, '');
  const rendered = rawPattern.replace(/\{([^{}]+)\}/g, (_match, rawFieldName: string) => {
    const fieldName = rawFieldName.trim();
    return formatFilenamePart(readFilenameValue(data, fieldName));
  });
  return `${sanitizeFileName(rendered || '导出文件')}.docx`;
}

/** 命名规则优先读占位符同名字段；默认主/分单号兼容常见英文列名。 */
function readFilenameValue(data: Record<string, unknown>, fieldName: string): unknown {
  if (Object.prototype.hasOwnProperty.call(data, fieldName)) return data[fieldName];
  const aliases: Record<string, string[]> = {
    主单号: ['Master B/L', 'Master BL', 'B/L', 'MAWB'],
    分单号: ['House B/L', 'House BL', 'H/B', 'HAWB'],
  };
  for (const alias of aliases[fieldName] ?? []) {
    if (Object.prototype.hasOwnProperty.call(data, alias)) return data[alias];
  }
  return undefined;
}

function formatFilenamePart(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未填写';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    return text ? sanitizeFileName(text) : '未填写';
  }
  if (Array.isArray(value)) {
    const text = value.map(formatFilenamePart).filter((part) => part !== '未填写').join('-');
    return text || '未填写';
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return formatFilenamePart(object.text ?? object.name ?? object.value ?? object.content);
  }
  return '未填写';
}

function formatRenderErrors(errors: unknown): string[] {
  if (!Array.isArray(errors)) return ['模板渲染失败，请检查模板字段或重新选择模板'];
  return errors.map((e) => {
    if (e && typeof e === 'object') {
      const detail = e as { field?: unknown; message?: unknown };
      const message = String(detail.message ?? '模板渲染失败');
      return detail.field ? `[${String(detail.field)}] ${message}` : message;
    }
    return String(e);
  });
}
