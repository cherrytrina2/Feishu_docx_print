import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';

interface PrintPreviewModalProps {
  blob: Blob | null;
  onClose: () => void;
}

export function PrintPreviewModal({ blob, onClose }: PrintPreviewModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!blob || !containerRef.current) return;
    let cancelled = false;
    setRendering(true);
    setRenderError(null);
    containerRef.current.innerHTML = '';
    renderAsync(blob, containerRef.current, undefined, {
      className: 'docx-preview',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      experimental: true,
    })
      .then(() => {
        if (!cancelled) setRendering(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setRendering(false);
          setRenderError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  const handlePrint = () => {
    window.print();
  };

  if (!blob) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header no-print">
          <span className="modal-title">打印预览</span>
          <div className="modal-actions">
            <button type="button" onClick={handlePrint} className="btn-primary btn-sm">
              打印
            </button>
            <button type="button" onClick={onClose} className="btn-secondary btn-sm">
              关闭
            </button>
          </div>
        </div>
        <div className="modal-body">
          {rendering && <div className="rendering-tip no-print">渲染中…</div>}
          {renderError && (
            <div className="alert alert-error no-print">预览渲染失败：{renderError}</div>
          )}
          <div ref={containerRef} className="preview-container" />
        </div>
      </div>
    </div>
  );
}
