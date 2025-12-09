/**
 * CloudDreamAI CI/CD Setup - 变量配置器
 * 根据项目类型生成所需的 CI/CD 变量列表
 */

import { CICDVariable, CICDConfig, ProjectType } from './types';

/**
 * 变量定义模板
 * 定义每个变量的属性和描述
 */
interface VariableDefinition {
  key: string;
  description: string;
  protected: boolean;
  masked: boolean;
  variable_type: 'env_var' | 'file';
  /** 从配置中获取值的路径 */
  configPath?: string;
  /** 是否必需 */
  required: boolean;
}

/**
 * 通用变量定义（所有项目类型都需要）
 */
const COMMON_VARIABLES: VariableDefinition[] = [
  {
    key: 'GITLAB_ACCESS_TOKEN',
    description: 'GitLab Personal Access Token，用于 CI/CD 中的 Git 操作',
    protected: true,
    masked: true,
    variable_type: 'env_var',
    required: true,
  },
  {
    key: 'SSH_PASSWORD',
    description: '部署服务器的 SSH 密码',
    protected: false,
    masked: true,
    variable_type: 'env_var',
    required: true,
  },
  {
    key: 'TEST_SERVER_HOST',
    description: '测试/开发服务器 IP 地址或主机名',
    protected: false,
    masked: false,
    variable_type: 'env_var',
    required: true,
  },
  {
    key: 'PROD_SERVER_HOST',
    description: '生产服务器 IP 地址或主机名',
    protected: true,
    masked: false,
    variable_type: 'env_var',
    required: true,
  },
];

/**
 * 环境变量文件（后端项目需要）
 */
const ENV_FILE_VARIABLES: VariableDefinition[] = [
  {
    key: 'DEV_ENV_FILE',
    description: '开发环境 .env 文件内容',
    protected: false,
    masked: false,
    variable_type: 'file',
    required: false,
  },
  {
    key: 'PROD_ENV_FILE',
    description: '生产环境 .env 文件内容',
    protected: false,
    masked: false,
    variable_type: 'file',
    required: false,
  },
];

/**
 * 变量配置器
 */
export class VariableConfigurator {
  /**
   * 根据项目类型获取所需的变量定义
   */
  getVariableDefinitions(projectType: ProjectType): VariableDefinition[] {
    const definitions = [...COMMON_VARIABLES];

    // 后端项目需要环境变量文件
    if (projectType === 'nestjs' || projectType === 'node') {
      definitions.push(...ENV_FILE_VARIABLES);
    }

    // 前端项目也可能需要环境变量文件（用于构建时注入）
    if (projectType === 'vue' || projectType === 'react') {
      definitions.push(...ENV_FILE_VARIABLES);
    }

    return definitions;
  }

  /**
   * 从配置对象生成变量列表
   */
  generateVariables(config: CICDConfig): CICDVariable[] {
    const variables: CICDVariable[] = [];

    // GitLab Access Token
    variables.push({
      key: 'GITLAB_ACCESS_TOKEN',
      value: config.gitlab.token,
      protected: true,
      masked: true,
      variable_type: 'env_var',
      description: 'GitLab Personal Access Token',
    });

    // GitLab Container Registry 使用 CI 预定义变量，无需额外配置

    // SSH 密码（不设置 protected，确保所有分支都能访问）
    variables.push({
      key: 'SSH_PASSWORD',
      value: config.sshPassword,
      protected: false,
      masked: true,
      variable_type: 'env_var',
      description: '部署服务器 SSH 密码',
    });

    // 服务器配置
    variables.push({
      key: 'TEST_SERVER_HOST',
      value: config.server.testServerHost,
      protected: false,
      masked: false,
      variable_type: 'env_var',
      description: '测试服务器主机',
    });

    variables.push({
      key: 'PROD_SERVER_HOST',
      value: config.server.prodServerHost,
      protected: true,
      masked: false,
      variable_type: 'env_var',
      description: '生产服务器主机',
    });

    // 环境变量文件（如果提供，不设置 protected 确保所有分支都能访问）
    if (config.devEnvFile) {
      variables.push({
        key: 'DEV_ENV_FILE',
        value: config.devEnvFile,
        protected: false,
        masked: false,
        variable_type: 'file',
        description: '开发环境 .env 文件',
      });
    }

    if (config.prodEnvFile) {
      variables.push({
        key: 'PROD_ENV_FILE',
        value: config.prodEnvFile,
        protected: false,
        masked: false,
        variable_type: 'file',
        description: '生产环境 .env 文件',
      });
    }

    return variables;
  }

  /**
   * 验证配置完整性
   */
  validateConfig(config: CICDConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.gitlab.baseUrl) {
      errors.push('缺少 GitLab URL');
    }
    if (!config.gitlab.token) {
      errors.push('缺少 GitLab Token');
    }
    if (!config.sshPassword) {
      errors.push('缺少 SSH 密码');
    }
    if (!config.server.testServerHost) {
      errors.push('缺少测试服务器地址');
    }
    if (!config.server.prodServerHost) {
      errors.push('缺少生产服务器地址');
    }
    if (!config.project.name) {
      errors.push('缺少项目名称');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 获取变量的简要说明（用于显示）
   */
  getVariableSummary(variables: CICDVariable[]): string {
    const lines = variables.map((v) => {
      const type = v.variable_type === 'file' ? '[File]' : '[Var]';
      const flags = [
        v.protected ? 'Protected' : '',
        v.masked ? 'Masked' : '',
      ]
        .filter(Boolean)
        .join(', ');

      return `  ${type} ${v.key}${flags ? ` (${flags})` : ''}`;
    });

    return lines.join('\n');
  }
}

/**
 * 创建变量配置器实例
 */
export function createVariableConfigurator(): VariableConfigurator {
  return new VariableConfigurator();
}
