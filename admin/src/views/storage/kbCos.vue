<route lang="yaml">
meta:
  title: 知识库COS设置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type { FormInstance } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';

  const formInline = reactive({
    kbTencentCosStatus: '',
    kbCosSecretId: '',
    kbCosSecretKey: '',
    kbCosBucket: '',
    kbCosRegion: '',
    kbCosPrefix: 'kb',
    kbCosSignedUrlExpiresSeconds: '600',
    kbSinglePdfMaxBytes: '104857600',
  });

  const formRef = ref<FormInstance>();

  async function queryAllconfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'kbTencentCosStatus',
        'kbCosSecretId',
        'kbCosSecretKey',
        'kbCosBucket',
        'kbCosRegion',
        'kbCosPrefix',
        'kbCosSignedUrlExpiresSeconds',
        'kbSinglePdfMaxBytes',
      ],
    });
    Object.assign(formInline, res.data);
  }

  function handlerUpdateConfig() {
    formRef.value?.validate(async (valid) => {
      if (valid) {
        try {
          await apiConfig.setConfig({ settings: fotmatSetting(formInline) });
          ElMessage.success('变更配置信息成功');
        } catch (error) {}
        queryAllconfig();
      } else {
        ElMessage.error('请填写完整信息');
      }
    });
  }

  function fotmatSetting(settings: any) {
    return Object.keys(settings).map((key) => {
      return {
        configKey: key,
        configVal: settings[key],
      };
    });
  }

  const requiredIfEnabledRules = computed(() => {
    return [
      {
        required: Number(formInline.kbTencentCosStatus) === 1,
        message: '开启配置后请填写此项',
        trigger: 'change',
      },
    ];
  });

  const positiveIntRules = [
    {
      validator: (_rule: any, value: any, callback: any) => {
        if (Number(formInline.kbTencentCosStatus) !== 1) return callback();
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
          return callback(new Error('请输入正整数'));
        }
        return callback();
      },
      trigger: 'blur',
    },
  ];

  onMounted(() => {
    queryAllconfig();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">知识库 COS 参数设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            该页面用于配置“知识库 PDF”功能的 COS 私有存储参数（与普通上传配置分离）。
            需前往腾讯云申请对象存储服务，更多配置及申请详见<a
              href="https://console.cloud.tencent.com/cos"
              target="_blank"
              >腾讯云COS</a
            >。
          </div>
        </div>
      </template>
      <HButton outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-form ref="formRef" :model="formInline" label-width="160px">
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="启用状态" prop="kbTencentCosStatus">
              <el-switch
                v-model="formInline.kbTencentCosStatus"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="SecretId" prop="kbCosSecretId" :rules="requiredIfEnabledRules">
              <el-input
                v-model="formInline.kbCosSecretId"
                placeholder="请填写 KB COS SecretId"
                type="password"
                show-password
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="SecretKey"
              prop="kbCosSecretKey"
              :rules="requiredIfEnabledRules"
            >
              <el-input
                v-model="formInline.kbCosSecretKey"
                placeholder="请填写 KB COS SecretKey"
                type="password"
                show-password
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="存储桶名称" prop="kbCosBucket" :rules="requiredIfEnabledRules">
              <el-input
                v-model="formInline.kbCosBucket"
                placeholder='如：test-1250000000'
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="所属地域" prop="kbCosRegion" :rules="requiredIfEnabledRules">
              <el-input
                v-model="formInline.kbCosRegion"
                placeholder="如：ap-guangzhou"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="对象前缀" prop="kbCosPrefix">
              <el-input v-model="formInline.kbCosPrefix" placeholder="默认 kb" clearable />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="签名URL有效期(秒)"
              prop="kbCosSignedUrlExpiresSeconds"
              :rules="positiveIntRules"
            >
              <el-input
                v-model="formInline.kbCosSignedUrlExpiresSeconds"
                placeholder="默认 600"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="单文件上限(bytes)"
              prop="kbSinglePdfMaxBytes"
              :rules="positiveIntRules"
            >
              <el-input v-model="formInline.kbSinglePdfMaxBytes" placeholder="默认 104857600" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
