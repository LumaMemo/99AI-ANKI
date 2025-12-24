<route lang="yaml">
meta:
  title: 任务详情
</route>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ApiNoteGen from '@/api/modules/notegen';
import { utcToShanghaiTime } from '@/utils/utcFormatTime';
import { ElMessage } from 'element-plus';
import { QuestionFilled } from '@element-plus/icons-vue';

const route = useRoute();
const router = useRouter();
const jobId = route.params.jobId as string;
const loading = ref(false);
const job = ref<any>(null);

const fetchData = async () => {
  loading.value = true;
  try {
    const res = await ApiNoteGen.getJobDetail(jobId);
    job.value = res.data;
  } catch (error) {
    console.error(error);
    ElMessage.error('获取详情失败');
  } finally {
    loading.value = false;
  }
};

const handleDownload = async (row: any) => {
  try {
    const res = await ApiNoteGen.getSignedUrl(jobId, row.type);
    if (res.data && res.data.url) {
      window.open(res.data.url, '_blank');
    } else {
      ElMessage.error('获取下载链接失败');
    }
  } catch (error) {
    console.error(error);
    ElMessage.error('获取下载链接失败');
  }
};

const getStatusType = (status: string) => {
  switch (status) {
    case 'completed': return 'success';
    case 'processing': return 'primary';
    case 'failed': return 'danger';
    case 'incomplete': return 'warning';
    default: return 'info';
  }
};

const getStatusLabel = (status: string) => {
  const labels: any = {
    created: '已创建',
    processing: '处理中',
    completed: '已完成',
    incomplete: '未完成',
    failed: '失败',
  };
  return labels[status] || status;
};

const getStepStatusType = (status: string) => {
  switch (status) {
    case 'success': return 'success';
    case 'failed': return 'danger';
    case 'skipped': return 'info';
    default: return '';
  }
};

const getStepStatusLabel = (status: string) => {
  const labels: any = {
    success: '成功',
    failed: '失败',
    skipped: '跳过',
  };
  return labels[status] || status;
};

onMounted(() => {
  fetchData();
});
</script>

<template>
  <div class="p-4">
    <el-page-header @back="router.back()">
      <template #content>
        <span class="text-large font-600 mr-3"> 任务详情 </span>
        <el-tag v-if="job" :type="getStatusType(job.status)">{{ getStatusLabel(job.status) }}</el-tag>
      </template>
    </el-page-header>

    <div v-if="job" class="mt-4 space-y-4">
      <!-- 基础信息 -->
      <el-card header="基础信息" shadow="never">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="任务ID">{{ job.jobId }}</el-descriptions-item>
          <el-descriptions-item label="用户ID">{{ job.userId }}</el-descriptions-item>
          <el-descriptions-item label="PDF文件名">{{ job.pdfFileName }}</el-descriptions-item>
          <el-descriptions-item label="页数">{{ job.pageCount }}</el-descriptions-item>
          <el-descriptions-item label="进度">
            <el-progress :percentage="job.progressPercent" style="width: 150px" />
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ utcToShanghaiTime(job.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ job.startedAt ? utcToShanghaiTime(job.startedAt) : '-' }}</el-descriptions-item>
          <el-descriptions-item label="完成时间">{{ job.completedAt ? utcToShanghaiTime(job.completedAt) : '-' }}</el-descriptions-item>
          <el-descriptions-item label="流水线">{{ job.pipelineKey }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- PDF 快照 -->
      <el-card header="PDF 快照" shadow="never">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="Bucket">{{ job.pdfCosBucket }}</el-descriptions-item>
          <el-descriptions-item label="Region">{{ job.pdfCosRegion }}</el-descriptions-item>
          <el-descriptions-item label="Key" :span="2">{{ job.pdfCosKey }}</el-descriptions-item>
          <el-descriptions-item label="Etag">{{ job.pdfEtag }}</el-descriptions-item>
          <el-descriptions-item label="文件大小">{{ (job.pdfSizeBytes / 1024 / 1024).toFixed(2) }} MB</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 计费概览 -->
      <el-card header="计费概览" shadow="never">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="预估点数">{{ job.estimatedCostMinPoints }} ~ {{ job.estimatedCostMaxPoints }}</el-descriptions-item>
          <el-descriptions-item label="实际扣除点数">
            <span class="font-bold text-primary">{{ job.chargedPoints || 0 }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="结算状态">
            <el-tag :type="job.chargeStatus === 'charged' ? 'success' : 'info'">
              {{ job.chargeStatus === 'charged' ? '已结算' : '未结算' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="总消耗 Token">{{ job.totalTokens || 0 }}</el-descriptions-item>
          <el-descriptions-item label="扣费类型">普通积分</el-descriptions-item>
          <el-descriptions-item label="配置版本">V{{ job.configVersion }} (ID: {{ job.configId }})</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 存储与清理 -->
      <el-card header="存储与清理" shadow="never">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="COS 前缀" :span="2">{{ job.resultCosPrefix }}</el-descriptions-item>
          <el-descriptions-item label="上传状态">
            <el-tag :type="job.cosUploadStatus === 'done' ? 'success' : 'info'">{{ job.cosUploadStatus }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="上传完成时间">{{ job.cosUploadedAt ? utcToShanghaiTime(job.cosUploadedAt) : '-' }}</el-descriptions-item>
          <el-descriptions-item label="计划清理时间">{{ job.cleanupAt ? utcToShanghaiTime(job.cleanupAt) : '-' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 计费明细 (Step Usage) -->
      <el-card header="计费明细" shadow="never">
        <el-table :data="job.stepUsages" border stripe>
          <el-table-column prop="stepNumber" label="步骤" width="80" align="center" />
          <el-table-column prop="modelName" label="使用模型" min-width="150" />
          <el-table-column width="220">
            <template #header>
              <span>Token 消耗 (P/C/T)</span>
              <el-tooltip content="P: Prompt (输入), C: Completion (输出), T: Total (总计)" placement="top">
                <el-icon class="ml-1 cursor-help"><QuestionFilled /></el-icon>
              </el-tooltip>
            </template>
            <template #default="{ row }">
              {{ row.promptTokens }} / {{ row.completionTokens }} / {{ row.totalTokens }}
            </template>
          </el-table-column>
          <el-table-column prop="providerCost" label="上游成本" width="100" align="center" />
          <el-table-column prop="chargedPoints" label="折算点数" width="100" align="center" />
          <el-table-column prop="status" label="执行状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="getStepStatusType(row.status)">{{ getStepStatusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="chargeStatus" label="结算状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.chargeStatus === 'charged' ? 'success' : 'info'">
                {{ row.chargeStatus === 'charged' ? '已计入' : '未计入' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="endedAt" label="结束时间" width="180">
            <template #default="{ row }">
              {{ row.endedAt ? utcToShanghaiTime(row.endedAt) : '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="errorMessage" label="错误信息" min-width="200" show-overflow-tooltip />
        </el-table>
      </el-card>

      <!-- 产物列表 -->
      <el-card header="产物列表" shadow="never">
        <el-table :data="job.artifacts" border>
          <el-table-column prop="type" label="类型" width="180" />
          <el-table-column prop="fileName" label="文件名" min-width="200" />
          <el-table-column prop="sizeBytes" label="大小">
            <template #default="{ row }">
              {{ (row.sizeBytes / 1024 / 1024).toFixed(2) }} MB
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 'ready' ? 'success' : 'info'">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" align="center">
            <template #default="{ row }">
              <el-button v-if="row.status === 'ready'" type="primary" link @click="handleDownload(row)">下载</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 错误诊断 -->
      <el-card v-if="job.lastErrorCode || job.lastErrorMessage" header="错误诊断" shadow="never">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="错误码">{{ job.lastErrorCode }}</el-descriptions-item>
          <el-descriptions-item label="错误时间">{{ job.lastErrorAt ? utcToShanghaiTime(job.lastErrorAt) : '-' }}</el-descriptions-item>
          <el-descriptions-item label="错误消息" :span="2">{{ job.lastErrorMessage }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="job.lastErrorStack" class="mt-4">
          <div class="text-sm font-bold mb-2">错误堆栈:</div>
          <pre class="bg-gray-100 p-4 rounded overflow-auto max-h-60 text-xs">{{ job.lastErrorStack }}</pre>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.text-large {
  font-size: 1.25rem;
}
.font-600 {
  font-weight: 600;
}
</style>
