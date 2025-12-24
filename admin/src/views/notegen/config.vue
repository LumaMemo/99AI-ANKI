<route lang="yaml">
meta:
  title: 配置管理
</route>

<script lang="ts" setup>
import { ref, onMounted, reactive } from 'vue';
import ApiNoteGen from '@/api/modules/notegen';
import ApiModels from '@/api/modules/models';
import { ElMessage } from 'element-plus';

const loading = ref(false);
const models = ref([]);
const config = reactive({
  name: '',
  remark: '',
  configJson: {
    steps: {
      "1": { modelName: "" },
      "2": { modelName: "" },
      "4": { modelName: "" }
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
      config.remark = res.data.remark;
      config.configJson = res.data.configJson;
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
    <el-card header="笔记生成配置 (版本化)" shadow="never">
      <el-form :model="config" label-width="120px" style="max-width: 800px">
        <el-form-item label="配置名称" required>
          <el-input v-model="config.name" placeholder="例如：2025标准配置" />
        </el-form-item>
        <el-form-item label="变更说明" required>
          <el-input v-model="config.remark" type="textarea" placeholder="请说明本次修改的原因" />
        </el-form-item>

        <el-divider content-position="left">步骤模型映射</el-divider>
        
        <el-form-item label="Step 1 (解析)">
          <el-select v-model="config.configJson.steps['1'].modelName" placeholder="请选择模型" filterable clearable style="width: 100%">
            <el-option v-for="m in models" :key="m.modelName" :label="m.modelName" :value="m.modelName" />
          </el-select>
          <div class="text-xs text-gray-400 mt-1">用于 PDF 结构解析与目录提取</div>
        </el-form-item>

        <el-form-item label="Step 2 (分块)">
          <el-select v-model="config.configJson.steps['2'].modelName" placeholder="请选择模型" filterable clearable style="width: 100%">
            <el-option v-for="m in models" :key="m.modelName" :label="m.modelName" :value="m.modelName" />
          </el-select>
          <div class="text-xs text-gray-400 mt-1">用于内容分块与语义识别</div>
        </el-form-item>

        <el-form-item label="Step 4 (提取)">
          <el-select v-model="config.configJson.steps['4'].modelName" placeholder="请选择模型" filterable clearable style="width: 100%">
            <el-option v-for="m in models" :key="m.modelName" :label="m.modelName" :value="m.modelName" />
          </el-select>
          <div class="text-xs text-gray-400 mt-1">用于核心知识点提取（最消耗 Token）</div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="loading" @click="handleSave">保存并启用新版本</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>
