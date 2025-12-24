import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/ai',
  component: Layout,
  redirect: '/ai/chat-key-list',
  name: 'AiMenu',
  meta: {
    title: '模型管理',
    icon: 'hugeicons:ai-book',
  },
  children: [
    {
      path: 'keys',
      name: 'AiMenuKeys',
      component: () => import('@/views/models/key.vue'),
      meta: { title: '模型设置', icon: 'ph:open-ai-logo-light' },
    },
    {
      path: 'baseSetting',
      name: 'baseSetting',
      component: () => import('@/views/models/baseSetting.vue'),
      meta: {
        title: '基础配置',
        icon: 'lets-icons:setting-line',
      },
    },
    {
      path: 'note-gen-config',
      name: 'noteGenConfig',
      component: () => import('@/views/notegen/config.vue'),
      meta: {
        title: '笔记生成配置',
        icon: 'material-symbols:settings-outline',
      },
    },
  ],
};

export default routes;
