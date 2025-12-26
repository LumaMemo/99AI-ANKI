<route lang="yaml">
meta:
  title: 笔记管理
</route>

<script lang="ts" setup>
import { ref, onMounted, reactive } from 'vue';
import { useRouter } from 'vue-router';
import ApiNoteGen from '@/api/modules/notegen';
import { utcToShanghaiTime } from '@/utils/utcFormatTime';
import { ElMessage } from 'element-plus';

const router = useRouter();
const loading = ref(false);
const tableData = ref([]);
const total = ref(0);

const queryForm = reactive({
  page: 1,
  size: 10,
  status: '',
  userId: '',
  kbPdfId: '',
  jobId: '',
});

const statusOptions = [
  { label: '全部', value: '' },
  { label: '已创建', value: 'created' },
  { label: '处理中', value: 'processing' },
  { label: '已完成', value: 'completed' },
  { label: '未完成', value: 'incomplete' },
  { label: '失败', value: 'failed' },
];

const getStatusType = (status: string): 'success' | 'info' | 'warning' | 'danger' | 'primary' => {
  switch (status) {
    case 'completed': return 'success';
    case 'processing': return 'primary';
    case 'failed': return 'danger';
    case 'incomplete': return 'warning';
    default: return 'info';
  }
};

const getStatusLabel = (status: string) => {
  const option = statusOptions.find(o => o.value === status);
  return option ? option.label : status;
};

const fetchData = async () => {
  loading.value = true;
  try {
    const res = await ApiNoteGen.listJobs(queryForm);
    tableData.value = res.data.rows;
    total.value = res.data.count;
  } catch (error) {
    console.error(error);
    ElMessage.error('获取任务列表失败');
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  queryForm.page = 1;
  fetchData();
};

const handleDetail = (row: any) => {
  router.push(`/chat/note-gen-detail/${row.jobId}`);
};

onMounted(() => {
  fetchData();
});
</script>

<template>
  <div class="p-4">
    <el-card shadow="never">
      <el-form :inline="true" :model="queryForm" class="mb-4">
        <el-form-item label="任务ID">
          <el-input v-model="queryForm.jobId" placeholder="请输入任务ID" clearable style="width: 200px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="用户ID">
          <el-input v-model="queryForm.userId" placeholder="请输入用户ID" clearable style="width: 120px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="KB PDF ID">
          <el-input v-model="queryForm.kbPdfId" placeholder="请输入PDF ID" clearable style="width: 120px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="queryForm.status" placeholder="请选择状态" clearable style="width: 150px" @change="handleSearch">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
        </el-form-item>
      </el-form>

      <el-table v-loading="loading" :data="tableData" border style="width: 100%">
        <el-table-column prop="jobId" label="任务ID" width="320" />
        <el-table-column prop="userId" label="用户ID" width="80" align="center" />
        <el-table-column prop="kbPdfId" label="PDF ID" width="80" align="center" />
        <el-table-column prop="pipelineKey" label="流水线" width="120" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.pipelineKey }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="configVersion" label="配置版本" width="90" align="center">
          <template #default="{ row }">
            v{{ row.configVersion }}
          </template>
        </el-table-column>
        <el-table-column prop="pdfFileName" label="文件名" min-width="200" show-overflow-tooltip />
        <el-table-column prop="pageCount" label="页数" width="80" align="center" />
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="progressPercent" label="进度" width="180">
          <template #default="{ row }">
            <el-progress :percentage="row.progressPercent" :status="row.status === 'completed' ? 'success' : (row.status === 'failed' ? 'exception' : undefined)" />
          </template>
        </el-table-column>
        <el-table-column prop="chargedPoints" label="扣除点数" width="100" align="center" />
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ utcToShanghaiTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="queryForm.page"
          v-model:page-size="queryForm.size"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSearch"
          @current-change="fetchData"
        />
      </div>
    </el-card>
  </div>
</template>
