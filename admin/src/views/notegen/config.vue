<route lang="yaml">
meta:
  title: 笔记生成配置
</route>

<script lang="ts" setup>
import { ref, onMounted, reactive } from 'vue';
import ApiNoteGen from '@/api/modules/notegen';
import ApiModels from '@/api/modules/models';
import { utcToShanghaiTime } from '@/utils/utcFormatTime';
import { ElMessage } from 'element-plus';

const loading = ref(false);
const models = ref([]);
const metadata = reactive({
  version: 0,
  updatedByAdminId: 0,
  updatedAt: '',
  remark: ''
});

const config = reactive({
  name: '',
  remark: '',
  configJson: {
    steps: {
      "1": { modelName: "gpt-5-mini", concurrency: 50, maxRetries: 3, zoom: 3.0 },
      "2": { modelName: "gemini-3-pro-preview", chunkSize: 10, overlapPages: 3 },
      "3": { softLimitChars: 4000, hardLimitChars: 16384 },
      "4": { modelName: "gemini-3-pro-preview", concurrency: 50, maxRetries: 3 },
      "5": { reserved: true },
      "8": { outputs: { markdown: false, markdownMarkmap: true, word: false } }
    }
  }
});

const fetchModels = async () => {
  try {
    const res = await ApiModels.queryModels({ page: 1, size: 1000 });
    models.value = res.data.rows;
  } catch (error) {
    console.error(error);
  }
};

const fetchConfig = async () => {
  loading.value = true;
  try {
    const res = await ApiNoteGen.getConfig();
    if (res.data) {
      config.name = res.data.name;
      // 保持 remark 为空，强制用户输入新版本的变更说明
      config.remark = ''; 
      
      // 合并配置，确保新字段有默认值
      if (res.data.configJson && res.data.configJson.steps) {
        Object.keys(res.data.configJson.steps).forEach(key => {
          if (config.configJson.steps[key]) {
            // 特殊处理 Step 8 的嵌套对象
            if (key === '8' && res.data.configJson.steps[key].outputs) {
              config.configJson.steps[key].outputs = {
                ...config.configJson.steps[key].outputs,
                ...res.data.configJson.steps[key].outputs
              };
            } else {
              config.configJson.steps[key] = {
                ...config.configJson.steps[key],
                ...res.data.configJson.steps[key]
              };
            }
          } else {
            config.configJson.steps[key] = res.data.configJson.steps[key];
          }
        });
      }

      metadata.version = res.data.version;
      metadata.updatedByAdminId = res.data.updatedByAdminId;
      metadata.updatedAt = res.data.updatedAt;
      metadata.remark = res.data.remark;
    }
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const handleSave = async () => {
  if (!config.name || !config.remark) {
    return ElMessage.warning('请填写名称和备注');
  }
  loading.value = true;
  try {
    await ApiNoteGen.updateConfig(config);
    ElMessage.success('保存成功');
    fetchConfig();
  } catch (error) {
    console.error(error);
    ElMessage.error('保存失败');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchModels();
  fetchConfig();
});
</script>

<template>
  <div class="p-4">
    <el-card header="当前版本信息" shadow="never" class="mb-4" v-if="metadata.version">
      <el-descriptions :column="3" border size="small">
        <el-descriptions-item label="当前版本">
          <el-tag size="small">v{{ metadata.version }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="最后修改人 ID">{{ metadata.updatedByAdminId }}</el-descriptions-item>
        <el-descriptions-item label="最后更新时间">{{ utcToShanghaiTime(metadata.updatedAt) }}</el-descriptions-item>
        <el-descriptions-item label="版本说明" :span="3">{{ metadata.remark }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card header="笔记生成配置 (版本化)" shadow="never">
      <el-form :model="config" label-width="140px" style="max-width: 900px">
        <el-form-item label="配置名称" required>
          <el-input v-model="config.name" placeholder="例如：2025标准配置" />
        </el-form-item>
        <el-form-item label="变更说明" required>
          <el-input v-model="config.remark" type="textarea" placeholder="请说明本次修改的原因（将作为新版本的说明）" />
        </el-form-item>

        <el-form-item label="计费类型">
          <el-tag type="success">普通积分 (Model 3)</el-tag>
          <div class="text-gray-400 text-xs mt-1">当前所有步骤模型均统一消耗普通积分。</div>
        </el-form-item>

        <el-divider content-position="left">Step 1: PDF 解析与目录提取</el-divider>
        <el-form-item label="使用模型">
          <el-select v-model="config.configJson.steps['1'].modelName" placeholder="请选择模型" filterable clearable style="width: 100%">
            <el-option v-for="m in models" :key="m.modelName" :label="m.modelName" :value="m.modelName" />
          </el-select>
        </el-form-item>
        <el-form-item label="高级参数">
          <el-row :gutter="20">
            <el-col :span="8">
              <div class="flex items-center">
                <span class="mr-2 text-gray-500 whitespace-nowrap">并发数:</span>
                <el-input-number v-model="config.configJson.steps['1'].concurrency" :min="1" :max="100" size="small" style="width: 100%" />
              </div>
            </el-col>
            <el-col :span="8">
              <div class="flex items-center">
                <span class="mr-2 text-gray-500 whitespace-nowrap">重试次数:</span>
                <el-input-number v-model="config.configJson.steps['1'].maxRetries" :min="0" :max="10" size="small" style="width: 100%" />
              </div>
            </el-col>
            <el-col :span="8">
              <div class="flex items-center">
                <span class="mr-2 text-gray-500 whitespace-nowrap">缩放(Zoom):</span>
                <el-input-number v-model="config.configJson.steps['1'].zoom" :min="1" :max="5" :precision="1" :step="0.5" size="small" style="width: 100%" />
              </div>
            </el-col>
          </el-row>
        </el-form-item>

        <el-divider content-position="left">Step 2: 内容分块与语义识别</el-divider>
        <el-form-item label="使用模型">
          <el-select v-model="config.configJson.steps['2'].modelName" placeholder="请选择模型" filterable clearable style="width: 100%">
            <el-option v-for="m in models" :key="m.modelName" :label="m.modelName" :value="m.modelName" />
          </el-select>
        </el-form-item>
        <el-form-item label="高级参数">
          <el-row :gutter="20">
            <el-col :span="12">
              <div class="flex items-center">
                <span class="mr-2 text-gray-500 whitespace-nowrap">分块大小:</span>
                <el-input-number v-model="config.configJson.steps['2'].chunkSize" :min="1" :max="100" size="small" style="width: 100%" />
              </div>
            </el-col>
            <el-col :span="12">
              <div class="flex items-center">
                <span class="mr-2 text-gray-500 whitespace-nowrap">重叠页数:</span>
                <el-input-number v-model="config.configJson.steps['2'].overlapPages" :min="0" :max="10" size="small" style="width: 100%" />
              </div>
            </el-col>
          </el-row>
        </el-form-item>

        <el-divider content-position="left">Step 3: 任务限制</el-divider>
        <el-form-item label="限制参数">
          <el-row :gutter="20">
            <el-col :span="12">
              <div class="flex items-center">
                <span class="mr-2 text-gray-500 whitespace-nowrap">软限制 (字符):</span>
                <el-input-number v-model="config.configJson.steps['3'].softLimitChars" :min="1000" :max="50000" :step="1000" size="small" style="width: 100%" />
              </div>
            </el-col>
            <el-col :span="12">
              <div class="flex items-center">
                <span class="mr-2 text-gray-500 whitespace-nowrap">硬限制 (字符):</span>
                <el-input-number v-model="config.configJson.steps['3'].hardLimitChars" :min="1000" :max="100000" :step="1000" size="small" style="width: 100%" />
              </div>
            </el-col>
          </el-row>
        </el-form-item>

        <el-divider content-position="left">Step 4: 核心知识点提取</el-divider>
        <el-form-item label="使用模型">
          <el-select v-model="config.configJson.steps['4'].modelName" placeholder="请选择模型" filterable clearable style="width: 100%">
            <el-option v-for="m in models" :key="m.modelName" :label="m.modelName" :value="m.modelName" />
          </el-select>
        </el-form-item>
        <el-form-item label="高级参数">
          <el-row :gutter="20">
            <el-col :span="12">
              <div class="flex items-center">
                <span class="mr-2 text-gray-500 whitespace-nowrap">并发数:</span>
                <el-input-number v-model="config.configJson.steps['4'].concurrency" :min="1" :max="100" size="small" style="width: 100%" />
              </div>
            </el-col>
            <el-col :span="12">
              <div class="flex items-center">
                <span class="mr-2 text-gray-500 whitespace-nowrap">重试次数:</span>
                <el-input-number v-model="config.configJson.steps['4'].maxRetries" :min="0" :max="10" size="small" style="width: 100%" />
              </div>
            </el-col>
          </el-row>
        </el-form-item>

        <el-divider content-position="left">Step 5: 整理卡片 (系统内置)</el-divider>
        <el-form-item label="处理参数">
          <el-checkbox v-model="config.configJson.steps['5'].reserved" disabled>启用卡片归档 (固定开启)</el-checkbox>
          <div class="text-gray-400 text-xs mt-1">该步骤负责卡片 UID 生成与目录归档，为系统核心逻辑，不可修改。</div>
        </el-form-item>

        <el-divider content-position="left">Step 8: 产物输出</el-divider>
        <el-form-item label="输出格式">
          <el-checkbox v-model="config.configJson.steps['8'].outputs.markdown">纯 Markdown 笔记</el-checkbox>
          <el-checkbox v-model="config.configJson.steps['8'].outputs.markdownMarkmap">Markdown (含 Markmap)</el-checkbox>
          <el-checkbox v-model="config.configJson.steps['8'].outputs.word">Word 文档</el-checkbox>
        </el-form-item>

        <el-divider />

        <el-form-item>
          <el-button type="primary" :loading="loading" @click="handleSave">保存并启用新版本</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>
