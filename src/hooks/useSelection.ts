import { useCallback, useEffect, useRef, useState } from 'react';
import { bitable } from '@lark-base-open/js-sdk';
import { loadCurrentRecord, loadRecordsByIds, selectMultipleRecords } from '../services/dataService';
import type { MultiRenderData, RecordRenderData } from '../types';

/**
 * 监听多维表格选中记录变化，自动加载单条记录。
 * 同时支持手动多选（调用 selectRecordIdList 弹对话框）。
 */
export function useSelection() {
  const [multiData, setMultiData] = useState<MultiRenderData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const refreshing = useRef(false);

  /** 加载单条（自动模式，响应 onSelectionChange） */
  const loadSingle = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setLoading(true);
    setError(null);
    try {
      const d = await loadCurrentRecord();
      if (d) {
        setMultiData({ records: [d] });
      } else {
        setMultiData(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMultiData(null);
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
  }, []);

  /** 手动触发多选对话框 */
  const loadMulti = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const recordIds = await selectMultipleRecords();
      if (recordIds.length === 0) {
        setMultiData(null);
        setError('未选择任何记录');
        return;
      }
      const d = await loadRecordsByIds(recordIds);
      setMultiData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMultiData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearData = useCallback(() => {
    setMultiData(null);
    setError(null);
  }, []);

  useEffect(() => {
    loadSingle();
    let off: (() => void) | undefined;
    try {
      off = bitable.base.onSelectionChange(() => {
        loadSingle();
      });
    } catch {
      // 非飞书环境忽略
    }
    return () => off?.();
  }, [loadSingle]);

  /** 当前选中的单条记录（兼容旧接口） */
  const currentRecord: RecordRenderData | null =
    multiData && multiData.records.length === 1 ? multiData.records[0] : null;

  return {
    data: multiData,
    currentRecord,
    loading,
    error,
    refresh: loadSingle,
    selectMulti: loadMulti,
    clear: clearData,
  };
}
