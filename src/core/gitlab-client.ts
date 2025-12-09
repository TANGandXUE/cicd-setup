/**
 * CloudDreamAI CI/CD Setup - GitLab API 客户端
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  GitLabConfig,
  GitLabProject,
  GitLabVariable,
  CICDVariable,
  ApiResult,
} from './types';

/**
 * GitLab API 客户端
 * 封装 GitLab REST API 调用
 */
export class GitLabClient {
  private client: AxiosInstance;
  private config: GitLabConfig;

  constructor(config: GitLabConfig) {
    this.config = config;
    // 确保 baseUrl 格式正确
    const baseUrl = config.baseUrl.replace(/\/$/, '');

    this.client = axios.create({
      baseURL: `${baseUrl}/api/v4`,
      headers: {
        'PRIVATE-TOKEN': config.token,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * 测试连接和 Token 有效性
   */
  async testConnection(): Promise<ApiResult<{ username: string }>> {
    try {
      const response = await this.client.get('/user');
      return {
        success: true,
        data: { username: response.data.username },
      };
    } catch (error) {
      return this.handleError(error, '连接测试失败');
    }
  }

  /**
   * 获取项目信息
   * @param projectPath 项目路径，如 "group/project-name"
   */
  async getProject(projectPath: string): Promise<ApiResult<GitLabProject>> {
    try {
      const encodedPath = encodeURIComponent(projectPath);
      const response = await this.client.get(`/projects/${encodedPath}`);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error, `获取项目 ${projectPath} 失败`);
    }
  }

  /**
   * 根据项目 ID 获取项目信息
   */
  async getProjectById(projectId: number): Promise<ApiResult<GitLabProject>> {
    try {
      const response = await this.client.get(`/projects/${projectId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error, `获取项目 ID ${projectId} 失败`);
    }
  }

  /**
   * 搜索项目
   * @param search 搜索关键词
   */
  async searchProjects(search: string): Promise<ApiResult<GitLabProject[]>> {
    try {
      const response = await this.client.get('/projects', {
        params: {
          search,
          membership: true,
          per_page: 20,
        },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error, '搜索项目失败');
    }
  }

  /**
   * 列出用户有权限的所有项目
   */
  async listProjects(page = 1, perPage = 20): Promise<ApiResult<GitLabProject[]>> {
    try {
      const response = await this.client.get('/projects', {
        params: {
          membership: true,
          page,
          per_page: perPage,
          order_by: 'last_activity_at',
          sort: 'desc',
        },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error, '获取项目列表失败');
    }
  }

  // ============ CI/CD 变量管理 ============

  /**
   * 获取项目的所有 CI/CD 变量
   */
  async listVariables(projectId: number): Promise<ApiResult<GitLabVariable[]>> {
    try {
      const response = await this.client.get(`/projects/${projectId}/variables`);
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error, '获取变量列表失败');
    }
  }

  /**
   * 获取单个变量
   */
  async getVariable(
    projectId: number,
    key: string
  ): Promise<ApiResult<GitLabVariable>> {
    try {
      const response = await this.client.get(
        `/projects/${projectId}/variables/${encodeURIComponent(key)}`
      );
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error, `获取变量 ${key} 失败`);
    }
  }

  /**
   * 创建 CI/CD 变量
   */
  async createVariable(
    projectId: number,
    variable: CICDVariable
  ): Promise<ApiResult<GitLabVariable>> {
    try {
      const response = await this.client.post(
        `/projects/${projectId}/variables`,
        {
          key: variable.key,
          value: variable.value,
          variable_type: variable.variable_type || 'env_var',
          protected: variable.protected ?? false,
          masked: variable.masked ?? false,
          environment_scope: variable.environment_scope || '*',
          description: variable.description,
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error, `创建变量 ${variable.key} 失败`);
    }
  }

  /**
   * 更新 CI/CD 变量
   */
  async updateVariable(
    projectId: number,
    variable: CICDVariable
  ): Promise<ApiResult<GitLabVariable>> {
    try {
      const response = await this.client.put(
        `/projects/${projectId}/variables/${encodeURIComponent(variable.key)}`,
        {
          value: variable.value,
          variable_type: variable.variable_type || 'env_var',
          protected: variable.protected ?? false,
          masked: variable.masked ?? false,
          environment_scope: variable.environment_scope || '*',
          description: variable.description,
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      return this.handleError(error, `更新变量 ${variable.key} 失败`);
    }
  }

  /**
   * 创建或更新变量（如果存在则更新，不存在则创建）
   */
  async upsertVariable(
    projectId: number,
    variable: CICDVariable
  ): Promise<ApiResult<GitLabVariable>> {
    // 先尝试获取变量
    const existing = await this.getVariable(projectId, variable.key);

    if (existing.success) {
      // 变量已存在，更新
      return this.updateVariable(projectId, variable);
    } else {
      // 变量不存在，创建
      return this.createVariable(projectId, variable);
    }
  }

  /**
   * 删除 CI/CD 变量
   */
  async deleteVariable(
    projectId: number,
    key: string
  ): Promise<ApiResult<void>> {
    try {
      await this.client.delete(
        `/projects/${projectId}/variables/${encodeURIComponent(key)}`
      );
      return { success: true };
    } catch (error) {
      return this.handleError(error, `删除变量 ${key} 失败`);
    }
  }

  /**
   * 批量创建或更新变量
   */
  async batchUpsertVariables(
    projectId: number,
    variables: CICDVariable[]
  ): Promise<{ success: string[]; failed: Array<{ key: string; error: string }> }> {
    const success: string[] = [];
    const failed: Array<{ key: string; error: string }> = [];

    for (const variable of variables) {
      const result = await this.upsertVariable(projectId, variable);
      if (result.success) {
        success.push(variable.key);
      } else {
        failed.push({ key: variable.key, error: result.error || '未知错误' });
      }
    }

    return { success, failed };
  }

  /**
   * 统一错误处理
   */
  private handleError(error: unknown, context: string): ApiResult<never> {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string; error?: string }>;
      const status = axiosError.response?.status;
      const message =
        axiosError.response?.data?.message ||
        axiosError.response?.data?.error ||
        axiosError.message;

      if (status === 401) {
        return { success: false, error: `${context}: Token 无效或已过期` };
      }
      if (status === 403) {
        return { success: false, error: `${context}: 权限不足` };
      }
      if (status === 404) {
        return { success: false, error: `${context}: 资源不存在` };
      }

      return { success: false, error: `${context}: ${message}` };
    }

    return { success: false, error: `${context}: ${String(error)}` };
  }
}

/**
 * 创建 GitLab 客户端实例
 */
export function createGitLabClient(config: GitLabConfig): GitLabClient {
  return new GitLabClient(config);
}
