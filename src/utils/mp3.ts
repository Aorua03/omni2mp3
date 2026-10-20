import { DecryptResult } from '@/decrypt/entity';

let encoder: any;
let loading: Promise<any> | null = null;
let serial = 0;

export type Mp3TelemetryStage = 'encoder_load' | 'encode';
export type Mp3TelemetryCallback = (stage: Mp3TelemetryStage, durationMs: number) => void;
export type Mp3StageCallback = (stage: Mp3TelemetryStage) => void;

function loadScript(): Promise<void> {
  if ((window as any).FFmpegWASM) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./ffmpeg/ffmpeg.js', document.baseURI).href;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('MP3 转码组件加载失败，请检查网络后重试'));
    document.head.appendChild(script);
  });
}

async function getEncoder(): Promise<any> {
  if (!loading) {
    loading = (async () => {
      await loadScript();
      const instance = new (window as any).FFmpegWASM.FFmpeg();
      const partNames = Array.from({ length: 16 }, (_, index) => `part${String(index).padStart(3, '0')}`);
      const parts = await Promise.all(partNames.map(async (part) => {
        const response = await fetch(new URL(`./ffmpeg/ffmpeg-core.wasm.${part}`, document.baseURI).href);
        if (!response.ok) throw new Error('MP3 编码组件下载失败，请重试');
        return response.blob();
      }));
      const wasmURL = URL.createObjectURL(new Blob(parts, { type: 'application/wasm' }));
      try {
        await instance.load({
          coreURL: new URL('./ffmpeg/ffmpeg-core.js', document.baseURI).href,
          wasmURL,
        });
      } finally {
        URL.revokeObjectURL(wasmURL);
      }
      encoder = instance;
      return instance;
    })().catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

export async function convertToMp3(
  result: DecryptResult,
  onTelemetry?: Mp3TelemetryCallback,
  onStage?: Mp3StageCallback,
): Promise<DecryptResult> {
  if (result.ext.toLowerCase() === 'mp3') return result;
  const hadEncoder = Boolean(encoder);
  onStage?.('encoder_load');
  const encoderLoadStarted = performance.now();
  const ffmpeg = await getEncoder();
  if (!hadEncoder) onTelemetry?.('encoder_load', performance.now() - encoderLoadStarted);
  onStage?.('encode');
  const id = ++serial;
  const input = `input-${id}.${result.ext || 'bin'}`;
  const output = `output-${id}.mp3`;
  try {
    await ffmpeg.writeFile(input, new Uint8Array(await result.blob.arrayBuffer()));
    const args = ['-hide_banner', '-loglevel', 'error', '-i', input, '-map', '0:a:0', '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-id3v2_version', '3'];
    if (result.title) args.push('-metadata', `title=${result.title}`);
    if (result.artist) args.push('-metadata', `artist=${result.artist}`);
    if (result.album) args.push('-metadata', `album=${result.album}`);
    args.push(output);
    const encodeStarted = performance.now();
    let exitCode: number;
    try {
      exitCode = await ffmpeg.exec(args);
    } finally {
      onTelemetry?.('encode', performance.now() - encodeStarted);
    }
    if (exitCode !== 0) throw new Error(`MP3 编码失败（错误码 ${exitCode}）`);
    const data = await ffmpeg.readFile(output);
    if (!(data instanceof Uint8Array) || !data.length) throw new Error('MP3 编码结果为空');
    const blob = new Blob([data], { type: 'audio/mpeg' });
    URL.revokeObjectURL(result.file);
    return { ...result, ext: 'mp3', mime: 'audio/mpeg', blob, file: URL.createObjectURL(blob) };
  } finally {
    await ffmpeg.deleteFile(input).catch(() => undefined);
    await ffmpeg.deleteFile(output).catch(() => undefined);
  }
}
