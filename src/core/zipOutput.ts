import PizZip from 'pizzip';

export async function createDocxZip(
  files: Array<{ name: string; blob: Blob }>,
): Promise<Blob> {
  const zip = new PizZip();
  for (const file of files) {
    zip.file(file.name, await file.blob.arrayBuffer());
  }
  return zip.generate({ type: 'blob', mimeType: 'application/zip' });
}
