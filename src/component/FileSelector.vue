<template>
  <section class="batch-importer" aria-labelledby="batch-import-title">
    <div
      class="drop-zone"
      :class="{ 'is-dragging': dragging, 'is-busy': busy }"
      tabindex="0"
      @click.self="openFiles"
      @keydown.enter.prevent="openFiles"
      @keydown.space.prevent="openFiles"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <input ref="fileInput" class="native-picker" type="file" :accept="accept" multiple @change="handlePicker" />
      <div class="drop-zone__index">01 / 导入</div>
      <div class="drop-zone__mark" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="drop-zone__copy">
        <p class="drop-zone__kicker">建议单次添加歌曲不超过5首</p>
        <h2 id="batch-import-title">建议少量多次进行转换，减少设备内存占用</h2>
        <p>可在音乐软件中查看音乐文件的存储位置</p>
      </div>
      <div class="drop-zone__actions">
        <button class="action-button action-button--primary" type="button" @click.stop="openFiles">选择音乐文件</button>
      </div>
      <div class="format-strip">
        <span>NCM</span><span>QMC</span><span>MFLAC</span><span>MGG</span><span>KGM</span><span>KWM</span>
      </div>
    </div>

    <div v-if="task_all" class="batch-progress" aria-live="polite">
      <div class="batch-progress__header">
        <div>
          <span class="batch-progress__label">本批进度</span>
          <strong>{{ task_finished }} / {{ task_all }}</strong>
        </div>
        <span class="worker-badge">耐心等待进度条完全变绿</span>
      </div>
      <el-progress
        :percentage="progress_value"
        :show-text="false"
        :stroke-width="10"
        :status="progress_status"
      ></el-progress>
      <div class="task-list">
        <div v-for="item in visible_items" :key="item.uid" class="task-row">
          <span class="task-row__name" :title="item.name">{{ item.name }}</span>
          <span class="task-row__size">{{ formatSize(item.size) }}</span>
          <span class="task-row__status" :class="`is-${item.status}`">{{ statusText(item.status) }}</span>
        </div>
      </div>
      <p v-if="task_items.length > visible_items.length" class="task-list__more">
        仅显示最近 {{ visible_items.length }} 项，共 {{ task_items.length }} 项
      </p>
    </div>
  </section>
</template>

<script>
import { Decrypt } from '@/decrypt';
import { DecryptQueue } from '@/utils/utils';
import { storage } from '@/utils/storage';
import { convertToMp3 } from '@/utils/mp3';
import { createAnalyticsId, sizeBucket, track } from '@/utils/analytics';

const SUPPORTED_EXTENSIONS = [
  'ncm',
  'uc',
  'qmc0',
  'qmc2',
  'qmc3',
  'qmc4',
  'qmc6',
  'qmc8',
  'qmcflac',
  'qmcogg',
  'mflac',
  'mflac0',
  'mflach',
  'mgg',
  'mgg0',
  'mgg1',
  'mggl',
  'mmp4',
  'tm0',
  'tm2',
  'tm3',
  'tm6',
  'tkm',
  'cache',
  'kgm',
  'kgma',
  'vpr',
  'kwm',
  'xm',
  'x2m',
  'x3m',
  'mg3d',
  'mp3',
  'flac',
  'ogg',
  'm4a',
  'wav',
  'aac',
  'wma',
  'aiff',
  'aif',
  'ape',
  'opus',
];
const MAX_FILES_PER_BATCH = 5;

export default {
  name: 'FileSelector',
  data() {
    return {
      task_all: 0,
      task_finished: 0,
      task_items: [],
      queue: new DecryptQueue(),
      parallel: false,
      dragging: false,
      uid: 0,
    };
  },
  computed: {
    accept() {
      return SUPPORTED_EXTENSIONS.map((extension) => `.${extension}`).join(',');
    },
    progress_value() {
      return this.task_all ? Math.round((this.task_finished / this.task_all) * 100) : 0;
    },
    progress_status() {
      return this.task_all === this.task_finished ? 'success' : undefined;
    },
    busy() {
      return this.task_all > this.task_finished;
    },
    visible_items() {
      return this.task_items.slice(-10).reverse();
    },
  },
  methods: {
    openFiles() {
      track('control_clicked', { control_id: 'file_picker_open', area: 'import' });
      this.$refs.fileInput.click();
    },
    handlePicker(event) {
      this.addFiles(Array.from(event.target.files || []), 'picker');
      event.target.value = '';
    },
    handleDrop(event) {
      this.dragging = false;
      this.addFiles(Array.from(event.dataTransfer.files || []), 'drop');
    },
    handleDragLeave(event) {
      if (!event.currentTarget.contains(event.relatedTarget)) this.dragging = false;
    },
    extensionOf(filename) {
      if (/\.mflac0\.flac$/i.test(filename)) return 'mflac0';
      if (/\.mflac\.flac$/i.test(filename)) return 'mflac';
      if (/\.mgg1\.ogg$/i.test(filename)) return 'mgg1';
      if (/\.mgg\.ogg$/i.test(filename)) return 'mgg';
      const dot = filename.lastIndexOf('.');
      return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
    },
    addFiles(files, importMethod = 'picker') {
      const accepted = files.filter((file) => SUPPORTED_EXTENSIONS.includes(this.extensionOf(file.name)));
      const rejected = files.filter((file) => !SUPPORTED_EXTENSIONS.includes(this.extensionOf(file.name)));
      const queued = accepted.slice(0, MAX_FILES_PER_BATCH);
      const ignoredCount = accepted.length - queued.length;
      const importId = createAnalyticsId();
      track('files_imported', {
        import_id: importId,
        import_method: importMethod,
        accepted_count: queued.length,
        rejected_count: rejected.length,
      });
      if (rejected.length) this.$emit('rejected', rejected);
      if (!accepted.length) return;

      if (ignoredCount > 0) this.$emit('limit-exceeded', ignoredCount);

      if (!this.busy) {
        this.task_all = 0;
        this.task_finished = 0;
        this.task_items = [];
      }
      this.task_all += queued.length;
      const config = storage.getAll();
      queued.forEach((raw) => this.enqueue(raw, config, importId));
      this.$emit('batch-start', queued.length);
    },
    enqueue(raw, config, importId) {
      const fileId = createAnalyticsId();
      const inputFormat = this.extensionOf(raw.name);
      const queuedAt = performance.now();
      const item = {
        uid: ++this.uid,
        name: raw.name,
        size: raw.size,
        status: 'queued',
      };
      this.task_items.push(item);
      track('file_queued', {
        file_id: fileId,
        import_id: importId,
        input_format: inputFormat,
        size_bucket: sizeBucket(raw.size),
      });
      const fileInfo = {
        status: 'ready',
        name: raw.name,
        size: raw.size,
        percentage: 0,
        uid: item.uid,
        raw,
      };

      this.queue.queue(async () => {
        item.status = 'processing';
        const startedAt = performance.now();
        let stage = 'decrypt';
        let status = 'failure';
        let outputMode;
        let errorCode;
        let decryptMs = 0;
        let encoderLoadMs = 0;
        let encoderColdStart = false;
        let encodeMs = 0;
        let errorExitCode;
        track('file_started', {
          file_id: fileId,
          import_id: importId,
          input_format: inputFormat,
          size_bucket: sizeBucket(raw.size),
          queue_ms: Math.round(startedAt - queuedAt),
        });
        try {
          let source = raw;
          if (this.extensionOf(raw.name) !== raw.name.slice(raw.name.lastIndexOf('.') + 1).toLowerCase()) {
            source = new File([raw], raw.name.replace(/\.(flac|ogg)$/i, ''), { type: raw.type });
            fileInfo.name = source.name;
            fileInfo.raw = source;
          }
          const decryptStarted = performance.now();
          const result = await Decrypt(fileInfo, await config);
          decryptMs = performance.now() - decryptStarted;
          item.status = 'converting';
          outputMode = result.ext.toLowerCase() === 'mp3' ? 'passthrough' : 'transcoded';
          stage = 'encoder_load';
          const mp3 = await convertToMp3(
            result,
            (measureStage, durationMs) => {
              if (measureStage === 'encoder_load') {
                encoderLoadMs = durationMs;
                encoderColdStart = true;
              }
              if (measureStage === 'encode') encodeMs = durationMs;
            },
            (nextStage) => {
              stage = nextStage;
            },
          );
          item.status = 'success';
          status = 'success';
          this.$emit('success', mp3);
        } catch (error) {
          item.status = 'error';
          errorCode = this.analyticsErrorCode(stage, error);
          const exitCodeMatch = String(error || '').match(/错误码\s*(-?\d+)/i);
          if (exitCodeMatch) errorExitCode = Number(exitCodeMatch[1]);
          this.$emit('error', error, raw.name);
        } finally {
          track('file_finished', {
            file_id: fileId,
            import_id: importId,
            status,
            input_format: inputFormat,
            output_mode: outputMode,
            process_ms: Math.round(performance.now() - startedAt),
            decrypt_ms: Math.round(decryptMs),
            encoder_load_ms: Math.round(encoderLoadMs),
            encoder_cold_start: encoderColdStart,
            encode_ms: Math.round(encodeMs),
            error_stage: status === 'failure' ? stage : undefined,
            error_code: errorCode,
            error_exit_code: errorExitCode,
          });
          this.task_finished++;
          this.$emit('file-finish', item.status);
        }
      });
    },
    formatSize(size) {
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
      return `${(size / 1024 / 1024).toFixed(1)} MB`;
    },
    analyticsErrorCode(stage, error) {
      const message = String(error || '').toLowerCase();
      if (stage === 'encoder_load') {
        if (message.includes('脚本') || message.includes('script')) return 'script_load_failed';
        if (message.includes('下载') || message.includes('download')) return 'wasm_download_failed';
        return 'wasm_init_failed';
      }
      if (stage === 'encode') {
        if (message.includes('空')) return 'empty_output';
        const exit = message.match(/错误码\s*(-?\d+)/);
        if (exit) return 'encoder_exit_nonzero';
        if (/out of memory|memory|内存/.test(message)) return 'memory_limit';
        return 'encode_unknown';
      }
      if (/damaged|corrupt|损坏|valid .*file/.test(message)) return 'invalid_or_corrupt_file';
      if (/request|metadata|请求信息|network|fetch/.test(message)) return 'metadata_lookup_failed';
      if (/key|decrypt|解锁|解密/.test(message)) return 'key_or_decrypt_failed';
      if (/unsupported|不支持/.test(message)) return 'unsupported_variant';
      return 'decrypt_unknown';
    },
    statusText(status) {
      return {
        queued: '等待',
        processing: '处理中',
        converting: '转 MP3',
        success: '完成',
        error: '失败',
      }[status];
    },
  },
};
</script>

<style lang="scss" scoped>
.batch-importer {
  display: grid;
  gap: 18px;
}

.native-picker {
  display: none;
}

.drop-zone {
  position: relative;
  min-height: 330px;
  overflow: hidden;
  border: 1px solid rgba(20, 38, 46, 0.22);
  border-radius: 28px;
  background: linear-gradient(115deg, rgba(255, 255, 255, 0.9), rgba(246, 239, 222, 0.82)),
    repeating-linear-gradient(90deg, transparent 0, transparent 47px, rgba(15, 114, 115, 0.08) 48px);
  box-shadow: 0 24px 70px rgba(23, 39, 46, 0.11);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 32px;
  padding: 64px clamp(28px, 6vw, 72px) 42px;
  text-align: left;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.drop-zone:hover,
.drop-zone.is-dragging {
  transform: translateY(-2px);
  border-color: #0f7273;
  box-shadow: 0 30px 80px rgba(15, 114, 115, 0.18);
}

.drop-zone.is-dragging::after {
  content: '松开即可加入这一批';
  position: absolute;
  inset: 12px;
  z-index: 4;
  display: grid;
  place-items: center;
  border: 2px dashed #0f7273;
  border-radius: 20px;
  background: rgba(240, 249, 245, 0.94);
  color: #12333b;
  font-size: clamp(24px, 4vw, 42px);
  font-family: 'STKaiti', 'KaiTi', serif;
}

.drop-zone__index {
  position: absolute;
  top: 24px;
  left: 28px;
  color: #0f7273;
  font: 700 12px/1 'Courier New', monospace;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.drop-zone__mark {
  position: absolute;
  right: -58px;
  top: -58px;
  width: 210px;
  height: 210px;
  border-radius: 50%;
  background: #ef6f4d;
  opacity: 0.94;
}

.drop-zone__mark span {
  position: absolute;
  left: 53px;
  width: 76px;
  height: 10px;
  border-radius: 10px;
  background: #fff7e7;
  transform: rotate(-36deg);
}

.drop-zone__mark span:nth-child(1) {
  top: 80px;
}
.drop-zone__mark span:nth-child(2) {
  top: 105px;
}
.drop-zone__mark span:nth-child(3) {
  top: 130px;
}

.drop-zone__copy {
  position: relative;
  z-index: 2;
  max-width: 650px;
}

.drop-zone__kicker {
  margin: 0 0 12px;
  color: #ef6f4d;
  font: 700 13px/1 'Courier New', monospace;
  letter-spacing: 0.16em;
}

.drop-zone h2 {
  margin: 0;
  color: #142e37;
  font-family: 'STKaiti', 'KaiTi', 'Microsoft YaHei', serif;
  font-size: clamp(30px, 4vw, 48px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.04em;
}

.drop-zone__copy > p:last-child {
  max-width: 590px;
  margin: 20px 0 0;
  color: #557078;
  font-size: 16px;
  line-height: 1.8;
}

.drop-zone__actions {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 12px;
  min-width: 190px;
}

.action-button {
  min-height: 48px;
  padding: 0 22px;
  border: 1px solid #183c45;
  border-radius: 999px;
  background: transparent;
  color: #183c45;
  cursor: pointer;
  font: 700 15px/1 'Microsoft YaHei', sans-serif;
  transition: transform 160ms ease, background 160ms ease, color 160ms ease;
}

.action-button:hover {
  transform: translateY(-2px);
  background: #183c45;
  color: #fffaf0;
}

.action-button--primary {
  border-color: #ef6f4d;
  background: #ef6f4d;
  color: white;
}

.action-button--primary:hover {
  border-color: #c84e31;
  background: #c84e31;
}

.format-strip {
  position: absolute;
  right: 34px;
  bottom: 22px;
  display: flex;
  gap: 8px;
}

.format-strip span,
.worker-badge {
  border: 1px solid rgba(20, 46, 55, 0.18);
  border-radius: 999px;
  padding: 6px 10px;
  color: #5b7076;
  background: rgba(255, 255, 255, 0.66);
  font: 700 10px/1 'Courier New', monospace;
  letter-spacing: 0.08em;
}

.batch-progress {
  padding: 22px 24px;
  border: 1px solid rgba(20, 38, 46, 0.12);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 14px 45px rgba(23, 39, 46, 0.08);
}

.batch-progress__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.batch-progress__header > div {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.batch-progress__label {
  color: #6d7c80;
  font-size: 13px;
}

.batch-progress strong {
  color: #142e37;
  font: 700 24px/1 'Courier New', monospace;
}

.task-list {
  display: grid;
  gap: 7px;
  margin-top: 18px;
}

.task-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 80px 64px;
  align-items: center;
  gap: 12px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  background: #f7f4eb;
  color: #29434a;
  font-size: 13px;
}

.task-row__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-row__size {
  color: #839196;
  text-align: right;
  font: 12px 'Courier New', monospace;
}

.task-row__status {
  text-align: right;
  font-weight: 700;
}

.task-row__status.is-processing {
  color: #d35c3d;
}
.task-row__status.is-success {
  color: #0f7273;
}
.task-row__status.is-error {
  color: #b3261e;
}
.task-row__status.is-queued {
  color: #839196;
}

.task-list__more {
  margin: 10px 0 0;
  color: #8b979a;
  font-size: 12px;
  text-align: right;
}

@media (max-width: 760px) {
  .drop-zone {
    grid-template-columns: 1fr;
    align-items: center;
    gap: 16px;
    min-height: 0;
    padding: 48px 20px 62px;
    border-radius: 20px;
  }

  .drop-zone__actions {
    grid-template-columns: 1fr;
  }

  .format-strip {
    right: auto;
    left: 22px;
    max-width: calc(100% - 44px);
    overflow: hidden;
  }

  .drop-zone__mark {
    top: -44px;
    right: -44px;
    width: 120px;
    height: 120px;
  }

  .drop-zone__mark span {
    left: 25px;
    width: 48px;
    height: 8px;
  }

  .drop-zone__mark span:nth-child(1) {
    top: 45px;
  }
  .drop-zone__mark span:nth-child(2) {
    top: 66px;
  }
  .drop-zone__mark span:nth-child(3) {
    top: 87px;
  }

  .drop-zone__index {
    top: 18px;
    left: 20px;
    font-size: 10px;
  }

  .drop-zone__copy {
    max-width: 100%;
  }

  .drop-zone__kicker {
    max-width: calc(100% - 54px);
    margin-bottom: 8px;
    font-size: 11px;
    line-height: 1.4;
    letter-spacing: 0.04em;
  }

  .drop-zone h2 {
    font-size: clamp(20px, 5.8vw, 26px);
    line-height: 1.4;
    letter-spacing: 0;
  }

  .drop-zone__copy > p:last-child {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.55;
  }

  .batch-progress__header {
    align-items: flex-start;
    gap: 12px;
  }

  .task-row {
    grid-template-columns: minmax(0, 1fr) 58px;
  }

  .task-row__size {
    display: none;
  }

  .action-button {
    min-height: 44px;
  }

  .format-strip {
    left: 20px;
    bottom: 18px;
    gap: 5px;
    flex-wrap: wrap;
  }

  .format-strip span {
    padding: 5px 7px;
    font-size: 9px;
  }
}

@media (max-width: 380px) {
  .drop-zone {
    padding-right: 16px;
    padding-left: 16px;
  }

  .drop-zone__index {
    left: 16px;
  }

  .drop-zone__copy > p:last-child {
    font-size: 12px;
  }
}
</style>
