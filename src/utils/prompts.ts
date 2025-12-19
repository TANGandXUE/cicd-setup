/**
 * CloudDreamAI CI/CD Setup - 交互式提示工具
 * 使用 inquirer 实现用户交互
 */

import inquirer from 'inquirer';
import { CICDConfig, DatabaseConfig, DatabaseType, EnvDbConfig } from '../core/types';
import * as fs from 'fs';
import * as path from 'path';

// 缓存文件路径（项目目录下）
const CACHE_FILE = path.join(process.cwd(), '.cicd-setup-cache.json');

/**
 * 读取缓存
 */
function loadCache(): Record<string, any> {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch {
    // 忽略错误
  }
  return {};
}

/**
 * 保存缓存
 */
function saveCache(cache: Record<string, any>): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    // 忽略错误
  }
}

/**
 * 交互式收集配置信息
 */
export class PromptCollector {
  private cache: Record<string, any>;

  constructor() {
    this.cache = loadCache();
  }

  /**
   * 获取缓存的默认值
   */
  private getDefault(key: string, fallback: any): any {
    return this.cache[key] !== undefined ? this.cache[key] : fallback;
  }

  /**
   * 设置缓存值
   */
  private setCache(key: string, value: any): void {
    this.cache[key] = value;
    saveCache(this.cache);
  }

  /**
   * 收集完整的 CI/CD 配置
   */
  async collectConfig(): Promise<CICDConfig> {
    console.log('\n🚀 CloudDreamAI CI/CD 自动配置工具\n');

    let config: CICDConfig;

    // 收集所有配置
    const collectAll = async () => {
      const gitlabConfig = await this.collectGitLabConfig();
      const projectConfig = await this.collectProjectConfig();
      const serverConfig = await this.collectServerConfig();
      const sshPasswords = await this.collectSSHPasswords(serverConfig);
      const databaseConfig = await this.collectDatabaseConfig(projectConfig.type, serverConfig.testServerHost, sshPasswords.devSshPassword);
      const envFiles = await this.collectEnvFiles(databaseConfig);

      return {
        gitlab: gitlabConfig,
        project: projectConfig,
        server: serverConfig,
        ...sshPasswords,
        database: databaseConfig,
        ...envFiles,
      };
    };

    config = await collectAll();

    // 确认并允许修改
    while (true) {
      console.log('\n📋 配置摘要:\n');
      console.log(`  GitLab URL:     ${config.gitlab.baseUrl}`);
      console.log(`  GitLab Token:   ${config.gitlab.token.substring(0, 8)}...`);
      console.log(`  项目名称:       ${config.project.name}`);
      console.log(`  项目类型:       ${config.project.type}`);
      console.log(`  开发端口:       ${config.project.devPort}`);
      console.log(`  生产端口:       ${config.project.prodPort}`);
      console.log(`  开发服务器:     ${config.server.testServerHost}`);
      console.log(`  生产服务器:     ${config.server.prodServerHost}`);
      console.log(`  开发SSH密码:    ${config.devSshPassword}`);
      console.log(`  生产SSH密码:    ${config.prodSshPassword}`);
      if (config.project.devDomain) {
        console.log(`  开发域名:       ${config.project.devDomain}`);
        console.log(`  生产域名:       ${config.project.prodDomain}`);
      }
      if (config.database?.enabled) {
        console.log(`  数据库类型:     ${config.database.type}`);
        console.log(`  开发数据库:     ${config.database.dev.dbName}@${config.database.dev.host}`);
        console.log(`  生产数据库:     ${config.database.prod.dbName}@${config.database.prod.host}`);
      }

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: '请确认配置:',
          choices: [
            { name: '✓ 确认，开始配置', value: 'confirm' },
            { name: '✎ 修改 GitLab 配置', value: 'gitlab' },
            { name: '✎ 修改项目配置', value: 'project' },
            { name: '✎ 修改服务器配置', value: 'server' },
            { name: '✎ 修改 SSH 密码', value: 'ssh' },
            { name: '✎ 修改数据库配置', value: 'database' },
            { name: '✗ 取消', value: 'cancel' },
          ],
        },
      ]);

      if (action === 'confirm') break;
      if (action === 'cancel') {
        console.log('\n已取消配置');
        process.exit(0);
      }

      // 根据选择重新收集对应部分
      if (action === 'gitlab') {
        config.gitlab = await this.collectGitLabConfig();
      } else if (action === 'project') {
        config.project = await this.collectProjectConfig();
      } else if (action === 'server') {
        config.server = await this.collectServerConfig();
      } else if (action === 'ssh') {
        const sshPasswords = await this.collectSSHPasswords(config.server);
        config.devSshPassword = sshPasswords.devSshPassword;
        config.prodSshPassword = sshPasswords.prodSshPassword;
      } else if (action === 'database') {
        config.database = await this.collectDatabaseConfig(config.project.type, config.server.testServerHost, config.devSshPassword);
      }
    }

    return config;
  }

  /**
   * 收集 GitLab 配置
   */
  private async collectGitLabConfig() {
    console.log('\n📦 GitLab 配置\n');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'baseUrl',
        message: 'GitLab 实例 URL:',
        default: this.getDefault('gitlab.baseUrl', 'https://gitlab.clouddreamai.com'),
        validate: (input) => {
          if (!input) return '请输入 GitLab URL';
          if (!input.startsWith('http')) {
            return 'URL 必须以 http:// 或 https:// 开头';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'token',
        message: 'GitLab Personal Access Token:',
        default: this.getDefault('gitlab.token', ''),
        validate: (input) => (input ? true : '请输入 Access Token'),
      },
    ]);

    // 保存到缓存
    this.setCache('gitlab.baseUrl', answers.baseUrl);
    this.setCache('gitlab.token', answers.token);

    return answers;
  }

  /**
   * 收集项目配置
   */
  private async collectProjectConfig() {
    console.log('\n🔧 项目配置\n');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: '项目名称 (用于容器名称):',
        default: this.getDefault('project.name', ''),
        validate: (input) => {
          if (!input) return '请输入项目名称';
          if (!/^[a-z0-9-]+$/.test(input)) {
            return '项目名称只能包含小写字母、数字和连字符';
          }
          return true;
        },
      },
      {
        type: 'list',
        name: 'type',
        message: '项目类型:',
        default: this.getDefault('project.type', 'nestjs'),
        choices: [
          { name: 'NestJS 后端', value: 'nestjs' },
          { name: 'Vue 前端', value: 'vue' },
          { name: 'React 前端', value: 'react' },
          { name: 'Node.js 通用', value: 'node' },
        ],
      },
      {
        type: 'input',
        name: 'devPort',
        message: '开发环境端口:',
        default: this.getDefault('project.devPort', '3000'),
        validate: (input) => {
          const port = Number(input);
          if (isNaN(port) || port < 1 || port > 65535) {
            return '端口必须在 1-65535 之间';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'prodPort',
        message: '生产环境端口:',
        default: this.getDefault('project.prodPort', '3001'),
        validate: (input) => {
          const port = Number(input);
          if (isNaN(port) || port < 1 || port > 65535) {
            return '端口必须在 1-65535 之间';
          }
          return true;
        },
      },
    ]);

    // 转换端口为数字
    answers.devPort = Number(answers.devPort);
    answers.prodPort = Number(answers.prodPort);

    // 保存到缓存
    this.setCache('project.name', answers.name);
    this.setCache('project.type', answers.type);
    this.setCache('project.devPort', String(answers.devPort));
    this.setCache('project.prodPort', String(answers.prodPort));

    // 自动生成部署目录（使用 GitLab Container Registry，镜像名称由 CI 自动生成）
    const projectName = answers.name;
    answers.deployDir = `/www/wwwroot/${projectName}`;
    answers.dockerImage = ''; // 使用 GitLab CI 预定义变量 $CI_REGISTRY_IMAGE

    console.log(`\n✓ 部署目录: ${answers.deployDir}`);
    console.log(`✓ 镜像仓库: GitLab Container Registry（自动配置）\n`);

    // 询问是否配置 Nginx 反向代理
    console.log('\n📝 Nginx 反向代理配置（可选）\n');
    const nginxConfig = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'configureNginx',
        message: '是否自动配置宝塔 Nginx 反向代理？',
        default: this.getDefault('nginx.configure', true),
      },
      {
        type: 'input',
        name: 'devDomain',
        message: '开发环境域名 (如 test.example.com):',
        default: this.getDefault('nginx.devDomain', ''),
        when: (answers: any) => answers.configureNginx,
        validate: (input) => {
          if (!input) return '请输入开发环境域名';
          if (!/^[a-z0-9.-]+$/.test(input)) {
            return '域名只能包含小写字母、数字、点和连字符';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'prodDomain',
        message: '生产环境域名 (如 prod.example.com):',
        default: this.getDefault('nginx.prodDomain', ''),
        when: (answers: any) => answers.configureNginx,
        validate: (input) => {
          if (!input) return '请输入生产环境域名';
          if (!/^[a-z0-9.-]+$/.test(input)) {
            return '域名只能包含小写字母、数字、点和连字符';
          }
          return true;
        },
      },
    ]);

    // 保存 Nginx 配置到缓存
    this.setCache('nginx.configure', nginxConfig.configureNginx);
    if (nginxConfig.devDomain) this.setCache('nginx.devDomain', nginxConfig.devDomain);
    if (nginxConfig.prodDomain) this.setCache('nginx.prodDomain', nginxConfig.prodDomain);

    // SSL 证书配置（仅在配置了域名时询问）
    let sslConfig = { enableSsl: false, sslEmail: '' };
    if (nginxConfig.devDomain) {
      console.log('\n🔒 SSL 证书配置\n');
      sslConfig = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'enableSsl',
          message: '是否自动申请 SSL 证书（Let\'s Encrypt）？',
          default: this.getDefault('ssl.enable', true),
        },
        {
          type: 'input',
          name: 'sslEmail',
          message: 'SSL 证书邮箱（用于证书到期提醒）:',
          default: this.getDefault('ssl.email', ''),
          when: (answers: any) => answers.enableSsl,
          validate: (input) => {
            if (!input) return '请输入邮箱地址';
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) {
              return '请输入有效的邮箱地址';
            }
            return true;
          },
        },
      ]);

      // 保存 SSL 配置到缓存
      this.setCache('ssl.enable', sslConfig.enableSsl);
      if (sslConfig.sslEmail) this.setCache('ssl.email', sslConfig.sslEmail);

      if (sslConfig.enableSsl) {
        console.log(`✓ 已启用 SSL 证书自动申请，邮箱: ${sslConfig.sslEmail}`);
      }
    }

    // 根据域名和 SSL 配置自动生成 URL（用于 GitLab 环境链接显示）
    if (nginxConfig.devDomain) {
      const protocol = sslConfig.enableSsl ? 'https' : 'http';
      answers.devUrl = `${protocol}://${nginxConfig.devDomain}`;
      answers.prodUrl = `${protocol}://${nginxConfig.prodDomain}`;
      console.log(`\n✓ 开发环境 URL: ${answers.devUrl}`);
      console.log(`✓ 生产环境 URL: ${answers.prodUrl}`);
    } else {
      answers.devUrl = '';
      answers.prodUrl = '';
    }

    return { ...answers, ...nginxConfig, ...sslConfig };
  }

  /**
   * 收集服务器配置
   */
  private async collectServerConfig() {
    console.log('\n🖥️  服务器配置\n');

    const { singleServer } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'singleServer',
        message: '开发和生产环境是否使用同一台服务器？',
        default: this.getDefault('server.singleServer', true),
      },
    ]);
    this.setCache('server.singleServer', singleServer);

    const { testServerHost } = await inquirer.prompt([
      {
        type: 'input',
        name: 'testServerHost',
        message: singleServer ? '服务器地址 (IP 或域名):' : '开发服务器地址 (IP 或域名):',
        default: this.getDefault('server.testHost', ''),
        validate: (input) => (input ? true : '请输入服务器地址'),
      },
    ]);
    this.setCache('server.testHost', testServerHost);

    if (singleServer) {
      return { singleServer: true, testServerHost, prodServerHost: testServerHost };
    }

    const { prodServerHost } = await inquirer.prompt([
      {
        type: 'input',
        name: 'prodServerHost',
        message: '生产服务器地址 (IP 或域名):',
        default: this.getDefault('server.prodHost', ''),
        validate: (input) => (input ? true : '请输入服务器地址'),
      },
    ]);
    this.setCache('server.prodHost', prodServerHost);

    return { singleServer: false, testServerHost, prodServerHost };
  }

  /**
   * 收集 SSH 密码（开发和生产环境）
   */
  private async collectSSHPasswords(serverConfig: { testServerHost: string; prodServerHost: string }): Promise<{ devSshPassword: string; prodSshPassword: string }> {
    console.log('\n🔑 SSH 密码配置\n');

    const isSameServer = serverConfig.testServerHost === serverConfig.prodServerHost;

    const { devPassword } = await inquirer.prompt([
      {
        type: 'input',
        name: 'devPassword',
        message: isSameServer ? '服务器 SSH 密码:' : `开发服务器 (${serverConfig.testServerHost}) SSH 密码:`,
        default: this.getDefault('ssh.devPassword', ''),
        validate: (input) => input ? true : '请输入 SSH 密码',
      },
    ]);
    this.setCache('ssh.devPassword', devPassword);

    // 如果是同一台服务器，生产密码与开发密码相同
    if (isSameServer) {
      this.setCache('ssh.prodPassword', devPassword);
      return { devSshPassword: devPassword, prodSshPassword: devPassword };
    }

    const { prodPassword } = await inquirer.prompt([
      {
        type: 'input',
        name: 'prodPassword',
        message: `生产服务器 (${serverConfig.prodServerHost}) SSH 密码:`,
        default: this.getDefault('ssh.prodPassword', ''),
        validate: (input) => input ? true : '请输入 SSH 密码',
      },
    ]);
    this.setCache('ssh.prodPassword', prodPassword);

    return { devSshPassword: devPassword, prodSshPassword: prodPassword };
  }

  /**
   * 收集单个环境的数据库配置
   */
  private async collectEnvDbConfig(envName: string, cachePrefix: string, dbType: string, fallbackPrefix?: string, serverHost?: string, sshPassword?: string): Promise<EnvDbConfig> {
    console.log(`\n  📦 ${envName}数据库配置\n`);

    const defaultPort = dbType === 'pgsql' ? '5432' : '3306';
    const defaultUser = dbType === 'pgsql' ? 'postgres' : 'root';

    // 获取默认值：优先用当前环境缓存，其次用 fallback 环境缓存
    const getDbDefault = (key: string, fallback: any): any => {
      const cached = this.cache[`${cachePrefix}.${key}`];
      if (cached !== undefined) return cached;
      if (fallbackPrefix) {
        const fallbackCached = this.cache[`${fallbackPrefix}.${key}`];
        if (fallbackCached !== undefined) return fallbackCached;
      }
      return fallback;
    };

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'host',
        message: `${envName}数据库主机:`,
        default: getDbDefault('host', 'localhost'),
      },
      {
        type: 'input',
        name: 'port',
        message: `${envName}数据库端口:`,
        default: getDbDefault('port', defaultPort),
        validate: (input) => {
          const port = Number(input);
          if (isNaN(port) || port < 1 || port > 65535) return '端口必须在 1-65535 之间';
          return true;
        },
      },
      {
        type: 'input',
        name: 'username',
        message: `${envName}数据库用户名:`,
        default: getDbDefault('username', defaultUser),
        validate: (input) => input ? true : '请输入用户名',
      },
      {
        type: 'input',
        name: 'password',
        message: `${envName}数据库密码:`,
        default: getDbDefault('password', ''),
        validate: (input) => input ? true : '请输入密码',
      },
      {
        type: 'input',
        name: 'dbName',
        message: `${envName}数据库名:`,
        default: getDbDefault('dbName', ''),
        validate: (input) => input ? true : '请输入数据库名',
      },
    ]);

    // 检测用户是否已存在
    if (serverHost && sshPassword) {
      const exists = await this.checkDbUserExists(serverHost, sshPassword, dbType, answers.username);
      if (exists) {
        // 醒目警告：已存在的用户需要确保密码正确
        console.log('\n  ╔════════════════════════════════════════════════════════════════╗');
        console.log('  ║  ⚠️  警告：服务器数据库用户已存在                                ║');
        console.log('  ╠════════════════════════════════════════════════════════════════╣');
        console.log(`  ║  用户 "${answers.username}" 已存在于【服务器】数据库中`);
        console.log('  ║                                                                ║');
        console.log('  ║  ⚠️  注意：这里指的是服务器上的数据库密码，不是本地数据库！     ║');
        console.log('  ║                                                                ║');
        console.log('  ║  如果您不知道服务器上该用户的密码：                            ║');
        console.log('  ║  → 请选择"修改用户名"，输入新用户名和密码，系统会自动创建     ║');
        console.log('  ║                                                                ║');
        console.log('  ║  如果继续使用此用户但密码错误，将导致 502 错误！               ║');
        console.log('  ╚════════════════════════════════════════════════════════════════╝\n');

        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: `如何处理用户 "${answers.username}"？`,
            choices: [
              { name: '✓ 我知道服务器上该用户的密码，继续使用', value: 'reuse' },
              { name: '✎ 修改用户名（输入新用户名和密码，自动创建）', value: 'rename' },
            ],
          },
        ]);
        if (action === 'rename') {
          const { newUsername } = await inquirer.prompt([
            {
              type: 'input',
              name: 'newUsername',
              message: `${envName}新用户名:`,
              validate: (input) => input ? true : '请输入用户名',
            },
          ]);
          answers.username = newUsername;
          console.log(`  ✓ 将使用新用户名 "${newUsername}"，部署时自动创建`);
        } else {
          console.log(`  ✓ 将复用已存在的用户 "${answers.username}"，请确保密码正确`);
        }
      } else {
        console.log(`  ✓ 用户 "${answers.username}" 不存在，部署时将自动创建`);
      }
    }

    // 保存到缓存
    Object.keys(answers).forEach(key => {
      this.setCache(`${cachePrefix}.${key}`, answers[key]);
    });

    return {
      ...answers,
      port: Number(answers.port),
    };
  }

  /**
   * 通过 SSH 检查数据库用户是否存在
   */
  private async checkDbUserExists(serverHost: string, sshPassword: string, dbType: string, username: string): Promise<boolean> {
    const { execSync } = require('child_process');
    try {
      let cmd: string;
      if (dbType === 'pgsql') {
        cmd = `sshpass -p '${sshPassword}' ssh -o StrictHostKeyChecking=no root@${serverHost} "sudo -u postgres /www/server/pgsql/bin/psql -tAc \\"SELECT 1 FROM pg_roles WHERE rolname='${username}'\\"" 2>/dev/null`;
      } else {
        cmd = `sshpass -p '${sshPassword}' ssh -o StrictHostKeyChecking=no root@${serverHost} "/www/server/mysql/bin/mysql -u root -e \\"SELECT 1 FROM mysql.user WHERE user='${username}'\\"" 2>/dev/null`;
      }
      const result = execSync(cmd, { encoding: 'utf-8' }).trim();
      return result.includes('1');
    } catch {
      return false;
    }
  }

  /**
   * 收集数据库配置（包含自动创建和迁移）
   */
  private async collectDatabaseConfig(projectType: string, serverHost: string, sshPassword: string): Promise<DatabaseConfig | undefined> {
    // 仅后端项目询问数据库配置
    if (projectType !== 'nestjs' && projectType !== 'node') {
      return undefined;
    }

    console.log('\n🗄️  数据库配置\n');

    const { enableDb } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableDb',
        message: '是否启用数据库自动创建？',
        default: this.getDefault('db.enabled', false),
      },
    ]);

    this.setCache('db.enabled', enableDb);

    if (!enableDb) {
      // 即使不启用数据库创建，也询问是否需要迁移
      const migrationConfig = await this.collectMigrationConfig();
      return {
        enabled: false,
        ...migrationConfig,
      } as DatabaseConfig;
    }

    const { dbType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'dbType',
        message: '数据库类型:',
        default: this.getDefault('db.type', 'pgsql'),
        choices: [
          { name: 'PostgreSQL', value: 'pgsql' },
          { name: 'MySQL', value: 'mysql' },
        ],
      },
    ]);

    this.setCache('db.type', dbType);

    // 收集开发环境配置
    const devConfig = await this.collectEnvDbConfig('开发环境', 'db.dev', dbType, undefined, serverHost, sshPassword);
    // 收集生产环境配置，fallback 到开发环境缓存
    const prodConfig = await this.collectEnvDbConfig('生产环境', 'db.prod', dbType, 'db.dev', serverHost, sshPassword);

    // 收集迁移配置
    const migrationConfig = await this.collectMigrationConfig();

    return {
      enabled: true,
      type: dbType as DatabaseType,
      dev: devConfig,
      prod: prodConfig,
      ...migrationConfig,
    };
  }

  /**
   * 收集数据库迁移配置
   */
  private async collectMigrationConfig(): Promise<{ enableMigration: boolean; migrationCommand: string }> {
    console.log('\n  📦 数据库迁移配置\n');

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableMigration',
        message: '是否在部署后自动执行数据库迁移？',
        default: this.getDefault('db.enableMigration', false),
      },
      {
        type: 'input',
        name: 'migrationCommand',
        message: '迁移命令:',
        default: this.getDefault('db.migrationCommand', 'npm run migration:run'),
        when: (ans: any) => ans.enableMigration,
      },
    ]);

    this.setCache('db.enableMigration', answers.enableMigration);
    if (answers.migrationCommand) {
      this.setCache('db.migrationCommand', answers.migrationCommand);
    }

    if (answers.enableMigration) {
      console.log(`✓ 已启用数据库迁移: ${answers.migrationCommand}`);
    }

    return {
      enableMigration: answers.enableMigration,
      migrationCommand: answers.migrationCommand || 'npm run migration:run',
    };
  }

  /**
   * 解析 .env 文件内容为键值对
   */
  private parseEnvContent(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          const value = trimmed.substring(eqIndex + 1).trim();
          result[key] = value;
        }
      }
    });
    return result;
  }

  /**
   * 查找 .env 中的数据库变量（支持多种命名方式）
   */
  private findDbVars(envVars: Record<string, string>): { username?: string; password?: string; database?: string } {
    const usernameKeys = ['DB_USERNAME', 'DB_USER', 'DATABASE_USER', 'POSTGRES_USER', 'MYSQL_USER'];
    const passwordKeys = ['DB_PASSWORD', 'DB_PASS', 'DATABASE_PASSWORD', 'POSTGRES_PASSWORD', 'MYSQL_PASSWORD'];
    const databaseKeys = ['DB_DATABASE', 'DB_NAME', 'DATABASE_NAME', 'POSTGRES_DB', 'MYSQL_DATABASE'];

    const find = (keys: string[]) => {
      for (const key of keys) {
        if (envVars[key]) return envVars[key];
      }
      return undefined;
    };

    return {
      username: find(usernameKeys),
      password: find(passwordKeys),
      database: find(databaseKeys),
    };
  }

  /**
   * 验证数据库配置与 .env 文件的一致性
   */
  private validateDbConfigConsistency(
    envName: string,
    envContent: string,
    dbConfig: EnvDbConfig
  ): { canCheck: boolean; mismatches: string[] } {
    const envVars = this.parseEnvContent(envContent);
    const dbVars = this.findDbVars(envVars);
    const mismatches: string[] = [];

    // 如果找不到任何数据库变量，无法自动检查
    if (!dbVars.username && !dbVars.password && !dbVars.database) {
      return { canCheck: false, mismatches: [] };
    }

    if (dbVars.username && dbVars.username !== dbConfig.username) {
      mismatches.push(`用户名: .env="${dbVars.username}" vs 交互输入="${dbConfig.username}"`);
    }
    if (dbVars.password && dbVars.password !== dbConfig.password) {
      mismatches.push(`密码: .env="${dbVars.password}" vs 交互输入="${dbConfig.password}"`);
    }
    if (dbVars.database && dbVars.database !== dbConfig.dbName) {
      mismatches.push(`数据库名: .env="${dbVars.database}" vs 交互输入="${dbConfig.dbName}"`);
    }

    return { canCheck: true, mismatches };
  }

  /**
   * 收集环境变量文件（必需）
   */
  private async collectEnvFiles(databaseConfig?: DatabaseConfig) {
    console.log('\n📄 环境变量文件配置（必需）\n');
    console.log('⚠️  NestJS 项目需要 .env 文件来配置数据库、密钥等信息');
    console.log('   请确保已创建 .env.dev 和 .env.prod 文件\n');

    // 检查是否存在 .env.example
    const envExampleExists = fs.existsSync('.env.example');
    if (!envExampleExists) {
      console.log('⚠️  未找到 .env.example 文件');
      console.log('   建议创建 .env.example 作为环境变量模板\n');
    }

    // 强制要求提供环境变量文件
    const devEnvFile = await this.readEnvFile('开发环境', '.env.dev', true);
    const prodEnvFile = await this.readEnvFile('生产环境', '.env.prod', true);

    if (!devEnvFile || !prodEnvFile) {
      console.log('\n❌ 环境变量文件配置不完整');
      console.log('请创建以下文件后重新运行:');
      if (!devEnvFile) console.log('  - .env.dev');
      if (!prodEnvFile) console.log('  - .env.prod');
      console.log('\n提示: 可以从 .env.example 复制并修改\n');
      process.exit(1);
    }

    // 验证数据库配置一致性
    if (databaseConfig?.enabled && databaseConfig.dev && databaseConfig.prod) {
      console.log('\n🔍 验证数据库配置一致性...\n');

      const devValidation = this.validateDbConfigConsistency('开发环境', devEnvFile, databaseConfig.dev);
      const prodValidation = this.validateDbConfigConsistency('生产环境', prodEnvFile, databaseConfig.prod);

      // 检查是否有不一致
      const hasMismatch = devValidation.mismatches.length > 0 || prodValidation.mismatches.length > 0;
      // 检查是否无法自动检查
      const cannotCheck = !devValidation.canCheck || !prodValidation.canCheck;

      if (hasMismatch || cannotCheck) {
        console.log('╔════════════════════════════════════════════════════════════════╗');
        if (hasMismatch) {
          console.log('║  ⚠️  警告：数据库配置不一致                                      ║');
          console.log('╠════════════════════════════════════════════════════════════════╣');
          console.log('║  交互阶段填写的数据库配置与 .env 文件中的配置不一致！           ║');
          console.log('║  这可能导致部署后应用无法连接数据库（502 错误）                 ║');
          console.log('╠════════════════════════════════════════════════════════════════╣');

          if (devValidation.mismatches.length > 0) {
            console.log('║  开发环境 (.env.dev):');
            devValidation.mismatches.forEach(m => console.log(`║    - ${m}`));
          }
          if (prodValidation.mismatches.length > 0) {
            console.log('║  生产环境 (.env.prod):');
            prodValidation.mismatches.forEach(m => console.log(`║    - ${m}`));
          }
        }

        // 提示无法自动检查的环境
        if (!devValidation.canCheck || !prodValidation.canCheck) {
          if (hasMismatch) console.log('╠════════════════════════════════════════════════════════════════╣');
          console.log('║  ⚠️  以下环境无法自动检测，请手动确认配置正确：                 ║');
          if (!devValidation.canCheck) console.log('║    - 开发环境 (.env.dev)');
          if (!prodValidation.canCheck) console.log('║    - 生产环境 (.env.prod)');
        }

        console.log('╚════════════════════════════════════════════════════════════════╝\n');

        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: hasMismatch ? '如何处理配置不一致？' : '请确认已手动检查配置',
            choices: [
              { name: '✓ 我已确认配置正确，继续', value: 'continue' },
              { name: '✗ 退出，手动修改后重试', value: 'exit' },
            ],
          },
        ]);

        if (action === 'exit') {
          console.log('\n已退出，请修改配置后重新运行\n');
          process.exit(0);
        }
      } else {
        console.log('✓ 数据库配置一致性验证通过\n');
      }
    }

    return { devEnvFile, prodEnvFile };
  }

  /**
   * 读取环境变量文件
   */
  private async readEnvFile(
    envName: string,
    defaultPath: string,
    required: boolean = false
  ): Promise<string | undefined> {
    const { filePath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'filePath',
        message: required
          ? `${envName} .env 文件路径 (必需):`
          : `${envName} .env 文件路径 (回车跳过):`,
        default: defaultPath,
        validate: (input) => {
          if (required && !input) {
            return '此文件为必需，请提供文件路径';
          }
          if (input && !fs.existsSync(input)) {
            return `文件 ${input} 不存在，请检查路径`;
          }
          return true;
        },
      },
    ]);

    if (!filePath) {
      return undefined;
    }

    if (!fs.existsSync(filePath)) {
      if (required) {
        console.log(`\n❌ 错误: 文件 ${filePath} 不存在`);

        // 如果是默认路径且存在 .env.example，提示用户创建
        if (filePath === defaultPath && fs.existsSync('.env.example')) {
          console.log(`\n提示: 你可以运行以下命令创建文件:`);
          console.log(`  cp .env.example ${filePath}`);
          console.log(`  然后编辑 ${filePath} 填写${envName}的配置\n`);
        }

        return undefined;
      }
      console.log(`⚠️  文件 ${filePath} 不存在，跳过`);
      return undefined;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`✓ 成功读取 ${filePath} (${content.split('\n').length} 行)`);
    return content;
  }
}

/**
 * 创建提示收集器实例
 */
export function createPromptCollector(): PromptCollector {
  return new PromptCollector();
}
