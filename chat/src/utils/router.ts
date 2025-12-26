import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    component: () => import('@/views/chat/chat.vue'),
    children: [
      {
        path: '',
        name: 'Chat',
        component: () => import('@/views/chat/chatBase.vue'),
      },
      {
        path: 'note-gen',
        name: 'NoteGen',
        component: () => import('@/views/noteGen/index.vue'),
      },
    ],
  },
  {
    path: '/:catchAll(.*)',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
