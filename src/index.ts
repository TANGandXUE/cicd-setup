/**
 * CloudDreamAI CI/CD Setup - 主入口
 * 导出所有公共 API
 */

export { GitLabClient, createGitLabClient } from './core/gitlab-client';
export { VariableConfigurator, createVariableConfigurator } from './core/variables';
export { TemplateGenerator, createTemplateGenerator } from './utils/template';
export { PromptCollector, createPromptCollector } from './utils/prompts';

export * from './core/types';
