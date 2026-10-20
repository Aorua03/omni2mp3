import JSZip from 'jszip';

import { BuildBatchZip, DecryptQueue, FilenamePolicy, GetDownloadFilename, SanitizeFilename } from '../utils';

describe('batch utilities', () => {
  test('runs every queued task in order', async () => {
    const queue = new DecryptQueue();
    const completed: number[] = [];

    await new Promise<void>((resolve) => {
      [1, 2, 3].forEach((value) => {
        queue.queue(async () => {
          completed.push(value);
          if (value === 3) resolve();
        });
      });
    });

    expect(completed).toEqual([1, 2, 3]);
  });

  test('continues after a queued task fails', async () => {
    const queue = new DecryptQueue();
    const completed: number[] = [];
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await new Promise<void>((resolve) => {
      queue.queue(async () => {
        throw new Error('expected test failure');
      });
      queue.queue(async () => {
        completed.push(2);
        resolve();
      });
    });

    expect(completed).toEqual([2]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  test('sanitizes invalid path characters', () => {
    expect(SanitizeFilename('A/B:C*D?.mp3')).toBe('A_B_C_D_.mp3');
  });

  test('builds a zip and deduplicates equal output names', async () => {
    const fileSpy = jest.spyOn(JSZip.prototype, 'file');
    jest.spyOn(JSZip.prototype, 'generateAsync').mockResolvedValue(new Blob() as any);
    const item = {
      title: '同名歌曲',
      artist: '歌手',
      ext: 'mp3',
      mime: 'audio/mpeg',
      file: 'blob:test',
      blob: new Uint8Array([97, 117, 100, 105, 111]) as any,
    };
    await BuildBatchZip([item, item], FilenamePolicy.ArtistAndTitle);

    expect(fileSpy.mock.calls.map((call) => call[0])).toEqual(['歌手 - 同名歌曲.mp3', '歌手 - 同名歌曲 (2).mp3']);
    expect(GetDownloadFilename(item, FilenamePolicy.ArtistAndTitle)).toBe('歌手 - 同名歌曲.mp3');
  });
});
