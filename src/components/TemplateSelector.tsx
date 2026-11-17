import { useRef, useState } from 'react';
import type { TemplateMeta } from '../types';

interface TemplateSelectorProps {
  templates: TemplateMeta[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpload: (file: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenLibrary?: () => void;
}

export function TemplateSelector({
  templates,
  selectedId,
  onSelect,
  onUpload,
  onDelete,
  onOpenLibrary,
}: TemplateSelectorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const safeTemplates = Array.isArray(templates) ? templates : [];

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(file);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const selected = safeTemplates.find((t) => t.id === selectedId);

  return (
    <div className="template-selector">
      <div className="panel-title">
        我的模板
        <span className="panel-count">共 {safeTemplates.length} 个</span>
      </div>

      {safeTemplates.length === 0 ? (
        <div className="tpl-empty">
          <div>暂无模板，点击下方按钮从云端模板库导入，或直接上传 .docx 文件</div>
          <div className="tpl-empty-actions">
            {onOpenLibrary && (
              <button type="button" className="btn-primary btn-sm" onClick={onOpenLibrary}>
                打开模板库
              </button>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="btn-secondary btn-sm"
            >
              {busy ? '上传中...' : '直接上传'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <select
            value={selectedId ?? ''}
            onChange={(e) => onSelect(e.target.value || null)}
            className="tpl-select"
          >
            {!selectedId && <option value="">-- 请选择模板 --</option>}
            {safeTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="tpl-actions">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="btn-secondary btn-sm"
            >
              {busy ? '上传中...' : '上传替换'}
            </button>
            {selected && !selected.isBuiltin && (
              <button
                type="button"
                onClick={() => onDelete(selected.id)}
                className="btn-danger btn-sm"
              >
                删除
              </button>
            )}
          </div>
        </>
      )}

      {/* 文件选择器始终渲染，避免 ref 为 null */}
      <input
        ref={fileRef}
        type="file"
        accept=".docx"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      <div className="tpl-tip">
        Word 中用 <code>{'{字段名}'}</code> 插入文本，用 <code>{'{%图片字段}'}</code> 插入图片，用{' '}
        <code>{'{#明细字段}...{/明细字段}'}</code> 插入循环明细。
      </div>
    </div>
  );
}
