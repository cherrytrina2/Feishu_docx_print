import { useMemo, useState } from 'react';
import type { TemplateFolder, TemplateMeta } from '../types';

interface TemplateLibraryProps {
  templates: TemplateMeta[];
  folders: TemplateFolder[];
  selectedFolderId: string;
  onSelectFolder: (folderId: string) => void;
  onImport: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isCloud?: boolean;
  loading?: boolean;
}

export function TemplateLibrary({
  templates,
  folders,
  selectedFolderId,
  onSelectFolder,
  onImport,
  onDelete,
  isCloud = false,
  loading = false,
}: TemplateLibraryProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const safeTemplates = Array.isArray(templates) ? templates : [];
  const safeFolders = Array.isArray(folders) ? folders : [];
  const visibleTemplates = useMemo(
    () => selectedFolderId ? safeTemplates.filter((template) => template.folderId === selectedFolderId) : safeTemplates,
    [safeTemplates, selectedFolderId],
  );
  const folderNames = new Map(safeFolders.map((folder) => [folder.id, folder.name]));

  return (
    <div className="template-library">
      <div className="panel-title">
        {isCloud ? '云端模板库' : '模板库'}
        <span className="panel-count">共 {visibleTemplates.length} 个</span>
      </div>
      {isCloud && (
        <label className="library-folder-filter">
          <span>一级文件夹</span>
          <select className="mapping-select" value={selectedFolderId} onChange={(event) => onSelectFolder(event.target.value)}>
            <option value="">全部文件夹</option>
            {safeFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
        </label>
      )}
      {errorMsg && <div className="library-error" role="alert">⚠️ {errorMsg}</div>}
      <div className="library-list">
        {loading ? <div className="library-empty">加载中...</div>
          : visibleTemplates.length === 0 ? <div className="library-empty">{selectedFolderId ? '此文件夹暂无模板' : '暂无云端模板'}</div>
          : visibleTemplates.map((tpl) => {
            const hasMappings = Boolean(tpl.fieldMappings && Object.keys(tpl.fieldMappings).length);
            return (
              <div key={tpl.id} className="library-item">
                <div className="library-meta">
                  <div className="library-name">{tpl.name}{hasMappings && <span className="library-badge">含映射</span>}</div>
                  <div className="library-sub">
                    {tpl.folderId ? `文件夹：${folderNames.get(tpl.folderId) ?? '未找到文件夹'} · ` : '未分类 · '}
                    命名：{tpl.fileNamePattern ?? '默认规则'}
                  </div>
                </div>
                <div className="library-actions">
                  <button type="button" className="btn-primary btn-sm" onClick={async () => {
                    setErrorMsg(null);
                    try { await onImport(tpl.id); } catch (error) { setErrorMsg(error instanceof Error ? error.message : String(error)); }
                  }}>加入我的模板</button>
                  <button type="button" className="btn-danger btn-sm" onClick={async () => {
                    setErrorMsg(null);
                    try { await onDelete(tpl.id); } catch (error) { setErrorMsg(error instanceof Error ? error.message : String(error)); }
                  }}>删除</button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

interface PendingUpload {
  templateName: string;
}

interface TemplateLibraryModalProps {
  open: boolean;
  onClose: () => void;
  templates: TemplateMeta[];
  folders: TemplateFolder[];
  selectedFolderId: string;
  onSelectFolder: (folderId: string) => void;
  onCreateFolder: (name: string) => Promise<void>;
  pendingUpload: PendingUpload | null;
  onConfirmUpload: (folderId: string) => Promise<void>;
  onImport: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isCloud?: boolean;
  loading?: boolean;
}

/** 模板库弹窗：管理一级文件夹，或在上传时选择目标文件夹。 */
export function TemplateLibraryModal({
  open, onClose, templates, folders, selectedFolderId, onSelectFolder, onCreateFolder,
  pendingUpload, onConfirmUpload, onImport, onDelete, isCloud = false, loading = false,
}: TemplateLibraryModalProps) {
  const [folderName, setFolderName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const createFolder = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onCreateFolder(folderName);
      setFolderName('');
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!selectedFolderId) {
      setErrorMsg('请先选择一个一级文件夹');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await onConfirmUpload(selectedFolderId);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content template-library-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{isCloud ? '云端模板库（团队共享）' : '我的模板库'}</span>
          <button type="button" onClick={onClose} className="btn-close">✕</button>
        </div>
        <div className="modal-body">
          {isCloud && (
            <div className="folder-manager">
              <div className="folder-manager-title">一级文件夹</div>
              <div className="folder-create-row">
                <input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="新文件夹名称" maxLength={60} />
                <button type="button" className="btn-secondary btn-sm" onClick={createFolder} disabled={busy || !folderName.trim()}>新建文件夹</button>
              </div>
            </div>
          )}
          {pendingUpload && (
            <div className="pending-upload">
              <div><strong>上传「{pendingUpload.templateName}」</strong></div>
              <div className="pending-upload-hint">请选择一个一级文件夹；也可先在上方新建后再上传。映射与命名规则会一并保存。</div>
              <button type="button" className="btn-primary btn-sm" onClick={upload} disabled={busy || !selectedFolderId}>
                {busy ? '上传中...' : '确认上传到此文件夹'}
              </button>
            </div>
          )}
          {errorMsg && <div className="library-error" role="alert">⚠️ {errorMsg}</div>}
          <TemplateLibrary templates={templates} folders={folders} selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder} onImport={onImport} onDelete={onDelete} isCloud={isCloud} loading={loading} />
        </div>
        {isCloud && <div className="modal-footer-hint">文件夹仅一级分类；新上传的模板必须选择一个文件夹。</div>}
      </div>
    </div>
  );
}
