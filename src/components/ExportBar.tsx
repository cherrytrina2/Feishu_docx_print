interface ExportBarProps {
  recordCount: number;
  onDownload: () => void;
  onDownloadAll?: () => void;
  onPrint: () => void;
  disabled: boolean;
  busy: boolean;
}

export function ExportBar({
  recordCount,
  onDownload,
  onDownloadAll,
  onPrint,
  disabled,
  busy,
}: ExportBarProps) {
  const isMulti = recordCount > 1;

  return (
    <div className="export-bar">
      <button
        type="button"
        onClick={onDownload}
        disabled={disabled || busy}
        className="btn-primary"
      >
        {busy ? '生成中…' : isMulti ? '逐条下载 docx' : '生成并下载 docx'}
      </button>
      {isMulti && onDownloadAll && (
        <button
          type="button"
          onClick={onDownloadAll}
          disabled={disabled || busy}
          className="btn-secondary"
        >
          合并为一个 docx
        </button>
      )}
      <button
        type="button"
        onClick={onPrint}
        disabled={disabled || busy}
        className="btn-secondary"
      >
        打印预览
      </button>
    </div>
  );
}
