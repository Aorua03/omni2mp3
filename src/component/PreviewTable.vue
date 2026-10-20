<template>
  <el-table class="preview-table" :data="tableData" style="width: 100%">
    <el-table-column label="封面" width="118">
      <template slot-scope="scope">
        <el-image
          :alt="`${scope.row.title || '歌曲'}封面`"
          :src="scope.row.picture"
          fit="cover"
          style="width: 88px; height: 88px; border-radius: 10px"
        >
          <div slot="error" class="image-slot el-image__error">暂无封面</div>
        </el-image>
      </template>
    </el-table-column>
    <el-table-column label="歌曲">
      <template #default="scope">
        <p>{{ scope.row.title }}</p>
      </template>
    </el-table-column>
    <el-table-column label="歌手">
      <template #default="scope">
        <p>{{ scope.row.artist }}</p>
      </template>
    </el-table-column>
    <el-table-column label="专辑">
      <template #default="scope">
        <p>{{ scope.row.album }}</p>
      </template>
    </el-table-column>
    <el-table-column label="操作" min-width="150">
      <template #default="scope">
        <el-button
          :aria-label="`播放 ${scope.row.title}`"
          :title="`播放 ${scope.row.title}`"
          circle
          icon="el-icon-video-play"
          type="success"
          @click="handlePlay(scope.$index, scope.row)"
        >
        </el-button>
        <el-button
          :aria-label="`编辑 ${scope.row.title}`"
          :title="`编辑 ${scope.row.title}`"
          circle
          icon="el-icon-edit"
          @click="handleEdit(scope.row)"
        ></el-button>
        <el-button
          :aria-label="`删除 ${scope.row.title}`"
          :title="`删除 ${scope.row.title}`"
          circle
          icon="el-icon-delete"
          type="danger"
          @click="handleDelete(scope.$index, scope.row)"
        >
        </el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script>
import { RemoveBlobMusic } from '@/utils/utils';
import { track } from '@/utils/analytics';

export default {
  name: 'PreviewTable',
  props: {
    tableData: { type: Array, required: true },
    policy: { type: Number, required: true },
  },

  methods: {
    handlePlay(index, row) {
      track('control_clicked', { control_id: 'row_play', area: 'results' });
      this.$emit('play', row.file);
    },
    handleDelete(index, row) {
      track('control_clicked', { control_id: 'row_delete', area: 'results' });
      RemoveBlobMusic(row);
      this.tableData.splice(index, 1);
    },
    handleEdit(row) {
      track('control_clicked', { control_id: 'row_edit', area: 'results' });
      this.$emit('edit', row);
    },
  },
};
</script>

<style scoped>
.preview-table >>> .el-table__body-wrapper {
  overflow-x: auto;
}

.preview-table >>> td .cell {
  word-break: break-word;
}
</style>
