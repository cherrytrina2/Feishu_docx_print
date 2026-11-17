import { useEffect, useMemo, useState } from 'react';
import type { TemplateAuditReport } from '../phase1';
import { DEFAULT_FILE_NAME_PATTERN, type TemplateMeta, type TemplateSettings } from '../types';

interface TemplateMappingEditorProps {
  template: TemplateMeta | null;
  audit: TemplateAuditReport | null;
  fieldNames: string[];
  onSave: (templateId: string, settings: TemplateSettings) => Promise<void>;
  onSaveAndUpload?: (templateId: string, settings: TemplateSettings) => Promise<void>;
}

export function TemplateMappingEditor({
  template,
  audit,
  fieldNames,
  onSave,
  onSaveAndUpload,
}: TemplateMappingEditorProps) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [fileNamePattern, setFileNamePattern] = useState(DEFAULT_FILE_NAME_PATTERN);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const templateId = template?.id ?? '';
  const tags = Array.isArray(audit?.tags) ? audit.tags : [];

  useEffect(() => {
    setDraft(template?.fieldMappings ?? {});
    setFileNamePattern(template?.fileNamePattern ?? DEFAULT_FILE_NAME_PATTERN);
  }, [templateId, template?.fieldMappings]);

  const fields = useMemo(() => {
    const safeFieldNames = Array.isArray(fieldNames) ? fieldNames : [];
    return [...new Set(safeFieldNames)].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [fieldNames]);

  const settings = (): TemplateSettings => ({
    fieldMappings: Object.fromEntries(Object.entries(draft).filter(([, value]) => value)),
    fileNamePattern: fileNamePattern.trim() || DEFAULT_FILE_NAME_PATTERN,
  });

  const handleSave = async () => {
    if (!template) return;
    setBusy(true);
    setMessage(null);
    try {
      await onSave(template.id, settings());
      setMessage('配置已保存');
    } catch (error) {
      setMessage(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAndUpload = async () => {
    if (!template || !onSaveAndUpload) return;
    setBusy(true);
    setMessage(null);
    try {
      await onSaveAndUpload(template.id, settings());
      setMessage('配置已保存，请在模板库选择文件夹并确认上传');
    } catch (error) {
      setMessage(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  // 没有模板时显示提示
  if (!template) {
    return (
      <div className="mapping-editor no-print">
        <div className="panel-title">字段映射</div>
        <div className="mapping-hint">请先选择一个模板</div>
      </div>
    );
  }

  return (
    <div className="mapping-editor no-print">
      <div className="panel-title">字段映射</div>
      <div className="mapping-hint">
        {audit
          ? `这个模板里检测到 ${tags.length} 个占位符。可以把模板名映射到实际字段名，导出时会自动套用。`
          : '暂未读取到当前表字段；仍可保存已有映射、配置导出文件名，或上传模板。选中一条记录后可编辑字段映射。'}
      </div>
      <div className="mapping-list">
        {tags.map((tag) => (
          <div key={`${tag.kind}:${tag.name}`} className="mapping-row">
            <div className="mapping-tag">
              <span className="mapping-kind">{tag.kind}</span>
              <span className="mapping-name">{tag.raw}</span>
            </div>
            <select
              className="mapping-select"
              value={draft[tag.name] ?? ''}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  [tag.name]: e.target.value,
                }))
              }
            >
              <option value="">保持同名</option>
              {fields.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <label className="filename-rule">
        <span className="filename-rule-title">导出文件名规则</span>
        <input
          value={fileNamePattern}
          onChange={(event) => setFileNamePattern(event.target.value)}
          placeholder={DEFAULT_FILE_NAME_PATTERN}
          maxLength={120}
        />
        <span className="filename-rule-hint">使用 <code>{'{字段名}'}</code> 插入字段值；扩展名 <code>.docx</code> 会自动补上。</span>
      </label>
      <div className="mapping-actions">
        <button type="button" className="btn-primary btn-sm" onClick={handleSave} disabled={busy}>
          {busy ? '保存中...' : '保存配置'}
        </button>
        {onSaveAndUpload && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={handleSaveAndUpload}
            disabled={busy}
            title="保存映射和命名规则后，在模板库中选择一级文件夹上传"
          >
            {busy ? '准备中...' : '保存并选择文件夹上传'}
          </button>
        )}
      </div>
      {message && <div className={message.startsWith('保存失败') ? 'mapping-message mapping-message-error' : 'mapping-message'}>{message}</div>}
    </div>
  );
}
