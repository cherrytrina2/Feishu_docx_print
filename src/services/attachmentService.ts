import type { IAttachmentField, ITable } from '@lark-base-open/js-sdk';

/**
 * 通过附件字段获取记录里所有附件的二进制 ArrayBuffer。
 * SDK 返回的临时 URL 有效期 10 分钟，需立即下载。
 */
export async function fetchAttachmentBuffers(
  table: ITable,
  fieldId: string,
  recordId: string,
): Promise<ArrayBuffer[]> {
  let field: IAttachmentField;
  try {
    field = await table.getField<IAttachmentField>(fieldId);
  } catch {
    return [];
  }
  let urlsResult: string[] | null | undefined;
  try {
    urlsResult = await field.getAttachmentUrls(recordId);
  } catch {
    // 个别复杂字段的空值在 SDK 内部可能导致 null.map()；调用方可继续读取其他字段。
    return [];
  }
  const urls = Array.isArray(urlsResult) ? urlsResult : [];
  if (urls.length === 0) return [];

  const validUrls = urls.filter((u): u is string => !!u);
  if (validUrls.length === 0) return [];

  const results = await Promise.allSettled(
    validUrls.map((u) =>
      fetch(u).then((r) => {
        if (!r.ok) throw new Error(`附件下载失败 HTTP ${r.status}`);
        return r.arrayBuffer();
      }),
    ),
  );

  const buffers: ArrayBuffer[] = [];
  for (const res of results) {
    if (res.status === 'fulfilled') buffers.push(res.value);
  }
  return buffers;
}
