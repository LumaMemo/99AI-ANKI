import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/note-gen',
  component: Layout,
  redirect: '/note-gen/jobs',
  name: 'noteGenMenu',
  meta: {
    title: '笔记生成',
    icon: 'material-symbols:note-add-outline',
  },
  children: [
    {
      path: 'jobs',
      name: 'noteGenJobs',
      component: () => import('@/views/notegen/index.vue'),
      meta: {
        title: '任务管理',
        icon: 'material-symbols:task-outline',
      },
    },
    {
      path: 'config',
      name: 'noteGenConfig',
      component: () => import('@/views/notegen/config.vue'),
      meta: {
        title: '配置管理',
        icon: 'material-symbols:settings-outline',
      },
    },
    {
      path: 'detail/:jobId',
      name: 'noteGenDetail',
      component: () => import('@/views/notegen/detail.vue'),
      meta: {
        title: '任务详情',
        sidebar: false,
        activeMenu: '/note-gen/jobs',
      },
    },
  ],
};

export default routes;
