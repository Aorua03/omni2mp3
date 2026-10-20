<template>
  <div class="home-view">
    <file-selector
      @batch-start="handleBatchStart"
      @error="showFail"
      @file-finish="handleFileFinish"
      @rejected="showRejected"
      @success="showSuccess"
    />

    <section class="result-console" aria-labelledby="result-console-title">
      <div class="section-index">02 / 输出</div>
      <div class="result-console__heading">
        <div>
          <p class="section-kicker">MP3 输出</p>
          <h2 id="result-console-title">打包下载 MP3</h2>
        </div>
        <div class="metric-grid">
          <div class="metric">
            <span>已导入</span>
            <strong>{{ stats.imported }}</strong>
          </div>
          <div class="metric metric--success">
            <span>成功</span>
            <strong>{{ stats.success }}</strong>
          </div>
          <div class="metric metric--error">
            <span>失败</span>
            <strong>{{ stats.error }}</strong>
          </div>
        </div>
      </div>

      <div class="control-grid">
        <div class="control-group control-group--naming">
          <span class="control-label">文件命名</span>
          <div class="radio-wrap">
            <el-radio
              v-for="item in FilenamePolicies"
              :key="item.key"
              v-model="filename_policy"
              :label="item.key"
              @change="trackNamePolicy"
            >
              {{ item.text }}
            </el-radio>
          </div>
        </div>

        <div class="control-group control-group--actions">
          <span class="control-label">批量输出</span>
          <div class="button-row">
            <el-button
              :disabled="!tableData.length"
              :loading="zip_loading"
              icon="el-icon-box"
              type="primary"
              @click="handleZipDownload"
            >
              {{ zip_loading ? `正在打包 ${zip_progress}%` : `下载 ZIP（${tableData.length} 首）` }}
            </el-button>
            <el-button :disabled="!tableData.length" icon="el-icon-delete" plain type="danger" @click="handleDeleteAll">
              清空结果
            </el-button>
          </div>
        </div>
      </div>

      <div class="storage-note">
        <span class="storage-note__dot"></span>
        <span>所有已完成的 MP3 会打包为一个 ZIP 下载。</span>
        <span v-if="tableData.length" class="storage-note__size">内存中约 {{ result_size }} MB</span>
      </div>
    </section>

    <audio v-if="playing_url" :autoplay="playing_auto" :src="playing_url" controls @playing="trackAudioPlay" />

    <section v-if="tableData.length" class="result-list" aria-labelledby="result-list-title">
      <div class="result-list__header">
        <div>
          <span class="section-index section-index--inline">03 / 核对</span>
          <h2 id="result-list-title">已完成的音乐</h2>
        </div>
        <span>{{ tableData.length }} 首留在浏览器内，关闭页面后自动清除</span>
      </div>
      <PreviewTable
        class="table-content"
        :policy="filename_policy"
        :table-data="tableData"
        @edit="editFile"
        @play="changePlaying"
      />
    </section>

    <section v-else class="empty-result">
      <span>02</span>
      <p>导入音乐后，转换完成的 MP3 会在这里集中出现。</p>
    </section>

    <edit-dialog
      :show="showEditDialog"
      :picture="editing_data.picture"
      :title="editing_data.title"
      :artist="editing_data.artist"
      :album="editing_data.album"
      :albumartist="editing_data.albumartist"
      :genre="editing_data.genre"
      @cancel="handleEditCancel"
      @ok="handleEdit"
    ></edit-dialog>
  </div>
</template>

<script>
import FileSelector from '@/component/FileSelector';
import PreviewTable from '@/component/PreviewTable';
import EditDialog from '@/component/EditDialog';

import {
  BuildBatchZip,
  DownloadBlob,
  FilenamePolicy,
  FilenamePolicies,
  RemoveBlobMusic,
} from '@/utils/utils';
import { GetImageFromURL, RewriteMetaToMp3, RewriteMetaToFlac, AudioMimeType, split_regex } from '@/decrypt/utils';
import { parseBlob as metaParseBlob } from 'music-metadata-browser';
import { sizeBucket, track } from '@/utils/analytics';

export default {
  name: 'Home',
  components: {
    FileSelector,
    PreviewTable,
    EditDialog,
  },
  data() {
    return {
      showEditDialog: false,
      editing_data: { picture: '', title: '', artist: '', album: '', albumartist: '', genre: '' },
      tableData: [],
      playing_url: '',
      playing_auto: false,
      filename_policy: FilenamePolicy.ArtistAndTitle,
      FilenamePolicies,
      zip_loading: false,
      zip_progress: 0,
      stats: {
        imported: 0,
        success: 0,
        error: 0,
      },
    };
  },
  computed: {
    result_size() {
      const bytes = this.tableData.reduce((sum, item) => sum + item.blob.size, 0);
      return (bytes / 1024 / 1024).toFixed(1);
    },
  },
  methods: {
    handleBatchStart(count) {
      this.stats.imported += count;
      this.$notify.info({
        title: `已加入 ${count} 个文件`,
        message: '正在按队列处理，可继续留在本页查看进度。',
        duration: 2400,
      });
    },
    trackNamePolicy(policy) {
      track('control_clicked', { control_id: 'name_policy_change', area: 'results' });
    },
    handleFileFinish(status) {
      if (status === 'success') this.stats.success++;
      if (status === 'error') this.stats.error++;
    },
    async showSuccess(data) {
      this.tableData.push(data);
    },
    showFail(error, filename) {
      console.error(error, filename);
      this.$notify.error({
        title: `处理失败：${filename}`,
        message: String(error),
        duration: 6500,
      });
    },
    showRejected(files) {
      const preview = files
        .slice(0, 3)
        .map((file) => file.name)
        .join('、');
      this.$notify.warning({
        title: `已忽略 ${files.length} 个非音乐文件`,
        message: files.length > 3 ? `${preview} 等` : preview,
        duration: 4200,
      });
    },
    changePlaying(url) {
      this.playing_url = url;
      this.playing_auto = true;
    },
    trackAudioPlay() {
      track('audio_play_started');
    },
    handleEditCancel() {
      track('control_clicked', { control_id: 'edit_cancel', area: 'metadata_edit' });
      this.showEditDialog = false;
    },
    handleDeleteAll() {
      track('control_clicked', { control_id: 'clear_results', area: 'results' });
      this.tableData.forEach(RemoveBlobMusic);
      this.tableData = [];
      this.playing_url = '';
    },
    async handleZipDownload() {
      if (!this.tableData.length || this.zip_loading) return;
      const zipStartedAt = performance.now();
      const songCount = this.tableData.length;
      const totalBytes = this.tableData.reduce((sum, item) => sum + item.blob.size, 0);
      let status = 'failure';
      let errorCode;
      track('control_clicked', { control_id: 'zip_download', area: 'results' });
      track('zip_requested', {
        song_count: songCount,
        size_bucket: sizeBucket(totalBytes),
        name_policy: this.filenamePolicyName(this.filename_policy),
      });
      this.zip_loading = true;
      this.zip_progress = 0;
      try {
        const zip = await BuildBatchZip(this.tableData, this.filename_policy, (percentage) => {
          this.zip_progress = Math.round(percentage);
        });
        const date = new Date().toISOString().slice(0, 10);
        DownloadBlob(zip, `Omni2MP3_${date}_${this.tableData.length}首.zip`);
        status = 'success';
        this.$notify.success({
          title: 'ZIP 已生成',
          message: `已打包 ${this.tableData.length} 首音乐。`,
          duration: 3000,
        });
      } catch (error) {
        errorCode = 'zip_build_failed';
        this.$notify.error({ title: 'ZIP 生成失败', message: String(error), duration: 6000 });
      } finally {
        track('zip_finished', {
          status,
          zip_ms: Math.round(performance.now() - zipStartedAt),
          song_count: songCount,
          size_bucket: sizeBucket(totalBytes),
          error_code: errorCode,
        });
        this.zip_loading = false;
      }
    },
    filenamePolicyName(policy) {
      const found = this.FilenamePolicies.find((item) => item.key === policy);
      return found ? String(found.key) : 'unknown';
    },
    async handleEdit(data) {
      this.showEditDialog = false;
      URL.revokeObjectURL(this.editing_data.file);
      if (data.picture) {
        URL.revokeObjectURL(this.editing_data.picture);
        this.editing_data.picture = URL.createObjectURL(data.picture);
      }
      this.editing_data.title = data.title;
      this.editing_data.artist = data.artist;
      this.editing_data.album = data.album;
      let writeSuccess = true;
      let notifyMsg = '成功修改 ' + this.editing_data.title;
      try {
        const mime = AudioMimeType[this.editing_data.ext] || AudioMimeType.mp3;
        const musicMeta = await metaParseBlob(new Blob([this.editing_data.blob], { type: mime }));
        let imageInfo;
        if (this.editing_data.picture !== '') imageInfo = await GetImageFromURL(this.editing_data.picture);
        const newMeta = {
          picture: imageInfo?.buffer,
          title: data.title,
          artists: data.artist.split(split_regex),
          album: data.album,
          albumartist: data.albumartist,
          genre: data.genre.split(split_regex),
        };
        const buffer = Buffer.from(await this.editing_data.blob.arrayBuffer());
        if (this.editing_data.ext === 'mp3') {
          this.editing_data.blob = new Blob([RewriteMetaToMp3(buffer, newMeta, musicMeta)], { type: mime });
        } else if (this.editing_data.ext === 'flac') {
          this.editing_data.blob = new Blob([RewriteMetaToFlac(buffer, newMeta, musicMeta)], { type: mime });
        } else {
          writeSuccess = undefined;
          notifyMsg = this.editing_data.ext + ' 类型暂不支持修改音乐标签';
        }
      } catch (error) {
        writeSuccess = false;
        notifyMsg = '写入新元数据时发生错误：' + error;
      }
      this.editing_data.file = URL.createObjectURL(this.editing_data.blob);
      this.$notify({
        title: writeSuccess === true ? '修改成功' : writeSuccess === false ? '修改失败' : '修改取消',
        message: notifyMsg,
        type: writeSuccess === true ? 'success' : writeSuccess === false ? 'error' : 'warning',
        duration: 3200,
      });
      track('control_clicked', { control_id: 'edit_confirm', area: 'metadata_edit' });
      track('metadata_edit_finished', {
        status: writeSuccess === true ? 'success' : writeSuccess === false ? 'failure' : 'unsupported',
        error_code: writeSuccess === false ? 'metadata_write_failed' : writeSuccess === undefined ? 'unsupported_output' : undefined,
      });
    },
    async editFile(data) {
      this.editing_data = data;
      const musicMeta = await metaParseBlob(this.editing_data.blob);
      this.editing_data.albumartist = musicMeta.common.albumartist || '';
      this.editing_data.genre = musicMeta.common.genre?.toString() || '';
      this.showEditDialog = true;
    },
  },
};
</script>

<style lang="scss" scoped>
.home-view {
  display: grid;
  gap: 26px;
}

.result-console,
.result-list {
  position: relative;
  border: 1px solid rgba(20, 38, 46, 0.14);
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 18px 55px rgba(23, 39, 46, 0.08);
}

.result-console {
  padding: 60px clamp(22px, 4vw, 42px) 34px;
}

.section-index {
  position: absolute;
  top: 24px;
  left: 28px;
  color: #0f7273;
  font: 700 12px/1 'Courier New', monospace;
  letter-spacing: 0.12em;
}

.section-index--inline {
  position: static;
  display: block;
  margin-bottom: 8px;
}

.result-console__heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 28px;
}

.section-kicker {
  margin: 0 0 8px;
  color: #ef6f4d;
  font: 700 12px/1 'Courier New', monospace;
  letter-spacing: 0.14em;
}

.result-console h2,
.result-list h2 {
  margin: 0;
  color: #142e37;
  font-family: 'STKaiti', 'KaiTi', 'Microsoft YaHei', serif;
  font-size: clamp(28px, 4vw, 44px);
  line-height: 1.15;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(80px, 1fr));
  gap: 10px;
}

.metric {
  min-width: 88px;
  padding: 13px 16px;
  border-radius: 16px;
  background: #f2eee3;
  text-align: right;
}

.metric span {
  display: block;
  color: #728085;
  font-size: 11px;
}

.metric strong {
  display: block;
  margin-top: 5px;
  color: #263f47;
  font: 700 24px/1 'Courier New', monospace;
}

.metric--success {
  background: #dff0e9;
}
.metric--success strong {
  color: #0f7273;
}
.metric--error {
  background: #f8e5df;
}
.metric--error strong {
  color: #b6492d;
}

.control-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.25fr);
  gap: 18px;
  margin-top: 28px;
}

.control-group {
  min-width: 0;
  padding: 20px;
  border-radius: 18px;
  background: #f8f5ed;
  text-align: left;
}

.control-label {
  display: block;
  margin-bottom: 14px;
  color: #5f7177;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.radio-wrap,
.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
}

.radio-wrap ::v-deep .el-radio {
  margin-right: 0;
}

.button-row ::v-deep .el-button + .el-button {
  margin-left: 0;
}

.storage-note {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 18px;
  color: #687a80;
  font-size: 12px;
  text-align: left;
}

.storage-note__dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #0f7273;
  box-shadow: 0 0 0 5px rgba(15, 114, 115, 0.12);
}

.storage-note__size {
  margin-left: auto;
  font-family: 'Courier New', monospace;
}

audio {
  width: 100%;
  margin: 0;
  border-radius: 14px;
}

.result-list {
  overflow: hidden;
  padding: 28px;
}

.result-list__header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
  text-align: left;
}

.result-list__header > span {
  color: #78878b;
  font-size: 12px;
}

.empty-result {
  min-height: 120px;
  border: 1px dashed rgba(20, 38, 46, 0.22);
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  color: #758489;
  background: rgba(255, 255, 255, 0.36);
}

.empty-result span {
  color: rgba(15, 114, 115, 0.28);
  font: 700 54px/1 'Courier New', monospace;
}

.empty-result p {
  margin: 0;
}

@media (max-width: 860px) {
  .result-console__heading,
  .result-list__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .control-grid {
    grid-template-columns: 1fr;
  }

  .metric-grid {
    width: 100%;
  }
}

@media (max-width: 560px) {
  .result-console,
  .result-list {
    padding-right: 18px;
    padding-left: 18px;
  }

  .button-row ::v-deep .el-button {
    width: 100%;
  }

  .storage-note {
    align-items: flex-start;
  }

  .storage-note__size {
    display: none;
  }
}
</style>
