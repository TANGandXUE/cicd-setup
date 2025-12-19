/**
 * CloudDreamAI CI/CD Setup - 类型定义
 */

// ============ GitLab 相关类型 ============

/**
 * GitLab 实例配置
 */
export interface GitLabConfig {
  /** GitLab 实例 URL，如 https://gitlab.clouddreamai.com */
  baseUrl: string;
  /** Personal Access Token */
  token: string;
}

/**
 * GitLab 项目信息
 */
export interface GitLabProject {
  id: number;
  name: string;
  path: string;
  path_with_namespace: string;
  web_url: string;
  default_branch: string;
}

/**
 * CI/CD 变量类型
 */
export type VariableType = 'env_var' | 'file';

/**
 * CI/CD 变量定义
 */
export interface CICDVariable {
  /** 变量名 */
  key: string;
  /** 变量值 */
  value: string;
  /** 变量类型：env_var 或 file */
  variable_type?: VariableType;
  /** 是否仅在 protected 分支可用 */
  protected?: boolean;
  /** 是否在日志中遮蔽 */
  masked?: boolean;
  /** 环境范围，默认 * 表示所有环境 */
  environment_scope?: string;
  /** 变量描述 */
  description?: string;
}

/**
 * GitLab API 返回的变量格式
 */
export interface GitLabVariable extends CICDVariable {
  hidden?: boolean;
  raw?: boolean;
}

// ============ 项目配置类型 ============

/**
 * 项目类型
 */
export type ProjectType = 'nestjs' | 'vue' | 'react' | 'node';

/**
 * 部署环境类型
 */
export type EnvironmentType = 'development' | 'production';

/**
 * 项目配置
 */
export interface ProjectConfig {
  /** 项目名称 */
  name: string;
  /** 项目类型 */
  type: ProjectType;
  /** Docker 镜像名称（使用 GitLab Container Registry 时自动生成） */
  dockerImage: string;
  /** 部署目录 */
  deployDir: string;
  /** 开发环境端口 */
  devPort: number;
  /** 生产环境端口 */
  prodPort: number;
  /** 开发环境 URL */
  devUrl?: string;
  /** 生产环境 URL */
  prodUrl?: string;
  /** 开发环境域名（用于 Nginx 反向代理） */
  devDomain?: string;
  /** 生产环境域名（用于 Nginx 反向代理） */
  prodDomain?: string;
  /** 是否启用 SSL 证书自动申请 */
  enableSsl?: boolean;
  /** SSL 证书邮箱（用于 Let's Encrypt） */
  sslEmail?: string;
}

/**
 * 服务器配置
 */
export interface ServerConfig {
  /** 测试/开发服务器主机 */
  testServerHost: string;
  /** 生产服务器主机（单服务器模式下与测试服务器相同） */
  prodServerHost: string;
  /** 是否单服务器多环境模式 */
  singleServer: boolean;
}

/**
 * 数据库类型
 */
export type DatabaseType = 'pgsql' | 'mysql';

/**
 * 每个环境的数据库配置
 */
export interface EnvDbConfig {
  /** 数据库主机 */
  host: string;
  /** 数据库端口 */
  port: number;
  /** 数据库用户名 */
  username: string;
  /** 数据库密码 */
  password: string;
  /** 数据库名 */
  dbName: string;
}

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  /** 是否启用数据库自动配置 */
  enabled: boolean;
  /** 数据库类型 */
  type: DatabaseType;
  /** 开发环境数据库配置 */
  dev: EnvDbConfig;
  /** 生产环境数据库配置 */
  prod: EnvDbConfig;
  /** 是否启用数据库迁移 */
  enableMigration: boolean;
  /** 迁移命令 */
  migrationCommand: string;
}

/**
 * 完整的 CI/CD 配置
 */
export interface CICDConfig {
  gitlab: GitLabConfig;
  project: ProjectConfig;
  server: ServerConfig;
  /** 开发环境 SSH 密码 */
  devSshPassword: string;
  /** 生产环境 SSH 密码 */
  prodSshPassword: string;
  /** 开发环境 .env 文件内容 */
  devEnvFile?: string;
  /** 生产环境 .env 文件内容 */
  prodEnvFile?: string;
  /** 数据库配置 */
  database?: DatabaseConfig;
}

// ============ CLI 交互类型 ============

/**
 * CLI 提示问题定义
 */
export interface PromptQuestion {
  type: 'input' | 'password' | 'list' | 'confirm' | 'editor';
  name: string;
  message: string;
  default?: string | boolean;
  choices?: Array<{ name: string; value: string }>;
  validate?: (input: string) => boolean | string;
  when?: (answers: Record<string, unknown>) => boolean;
}

// ============ 模板类型 ============

/**
 * 模板变量
 */
export interface TemplateVariables {
  appName: string;
  dockerImage: string;
  deployDir: string;
  devPort: number;
  prodPort: number;
  devUrl: string;
  prodUrl: string;
  lintCommand: string;
}

/**
 * API 响应结果
 */
export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
