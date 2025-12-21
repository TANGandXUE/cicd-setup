#!/usr/bin/env node

/**
 * CloudDreamAI CI/CD Setup - CLI 入口
 * 交互式 GitLab CI/CD 配置工具
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createPromptCollector } from './utils/prompts';
import { createGitLabClient } from './core/gitlab-client';
import { createVariableConfigurator } from './core/variables';
import { createTemplateGenerator } from './utils/template';
import { createPackageHelper } from './utils/package-helper';
import * as path from 'path';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

/**
 * 检查 NestJS 项目的 tsconfig 配置，确保编译输出正确
 * 检查三个问题：1) 缺少 rootDir  2) 根目录 .ts 文件未被排除  3) tsBuildInfoFile 缺失导致缓存问题
 */
async function checkTsConfigRootDir(outputDir: string, inquirer: any, projectType: string): Promise<void> {
  // 只检查后端项目
  if (projectType !== 'nestjs' && projectType !== 'node') return;

  const tsconfigPath = path.join(outputDir, 'tsconfig.json');
  const tsconfigBuildPath = path.join(outputDir, 'tsconfig.build.json');
  if (!existsSync(tsconfigPath)) return;

  try {
    const content = readFileSync(tsconfigPath, 'utf-8');
    const tsconfig = JSON.parse(content);

    // 没有 outDir 配置，可能不是标准 TypeScript 项目
    if (!tsconfig.compilerOptions?.outDir) return;

    const needsRootDir = !tsconfig.compilerOptions?.rootDir;

    // 检查 tsBuildInfoFile 问题
    // 背景：TypeScript incremental 编译会生成 .tsbuildinfo 缓存文件
    // 当同时设置 incremental: true 和 rootDir 时，.tsbuildinfo 会被放到项目根目录而不是 outDir
    // 而 nest-cli.json 的 deleteOutDir: true 只会删除 dist 目录，不会删除根目录的 .tsbuildinfo
    // 这导致：dist 被删除后，TypeScript 看到 .tsbuildinfo 认为"没有变化"，跳过编译，dist 为空
    // 解决方案：显式设置 tsBuildInfoFile 到 dist 目录内，让 deleteOutDir 一起清理
    // 参考：https://github.com/microsoft/TypeScript/issues/30925
    const outDir = tsconfig.compilerOptions.outDir.replace(/^\.\//, '').replace(/\/$/, '');
    const needsTsBuildInfoFile = tsconfig.compilerOptions?.incremental === true
      && tsconfig.compilerOptions?.rootDir
      && !tsconfig.compilerOptions?.tsBuildInfoFile;

    // 检查根目录是否有 .ts 文件（如 typeorm.config.ts）
    const rootTsFiles: string[] = [];
    try {
      const files = require('fs').readdirSync(outputDir);
      for (const file of files) {
        if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
          rootTsFiles.push(file);
        }
      }
    } catch { /* ignore */ }

    // 检查哪些 .ts 文件未被排除
    let excludeList: string[] = [];
    if (existsSync(tsconfigBuildPath)) {
      try {
        const buildContent = readFileSync(tsconfigBuildPath, 'utf-8');
        excludeList = JSON.parse(buildContent).exclude || [];
      } catch { /* ignore */ }
    } else {
      excludeList = tsconfig.exclude || [];
    }
    const unexcludedFiles = rootTsFiles.filter(f => !excludeList.includes(f));

    // 检查是否需要 tsBuildInfoFile（考虑添加 rootDir 后的情况）
    // 如果当前没有 rootDir 但有 incremental，添加 rootDir 后也需要 tsBuildInfoFile
    const willNeedTsBuildInfoFile = tsconfig.compilerOptions?.incremental === true
      && !tsconfig.compilerOptions?.tsBuildInfoFile;

    // 如果都配置好了，直接返回
    if (!needsRootDir && unexcludedFiles.length === 0 && !needsTsBuildInfoFile && !willNeedTsBuildInfoFile) return;

    // 显示问题
    const issues: string[] = [];
    if (needsRootDir) {
      issues.push('缺少 rootDir 配置（会导致 dist/src/main.js 结构）');
    }
    if (unexcludedFiles.length > 0) {
      issues.push(`根目录 .ts 文件未排除: ${unexcludedFiles.join(', ')}`);
    }
    if (needsTsBuildInfoFile || (needsRootDir && willNeedTsBuildInfoFile)) {
      issues.push('incremental 编译缓存位置问题（会导致 build 后 dist 目录为空）');
    }

    console.log(chalk.yellow('\n⚠️  检测到 tsconfig 配置问题:'));
    issues.forEach(issue => console.log(chalk.yellow(`   - ${issue}`)));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '是否自动修复？',
        choices: [
          { name: '是，自动修复（推荐）', value: 'fix' },
          { name: '否，我自己处理', value: 'skip' },
        ],
      },
    ]);

    if (action === 'fix') {
      // 1. 修复 rootDir
      if (needsRootDir) {
        writeFileSync(`${tsconfigPath}.backup`, content, 'utf-8');
        tsconfig.compilerOptions.rootDir = './src';
        writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8');
        console.log(chalk.green('✓ 已添加 rootDir: "./src" 到 tsconfig.json'));
      }

      // 2. 修复 exclude
      if (unexcludedFiles.length > 0) {
        if (existsSync(tsconfigBuildPath)) {
          const buildContent = readFileSync(tsconfigBuildPath, 'utf-8');
          const tsconfigBuild = JSON.parse(buildContent);
          writeFileSync(`${tsconfigBuildPath}.backup`, buildContent, 'utf-8');

          if (!tsconfigBuild.exclude) tsconfigBuild.exclude = [];
          for (const file of unexcludedFiles) {
            tsconfigBuild.exclude.push(file);
          }

          writeFileSync(tsconfigBuildPath, JSON.stringify(tsconfigBuild, null, 2) + '\n', 'utf-8');
          console.log(chalk.green(`✓ 已将 ${unexcludedFiles.join(', ')} 添加到 tsconfig.build.json 的 exclude`));
        } else {
          if (!tsconfig.exclude) {
            tsconfig.exclude = ['node_modules', 'dist', 'test', '**/*spec.ts'];
          }
          for (const file of unexcludedFiles) {
            tsconfig.exclude.push(file);
          }
          writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8');
          console.log(chalk.green(`✓ 已将 ${unexcludedFiles.join(', ')} 添加到 tsconfig.json 的 exclude`));
        }
      }

      // 3. 修复 tsBuildInfoFile
      // 重新计算条件，因为可能刚添加了 rootDir
      const shouldFixTsBuildInfoFile = tsconfig.compilerOptions?.incremental === true
        && tsconfig.compilerOptions?.rootDir
        && !tsconfig.compilerOptions?.tsBuildInfoFile;
      if (shouldFixTsBuildInfoFile) {
        tsconfig.compilerOptions.tsBuildInfoFile = `./${outDir}/.tsbuildinfo`;
        writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8');
        console.log(chalk.green(`✓ 已添加 tsBuildInfoFile: "./${outDir}/.tsbuildinfo" 到 tsconfig.json`));

        // 检查并清理根目录的旧 .tsbuildinfo 文件
        const oldTsBuildInfoFiles = require('fs').readdirSync(outputDir)
          .filter((f: string) => f.endsWith('.tsbuildinfo'));
        if (oldTsBuildInfoFiles.length > 0) {
          for (const file of oldTsBuildInfoFiles) {
            require('fs').unlinkSync(path.join(outputDir, file));
          }
          console.log(chalk.green(`✓ 已清理根目录的旧缓存文件: ${oldTsBuildInfoFiles.join(', ')}`));
        }
      }

      console.log(chalk.gray('  原文件已备份为 .backup'));
      console.log(chalk.cyan('  请记得提交此更改'));
    }
  } catch {
    // 解析失败，静默跳过
  }
}

/**
 * 检查 package-lock.json 是否被 gitignore，提示用户修复
 */
async function checkPackageLockIgnored(outputDir: string, inquirer: any): Promise<void> {
  const gitignorePath = path.join(outputDir, '.gitignore');
  if (!existsSync(gitignorePath)) return;

  const content = readFileSync(gitignorePath, 'utf-8');
  const lines = content.split('\n');

  // 检查是否忽略了 package-lock.json
  const ignoreLine = lines.findIndex(line =>
    line.trim() === 'package-lock.json' || line.trim() === '/package-lock.json'
  );

  if (ignoreLine === -1) return;

  console.log(chalk.yellow('\n⚠️  检测到 .gitignore 中包含 package-lock.json'));
  console.log(chalk.gray('   CI/CD 使用 npm ci 命令需要 package-lock.json 文件'));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '是否从 .gitignore 中移除 package-lock.json？',
      choices: [
        { name: '是，移除并提交到 git（推荐）', value: 'fix' },
        { name: '否，保持现状（CI 可能失败）', value: 'skip' },
      ],
    },
  ]);

  if (action === 'fix') {
    // 移除 gitignore 中的 package-lock.json
    const newLines = lines.filter((_, i) => i !== ignoreLine);
    writeFileSync(gitignorePath, newLines.join('\n'), 'utf-8');
    console.log(chalk.green('✓ 已从 .gitignore 中移除 package-lock.json'));

    // 检查 package-lock.json 是否存在，不存在则生成
    const lockPath = path.join(outputDir, 'package-lock.json');
    if (!existsSync(lockPath)) {
      console.log(chalk.gray('  正在生成 package-lock.json...'));
      try {
        execSync('npm install --package-lock-only', { cwd: outputDir, stdio: 'ignore' });
        console.log(chalk.green('✓ package-lock.json 已生成'));
      } catch {
        console.log(chalk.yellow('⚠️  无法自动生成，请手动运行 npm install'));
      }
    }

    // 提示用户提交
    console.log(chalk.cyan('  请记得提交这些更改: git add .gitignore package-lock.json && git commit'));
  }
}

/**
 * 检查 Next.js 项目的 next.config 配置，确保启用 Standalone 模式
 */
async function checkNextConfig(outputDir: string, inquirer: any, projectType: string): Promise<void> {
  // 只检查 Next.js 项目
  if (projectType !== 'nextjs') return;

  // 检查多种可能的配置文件
  const possibleConfigs = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts'
  ];

  let configPath: string | null = null;
  let configContent: string | null = null;

  for (const configFile of possibleConfigs) {
    const filePath = path.join(outputDir, configFile);
    if (existsSync(filePath)) {
      configPath = filePath;
      configContent = readFileSync(filePath, 'utf-8');
      break;
    }
  }

  if (!configPath || !configContent) {
    console.log(chalk.yellow('\n⚠️  未找到 next.config.js/mjs/ts 文件'));
    console.log(chalk.gray('   Next.js 项目需要配置 Standalone 模式以优化部署'));
    return;
  }

  // 检查是否包含 output: 'standalone'
  const hasStandaloneConfig =
    configContent.includes("output: 'standalone'") ||
    configContent.includes('output:"standalone"') ||
    configContent.includes("output: \"standalone\"") ||
    configContent.includes('output:`standalone`');

  if (hasStandaloneConfig) {
    // 已配置，无需操作
    return;
  }

  // 未配置，提示用户
  console.log(chalk.yellow('\n⚠️  Next.js 配置检查'));
  console.log(chalk.gray('   未检测到 Standalone 模式配置'));
  console.log(chalk.gray('   Standalone 模式可大幅减少镜像体积（200MB+ → 30MB）'));
  console.log(chalk.gray(`   配置文件：${path.basename(configPath)}\n`));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '是否需要配置 Standalone 模式？',
      choices: [
        { name: '是，显示配置方法（推荐）', value: 'show' },
        { name: '否，我知道如何配置', value: 'skip' },
        { name: '否，我不需要 Standalone 模式', value: 'ignore' }
      ],
      default: 'show'
    }
  ]);

  if (action === 'show') {
    console.log(chalk.cyan('\n📝 配置方法：'));
    console.log(chalk.white(`\n  在 ${path.basename(configPath)} 中添加以下配置：\n`));
    console.log(chalk.green('  module.exports = {'));
    console.log(chalk.green("    output: 'standalone',"));
    console.log(chalk.green('    // ... 其他配置'));
    console.log(chalk.green('  }\n'));
    console.log(chalk.gray('  如果使用 ES Module (next.config.mjs):'));
    console.log(chalk.green('  export default {'));
    console.log(chalk.green("    output: 'standalone',"));
    console.log(chalk.green('  }\n'));
    console.log(chalk.yellow('⚠️  配置后请重新构建项目：npm run build\n'));
  } else if (action === 'ignore') {
    console.log(chalk.yellow('⚠️  警告：不使用 Standalone 模式将导致镜像体积过大（200MB+）'));
    console.log(chalk.gray('   Dockerfile 可能需要调整以支持标准模式\n'));
  }
}

// 读取 package.json 获取版本号
const packageJson = JSON.parse(
  readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('cicd-setup')
  .description('CloudDreamAI GitLab CI/CD 自动配置工具')
  .version(packageJson.version);

program
  .command('init')
  .description('初始化 CI/CD 配置（交互式）')
  .option('-o, --output <dir>', '输出目录', process.cwd())
  .option('--dry-run', '仅生成文件，不上传变量到 GitLab')
  .action(async (options) => {
    try {
      console.log(chalk.bold.cyan('\n🚀 CloudDreamAI CI/CD 自动配置工具\n'));

      // 导入 inquirer
      const inquirer = (await import('inquirer')).default;

      // 1. 收集配置信息
      const collector = createPromptCollector();
      const config = await collector.collectConfig();

      // 显示配置摘要
      console.log(chalk.bold.cyan('\n📋 配置摘要'));
      console.log(chalk.gray('='.repeat(50)));
      console.log(chalk.white(`项目名称:     ${config.project.name}`));
      console.log(chalk.white(`项目类型:     ${config.project.type}`));
      console.log(chalk.white(`部署目录:     ${config.project.deployDir}`));
      console.log(chalk.white(`开发端口:     ${config.project.devPort}`));
      console.log(chalk.white(`生产端口:     ${config.project.prodPort}`));
      console.log(chalk.white(`服务器地址:   ${config.server.testServerHost}`));
      if (config.project.devDomain) {
        console.log(chalk.white(`开发域名:     ${config.project.devDomain}`));
      }
      if (config.project.prodDomain) {
        console.log(chalk.white(`生产域名:     ${config.project.prodDomain}`));
      }
      if (config.database?.enableMigration) {
        console.log(chalk.white(`数据库迁移:   ${config.database.migrationCommand}`));
      }
      console.log(chalk.gray('='.repeat(50)));

      const { continueSetup } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continueSetup',
          message: '确认以上配置并继续？',
          default: true,
        },
      ]);

      if (!continueSetup) {
        console.log(chalk.yellow('\n⚠️  已取消配置\n'));
        return;
      }

      // 2. 测试 GitLab 连接
      const spinner = ora('正在测试 GitLab 连接...').start();
      const gitlabClient = createGitLabClient(config.gitlab);
      const testResult = await gitlabClient.testConnection();

      if (!testResult.success) {
        spinner.fail(chalk.red(`GitLab 连接失败: ${testResult.error}`));
        process.exit(1);
      }

      spinner.succeed(
        chalk.green(`GitLab 连接成功 (用户: ${testResult.data?.username})`)
      );

      // 3. 检查并修复 package.json
      spinner.start('检查 package.json scripts...');
      const packageHelper = createPackageHelper();
      const packageResult = await packageHelper.ensureLintScripts(
        options.output,
        config.project.type
      );

      if (packageResult.modified) {
        spinner.succeed(
          chalk.green(
            `已添加 ${packageResult.addedScripts.length} 个 script: ${packageResult.addedScripts.join(', ')}`
          )
        );
      } else {
        spinner.succeed(chalk.green('package.json 检查完成'));
      }

      // 3.5 项目配置检查
      await checkPackageLockIgnored(options.output, inquirer);
      await checkTsConfigRootDir(options.output, inquirer, config.project.type);
      await checkNextConfig(options.output, inquirer, config.project.type);

      // 4. 生成文件
      spinner.start('正在生成 CI/CD 配置文件...');
      const templateGenerator = createTemplateGenerator();
      const generateResult = await templateGenerator.generateAll(
        options.output,
        config.project.type,
        config.project,
        config.gitlab.baseUrl,
        config.database
      );

      if (!generateResult.success) {
        spinner.fail(chalk.red(`文件生成失败: ${generateResult.error}`));
        process.exit(1);
      }

      spinner.succeed(chalk.green('CI/CD 配置文件生成成功'));
      console.log(chalk.gray('\n生成的文件:'));
      generateResult.files.forEach((file) => {
        console.log(chalk.gray(`  - ${path.relative(process.cwd(), file)}`));
      });

      if (options.dryRun) {
        console.log(
          chalk.yellow(
            '\n⚠️  --dry-run 模式：已跳过上传变量到 GitLab\n'
          )
        );
        console.log(chalk.cyan('后续步骤:'));
        console.log(chalk.gray('  1. 提交生成的文件到 Git 仓库'));
        console.log(chalk.gray('  2. 手动在 GitLab 项目中配置 CI/CD 变量'));
        console.log(chalk.gray('  3. 或使用 `cicd-setup upload` 命令上传变量\n'));
        return;
      }

      // 4. 搜索项目
      let selectedProject: number | null = null;

      while (!selectedProject) {
        const { searchKeyword } = await inquirer.prompt([
          {
            type: 'input',
            name: 'searchKeyword',
            message: '搜索 GitLab 项目（输入项目名称关键词）:',
            validate: (input) => input ? true : '请输入搜索关键词',
          },
        ]);

        spinner.start(`正在搜索项目 "${searchKeyword}"...`);
        const projectsResult = await gitlabClient.listProjects(1, 100);

        if (!projectsResult.success || !projectsResult.data) {
          spinner.fail(chalk.red(`获取项目列表失败: ${projectsResult.error}`));
          process.exit(1);
        }

        // 根据关键词过滤项目
        const filteredProjects = projectsResult.data.filter(p =>
          p.path_with_namespace.toLowerCase().includes(searchKeyword.toLowerCase()) ||
          p.name.toLowerCase().includes(searchKeyword.toLowerCase())
        );

        spinner.stop();

        if (filteredProjects.length === 0) {
          console.log(chalk.yellow(`\n未找到包含 "${searchKeyword}" 的项目，请重新搜索\n`));
          continue;
        }

        console.log(chalk.green(`\n找到 ${filteredProjects.length} 个匹配的项目:\n`));

        const { projectChoice } = await inquirer.prompt([
          {
            type: 'list',
            name: 'projectChoice',
            message: '选择要配置的项目:',
            choices: [
              ...filteredProjects.map((p) => ({
                name: `${p.path_with_namespace} (${p.default_branch})`,
                value: p.id,
              })),
              { name: '🔍 重新搜索', value: 'search_again' },
            ],
          },
        ]);

        if (projectChoice === 'search_again') {
          continue;
        }

        selectedProject = projectChoice;
      }

      // 5. 生成并上传变量
      spinner.start('正在生成 CI/CD 变量...');
      const variableConfigurator = createVariableConfigurator();
      const variables = variableConfigurator.generateVariables(config);

      // 验证配置
      const validation = variableConfigurator.validateConfig(config);
      if (!validation.valid) {
        spinner.fail(chalk.red('配置验证失败:'));
        validation.errors.forEach((err) => {
          console.log(chalk.red(`  - ${err}`));
        });
        process.exit(1);
      }

      spinner.succeed(chalk.green(`生成了 ${variables.length} 个 CI/CD 变量`));

      // 显示变量摘要
      console.log(chalk.cyan('\nCI/CD 变量摘要:'));
      console.log(
        chalk.gray(variableConfigurator.getVariableSummary(variables))
      );

      // 检测变量冲突
      spinner.start('检测已存在的变量...');
      const existingVarsResult = await gitlabClient.listVariables(selectedProject);

      if (existingVarsResult.success && existingVarsResult.data) {
        const existingKeys = existingVarsResult.data.map(v => v.key);
        const newKeys = variables.map(v => v.key);
        const conflictKeys = newKeys.filter(k => existingKeys.includes(k));

        if (conflictKeys.length > 0) {
          spinner.stop();
          console.log(chalk.yellow(`\n⚠️  以下变量已存在，将被覆盖:`));
          conflictKeys.forEach(key => {
            console.log(chalk.yellow(`   - ${key}`));
          });
        } else {
          spinner.succeed(chalk.green('未发现变量冲突'));
        }
      } else {
        spinner.warn('无法获取已存在的变量列表');
      }

      // 确认上传
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: '确认上传这些变量到 GitLab？',
          default: true,
        },
      ]);

      if (!confirm) {
        console.log(chalk.yellow('\n⚠️  已取消上传变量\n'));
        return;
      }

      // 7. 批量上传变量
      spinner.start('正在上传 CI/CD 变量到 GitLab...');
      const uploadResult = await gitlabClient.batchUpsertVariables(
        selectedProject,
        variables
      );

      if (uploadResult.success.length > 0) {
        spinner.succeed(
          chalk.green(`成功上传 ${uploadResult.success.length} 个变量`)
        );
        uploadResult.success.forEach((key) => {
          console.log(chalk.green(`  ✓ ${key}`));
        });
      }

      if (uploadResult.failed.length > 0) {
        console.log(chalk.red(`\n失败 ${uploadResult.failed.length} 个变量:`));
        uploadResult.failed.forEach(({ key, error }) => {
          console.log(chalk.red(`  ✗ ${key}: ${error}`));
        });
      }

      console.log(chalk.bold.green('\n✨ CI/CD 配置完成！\n'));
      console.log(chalk.cyan('后续步骤:'));
      console.log(chalk.gray('  1. 提交生成的文件到 Git 仓库'));
      console.log(chalk.gray('  2. 推送到 GitLab (main 或 develop 分支)'));
      console.log(chalk.gray('  3. 查看 CI/CD Pipeline 运行状态\n'));
    } catch (error) {
      console.error(chalk.red('\n❌ 发生错误:'), error);
      process.exit(1);
    }
  });

program
  .command('upload')
  .description('仅上传 CI/CD 变量到 GitLab（需要已有配置）')
  .option('-c, --config <file>', '配置文件路径 (JSON 格式)')
  .action(async (options) => {
    console.log(chalk.yellow('\n⚠️  upload 命令尚未实现\n'));
    console.log(chalk.gray('提示: 使用 `cicd-setup init` 完成完整配置\n'));
  });

program
  .command('update')
  .description('更新 cicd-setup 到最新版本')
  .action(async () => {
    const { execSync } = await import('child_process');
    const spinner = ora('正在检查最新版本...').start();

    try {
      // 获取最新版本号
      const latestVersion = execSync('npm view clouddreamai-cicd-setup version', { encoding: 'utf-8' }).trim();
      const currentVersion = packageJson.version;

      if (latestVersion === currentVersion) {
        spinner.succeed(chalk.green(`已是最新版本 (${currentVersion})`));
        return;
      }

      spinner.text = `正在更新 ${currentVersion} -> ${latestVersion}...`;
      execSync('npm install -g clouddreamai-cicd-setup@latest', { stdio: 'inherit' });
      spinner.succeed(chalk.green(`更新成功！${currentVersion} -> ${latestVersion}`));
    } catch (error) {
      spinner.fail(chalk.red('更新失败'));
      console.error(error);
      process.exit(1);
    }
  });

program.parse(process.argv);

// 如果没有提供命令，显示帮助
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
