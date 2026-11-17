import { useState } from 'react';
import type { MultiRenderData, RecordRenderData } from '../types';

interface RecordFieldsPanelProps {
  multiData: MultiRenderData;
}

export function RecordFieldsPanel({ multiData }: RecordFieldsPanelProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const records = Array.isArray(multiData?.records) ? multiData.records : [];

  if (records.length === 0) return null;

  const active = records[Math.min(activeIdx, records.length - 1)];

  return (
    <div className="fields-panel">
      <div className="panel-title">
        字段映射
        <span className="panel-count">
          共 {records.length} 条记录
        </span>
      </div>

      {records.length > 1 && (
        <div className="record-tabs">
          {records.map((r, i) => (
            <button
              key={r.recordId}
              type="button"
              className={`record-tab ${i === activeIdx ? 'active' : ''}`}
              onClick={() => setActiveIdx(i)}
              title={r.label}
            >
              {`#${i + 1} ${r.label}`}
            </button>
          ))}
        </div>
      )}

      <SingleRecordFields record={active} />
    </div>
  );
}

function SingleRecordFields({ record }: { record: RecordRenderData }) {
  const fields = Array.isArray(record?.fields) ? record.fields : [];
  const imageFields = fields.filter((f) => f.isImage);
  const textFields = fields.filter((f) => !f.isImage);

  return (
    <div className="fields-list">
      {textFields.map((f) => (
        <div key={f.fieldId} className="field-item">
          <div className="field-row">
            <span className="field-name" title={f.name}>{f.name}</span>
            <code className="field-placeholder">{f.placeholder}</code>
          </div>
          <div className="field-value" title={f.displayValue}>
            {f.displayValue || '（空）'}
          </div>
        </div>
      ))}
      {imageFields.length > 0 && (
        <div className="field-group-title">图片字段（在模板里用 {'{%字段名}'}）</div>
      )}
      {imageFields.map((f) => (
        <div key={f.fieldId} className="field-item">
          <div className="field-row">
            <span className="field-name" title={f.name}>
              <span className="badge-img">图</span>
              {f.name}
            </span>
            <code className="field-placeholder">{f.placeholder}</code>
          </div>
          <div className="field-value">{f.displayValue}</div>
        </div>
      ))}
    </div>
  );
}
