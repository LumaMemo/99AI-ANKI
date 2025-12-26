/**
 * 后台管理系统默认访问路径
 * 如果环境变量 ADMIN_SERVE_ROOT 未设置，将使用此默认值
 */
export const DEFAULT_ADMIN_PATH = '/ghjy-lumamemo-admin';

/**
 * 获取当前配置的后台管理系统访问路径
 * @returns 格式如 '/admin' 或 '/custom-path'
 */
export const getAdminPath = (): string => {
  return process.env.ADMIN_SERVE_ROOT || DEFAULT_ADMIN_PATH;
};
