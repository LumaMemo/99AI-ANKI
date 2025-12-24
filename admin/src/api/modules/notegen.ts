import request from '../index';

export default {
  // 获取配置
  getConfig: () => request.get('/admin/note-gen/config'),
  // 更新配置
  updateConfig: (data: any) => request.put('/admin/note-gen/config', data),
  // 获取任务列表
  listJobs: (params: any) => request.get('/admin/note-gen/jobs', { params }),
  // 获取任务详情
  getJobDetail: (jobId: string) => request.get(`/admin/note-gen/jobs/${jobId}`),
  // 获取产物下载链接
  getSignedUrl: (jobId: string, fileType: string) => request.get(`/admin/note-gen/jobs/${jobId}/files/${fileType}/signed-url`),
};
