import { DecryptResult } from '@/decrypt/entity';
import { FileSystemDirectoryHandle } from '@/shims-fs';
import JSZip from 'jszip';

export enum FilenamePolicy {
  ArtistAndTitle,
  TitleOnly,
  TitleAndArtist,
  SameAsOriginal,
}

export const FilenamePolicies: { key: FilenamePolicy; text: string }[] = [
  { key: FilenamePolicy.ArtistAndTitle, text: '歌手-歌曲名' },
  { key: FilenamePolicy.TitleOnly, text: '歌曲名' },
  { key: FilenamePolicy.TitleAndArtist, text: '歌曲名-歌手' },
  { key: FilenamePolicy.SameAsOriginal, text: '同源文件名' },
];

export function SanitizeFilename(filename: string): string {
  const sanitized = filename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return sanitized || '未命名音频';
}

export function GetDownloadFilename(data: DecryptResult, policy: FilenamePolicy): string {
  const title = data.title || data.rawFilename || '未命名音频';
  const artist = data.artist || '未知歌手';
  let filename: string;
  switch (policy) {
    case FilenamePolicy.TitleOnly:
      filename = `${title}.${data.ext}`;
      break;
    case FilenamePolicy.TitleAndArtist:
      filename = `${title} - ${artist}.${data.ext}`;
      break;
    case FilenamePolicy.SameAsOriginal:
      filename = `${data.rawFilename || title}.${data.ext}`;
      break;
    default:
    case FilenamePolicy.ArtistAndTitle:
      filename = `${artist} - ${title}.${data.ext}`;
      break;
  }
  return SanitizeFilename(filename);
}

function DeduplicateFilename(filename: string, used: Set<string>): string {
  if (!used.has(filename)) {
    used.add(filename);
    return filename;
  }

  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  let index = 2;
  let candidate = `${stem} (${index})${ext}`;
  while (used.has(candidate)) {
    index++;
    candidate = `${stem} (${index})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

export async function BuildBatchZip(
  items: DecryptResult[],
  policy: FilenamePolicy,
  onProgress?: (percentage: number) => void,
): Promise<Blob> {
  const zip = new JSZip();
  const used = new Set<string>();
  items.forEach((item) => {
    zip.file(DeduplicateFilename(GetDownloadFilename(item, policy), used), item.blob);
  });
  return zip.generateAsync(
    {
      type: 'blob',
      compression: 'STORE',
      streamFiles: true,
    },
    ({ percent }) => onProgress?.(percent),
  );
}

export function DownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function DirectlyWriteFile(data: DecryptResult, policy: FilenamePolicy, dir: FileSystemDirectoryHandle) {
  let filename = GetDownloadFilename(data, policy);
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  let index = 1;
  while (true) {
    try {
      await dir.getFileHandle(filename);
      index++;
      filename = `${stem} (${index})${ext}`;
    } catch (error) {
      break;
    }
  }
  const file = await dir.getFileHandle(filename, { create: true });
  const w = await file.createWritable();
  await w.write(data.blob);
  await w.close();
}

export function DownloadBlobMusic(data: DecryptResult, policy: FilenamePolicy) {
  const a = document.createElement('a');
  a.href = data.file;
  a.download = GetDownloadFilename(data, policy);
  document.body.append(a);
  a.click();
  a.remove();
}

export function RemoveBlobMusic(data: DecryptResult) {
  URL.revokeObjectURL(data.file);
  if (data.picture?.startsWith('blob:')) {
    URL.revokeObjectURL(data.picture);
  }
}

export class DecryptQueue {
  private readonly pending: (() => Promise<void>)[];
  private running: boolean;

  constructor() {
    this.pending = [];
    this.running = false;
  }

  queue(fn: () => Promise<void>) {
    this.pending.push(fn);
    if (!this.running) void this.consume();
  }

  private async consume(): Promise<void> {
    const fn = this.pending.shift();
    if (!fn) {
      this.running = false;
      return;
    }

    this.running = true;
    try {
      await fn();
    } catch (error) {
      console.error(error);
    } finally {
      await this.consume();
    }
  }
}
