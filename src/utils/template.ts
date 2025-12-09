/**
 * CloudDreamAI CI/CD Setup - 模板生成器
 * 负责读取模板文件并替换占位符生成最终文件
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProjectConfig, ProjectType, DatabaseConfig } from '../core/types';

/**
 * 模板生成器
 */
export class TemplateGenerator {
  private templatesDir: string;

  constructor() {
    // 模板文件目录（编译后在 dist/utils/，所以需要 ../../templates 到达项目根）
    this.templatesDir = path.join(__dirname, '../../templates');
  }

  /**
   * 生成 .gitlab-ci.yml 文件内容（仅支持 GitLab Container Registry）
   */
  generateGitLabCI(
    projectType: ProjectType,
    config: ProjectConfig,
    gitlabHost: string
  ): string {
    // 根据项目类型选择模板（统一使用 -gitlab 后缀）
    const templateName = this.getTemplateNameByType(projectType);
    const templatePath = path.join(
      this.templatesDir,
      'gitlab-ci',
      `${templateName}.yml`
    );

    // 读取模板
    const template = fs.readFileSync(templatePath, 'utf-8');

    // 准备替换变量
    const variables: Record<string, string> = {
      APP_NAME: config.name,
      DEPLOY_DIR: config.deployDir,
      DEV_PORT: config.devPort.toString(),
      PROD_PORT: config.prodPort.toString(),
      DEV_URL: config.devUrl || `http://localhost:${config.devPort}`,
      PROD_URL: config.prodUrl || `http://localhost:${config.prodPort}`,
      GITLAB_HOST: gitlabHost.replace(/^https?:\/\//, ''),
    };

    // 替换占位符
    return this.replacePlaceholders(template, variables);
  }

  /**
   * 生成 deploy.sh 脚本内容
   */
  generateDeployScript(config: ProjectConfig, database?: DatabaseConfig): string {
    const templatePath = path.join(this.templatesDir, 'scripts', 'deploy.sh');
    const template = fs.readFileSync(templatePath, 'utf-8');

    const variables: Record<string, string> = {
      APP_NAME: config.name,
      DEPLOY_DIR: config.deployDir,
      DEV_PORT: config.devPort.toString(),
      PROD_PORT: config.prodPort.toString(),
      DEV_DOMAIN: config.devDomain || '',
      PROD_DOMAIN: config.prodDomain || '',
      ENABLE_SSL: config.enableSsl ? 'true' : 'false',
      SSL_EMAIL: config.sslEmail || '',
      // 数据库配置
      DB_ENABLED: database?.enabled ? 'true' : 'false',
      DB_TYPE: database?.type || '',
      DB_DEV_HOST: database?.dev?.host || '',
      DB_DEV_PORT: database?.dev?.port?.toString() || '',
      DB_DEV_USERNAME: database?.dev?.username || '',
      DB_DEV_PASSWORD: database?.dev?.password || '',
      DB_DEV_DBNAME: database?.dev?.dbName || '',
      DB_PROD_HOST: database?.prod?.host || '',
      DB_PROD_PORT: database?.prod?.port?.toString() || '',
      DB_PROD_USERNAME: database?.prod?.username || '',
      DB_PROD_PASSWORD: database?.prod?.password || '',
      DB_PROD_DBNAME: database?.prod?.dbName || '',
      // 迁移配置（从 database 读取）
      ENABLE_MIGRATION: database?.enableMigration ? 'true' : 'false',
      MIGRATION_COMMAND: database?.migrationCommand || 'npm run migration:run',
    };

    return this.replacePlaceholders(template, variables);
  }

  /**
   * 生成 generate-env.sh 脚本内容
   */
  generateEnvScript(config: ProjectConfig): string {
    const templatePath = path.join(
      this.templatesDir,
      'scripts',
      'generate-env.sh'
    );
    const template = fs.readFileSync(templatePath, 'utf-8');

    const variables: Record<string, string> = {
      APP_PORT: config.prodPort.toString(), // 默认使用生产端口
    };

    return this.replacePlaceholders(template, variables);
  }

  /**
   * 生成 docker-compose.yml 文件内容
   */
  generateDockerCompose(
    projectType: ProjectType,
    config: ProjectConfig
  ): string {
    // 根据项目类型选择模板
    const templateName = this.getDockerComposeTemplate(projectType);
    const templatePath = path.join(
      this.templatesDir,
      'docker-compose',
      `${templateName}.yml`
    );

    // 读取模板
    const template = fs.readFileSync(templatePath, 'utf-8');

    // 准备替换变量
    const variables: Record<string, string> = {
      APP_NAME: config.name,
      DOCKER_IMAGE: config.dockerImage || config.name,
    };

    return this.replacePlaceholders(template, variables);
  }

  /**
   * 生成 Dockerfile 文件内容
   */
  generateDockerfile(
    projectType: ProjectType,
    config: ProjectConfig
  ): string {
    // 根据项目类型选择模板
    const templateName = this.getDockerfileTemplate(projectType);
    const templatePath = path.join(
      this.templatesDir,
      'dockerfile',
      `${templateName}.Dockerfile`
    );

    // 读取模板
    const template = fs.readFileSync(templatePath, 'utf-8');

    // 准备替换变量（使用生产端口作为默认端口）
    const variables: Record<string, string> = {
      APP_PORT: config.prodPort.toString(),
    };

    return this.replacePlaceholders(template, variables);
  }

  /**
   * 生成 .dockerignore 文件内容
   * 前端项目(vue/react)不忽略.env，因为Vite需要在构建时读取环境变量
   * 后端项目(nestjs/node)忽略.env，运行时从环境变量读取
   */
  generateDockerignore(projectType: ProjectType): string {
    const templateName = (projectType === 'vue' || projectType === 'react') ? 'vue' : 'nestjs';
    const templatePath = path.join(this.templatesDir, 'dockerfile', `${templateName}.dockerignore`);
    return fs.readFileSync(templatePath, 'utf-8');
  }

  /**
   * 备份文件（如果存在）
   */
  private backupFile(filePath: string): void {
    if (fs.existsSync(filePath)) {
      const backupPath = `${filePath}.backup`;
      fs.copyFileSync(filePath, backupPath);
      console.log(`  ✓ 已备份: ${path.basename(filePath)} -> ${path.basename(backupPath)}`);
    }
  }

  /**
   * 生成所有文件到指定目录
   */
  async generateAll(
    outputDir: string,
    projectType: ProjectType,
    config: ProjectConfig,
    gitlabHost: string,
    database?: DatabaseConfig
  ): Promise<{ success: boolean; files: string[]; error?: string }> {
    try {
      const files: string[] = [];
      const filesToOverwrite: string[] = [];

      // 确保输出目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 创建 ci 子目录
      const ciDir = path.join(outputDir, 'ci');
      if (!fs.existsSync(ciDir)) {
        fs.mkdirSync(ciDir, { recursive: true });
      }

      // 检测将要覆盖的文件
      const gitlabCIPath = path.join(outputDir, '.gitlab-ci.yml');
      const dockerComposePath = path.join(outputDir, 'docker-compose.yml');
      const dockerfilePath = path.join(outputDir, 'Dockerfile');
      const dockerignorePath = path.join(outputDir, '.dockerignore');
      const deployScriptPath = path.join(ciDir, 'deploy.sh');
      const envScriptPath = path.join(ciDir, 'generate-env.sh');

      if (fs.existsSync(gitlabCIPath)) filesToOverwrite.push('.gitlab-ci.yml');
      if (fs.existsSync(dockerComposePath)) filesToOverwrite.push('docker-compose.yml');
      if (fs.existsSync(dockerfilePath)) filesToOverwrite.push('Dockerfile');
      if (fs.existsSync(dockerignorePath)) filesToOverwrite.push('.dockerignore');
      if (fs.existsSync(deployScriptPath)) filesToOverwrite.push('ci/deploy.sh');
      if (fs.existsSync(envScriptPath)) filesToOverwrite.push('ci/generate-env.sh');

      // 如果有文件将被覆盖，询问用户
      if (filesToOverwrite.length > 0) {
        console.log('\n⚠️  以下文件将被覆盖:');
        filesToOverwrite.forEach(f => console.log(`   - ${f}`));

        const inquirer = (await import('inquirer')).default;
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: '是否继续？（旧文件将自动备份为 .backup）',
            default: true,
          },
        ]);

        if (!confirm) {
          return { success: false, files: [], error: '用户取消操作' };
        }

        console.log('\n📦 备份旧文件...');
      }

      // 生成 .gitlab-ci.yml
      const gitlabCIContent = this.generateGitLabCI(
        projectType,
        config,
        gitlabHost
      );
      this.backupFile(gitlabCIPath);
      fs.writeFileSync(gitlabCIPath, gitlabCIContent, 'utf-8');
      files.push(gitlabCIPath);

      // 生成 docker-compose.yml
      this.backupFile(dockerComposePath);
      const dockerComposeContent = this.generateDockerCompose(projectType, config);
      fs.writeFileSync(dockerComposePath, dockerComposeContent, 'utf-8');
      files.push(dockerComposePath);

      // 生成 Dockerfile
      this.backupFile(dockerfilePath);
      const dockerfileContent = this.generateDockerfile(projectType, config);
      fs.writeFileSync(dockerfilePath, dockerfileContent, 'utf-8');
      files.push(dockerfilePath);

      // 生成 .dockerignore
      this.backupFile(dockerignorePath);
      const dockerignoreContent = this.generateDockerignore(projectType);
      fs.writeFileSync(dockerignorePath, dockerignoreContent, 'utf-8');
      files.push(dockerignorePath);

      // 生成 ci/deploy.sh
      this.backupFile(deployScriptPath);
      const deployScriptContent = this.generateDeployScript(config, database);
      fs.writeFileSync(deployScriptPath, deployScriptContent, 'utf-8');
      fs.chmodSync(deployScriptPath, '755');
      files.push(deployScriptPath);

      // 生成 ci/generate-env.sh
      this.backupFile(envScriptPath);
      const envScriptContent = this.generateEnvScript(config);
      fs.writeFileSync(envScriptPath, envScriptContent, 'utf-8');
      fs.chmodSync(envScriptPath, '755');
      files.push(envScriptPath);

      return { success: true, files };
    } catch (error) {
      return {
        success: false,
        files: [],
        error: `生成文件失败: ${String(error)}`,
      };
    }
  }

  /**
   * 替换模板中的占位符
   * 占位符格式：{{VARIABLE_NAME}}
   */
  private replacePlaceholders(
    template: string,
    variables: Record<string, string>
  ): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(placeholder, value);
    }

    return result;
  }

  /**
   * 根据项目类型获取模板名称（统一使用 GitLab Registry 模板）
   */
  private getTemplateNameByType(projectType: ProjectType): string {
    const templateMapping: Record<ProjectType, string> = {
      nestjs: 'nestjs-gitlab',
      vue: 'vue-gitlab',
      react: 'vue-gitlab', // React 使用和 Vue 相同的模板
      node: 'nestjs-gitlab', // 通用 Node.js 项目使用 NestJS 模板
    };
    return templateMapping[projectType] || 'nestjs-gitlab';
  }

  /**
   * 根据项目类型获取 docker-compose 模板名称
   */
  private getDockerComposeTemplate(projectType: ProjectType): string {
    const templateMapping: Record<ProjectType, string> = {
      nestjs: 'nestjs',
      vue: 'vue',
      react: 'vue', // React 使用和 Vue 相同的模板
      node: 'nestjs', // 通用 Node.js 项目使用 NestJS 模板
    };

    return templateMapping[projectType] || 'nestjs';
  }

  /**
   * 根据项目类型获取 Dockerfile 模板名称
   */
  private getDockerfileTemplate(projectType: ProjectType): string {
    const templateMapping: Record<ProjectType, string> = {
      nestjs: 'nestjs',
      vue: 'vue',
      react: 'vue', // React 使用和 Vue 相同的模板
      node: 'nestjs', // 通用 Node.js 项目使用 NestJS 模板
    };

    return templateMapping[projectType] || 'nestjs';
  }

  /**
   * 根据项目类型获取 lint 命令
   */
  private getLintCommand(projectType: ProjectType): string {
    const commands: Record<ProjectType, string> = {
      nestjs: 'npm run lint:check',
      vue: 'npm run type-check',
      react: 'npm run type-check',
      node: 'npm run lint',
    };

    return commands[projectType] || 'npm run lint';
  }
}

/**
 * 创建模板生成器实例
 */
export function createTemplateGenerator(): TemplateGenerator {
  return new TemplateGenerator();
}
