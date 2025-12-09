/**
 * CloudDreamAI CI/CD Setup - package.json 辅助工具
 * 用于检查和添加必要的 npm scripts
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProjectType } from '../core/types';

/**
 * package.json 辅助类
 */
export class PackageHelper {
  /**
   * 检查并修复 package.json 中的 lint 命令
   */
  async ensureLintScripts(
    projectDir: string,
    projectType: ProjectType
  ): Promise<{ modified: boolean; addedScripts: string[] }> {
    const packageJsonPath = path.join(projectDir, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      console.log('\n⚠️  未找到 package.json，跳过脚本检查\n');
      return { modified: false, addedScripts: [] };
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const scripts = packageJson.scripts || {};
    const addedScripts: string[] = [];
    let modified = false;

    // 根据项目类型确定需要的命令
    const requiredScripts = this.getRequiredScripts(projectType, scripts);

    if (requiredScripts.length === 0) {
      return { modified: false, addedScripts: [] };
    }

    console.log('\n📋 检查 package.json scripts...\n');

    // 询问用户是否添加
    const inquirer = (await import('inquirer')).default;
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `检测到缺少以下推荐的 npm scripts，是否自动添加？\n${requiredScripts.map((s) => `  - ${s.name}: ${s.command}`).join('\n')}\n`,
        default: true,
      },
    ]);

    if (!confirm) {
      console.log('\n⚠️  已跳过添加 scripts，CI/CD 将使用智能检测\n');
      return { modified: false, addedScripts: [] };
    }

    // 添加缺失的脚本
    for (const script of requiredScripts) {
      packageJson.scripts[script.name] = script.command;
      addedScripts.push(script.name);
      modified = true;
    }

    if (modified) {
      // 备份原文件
      const backupPath = `${packageJsonPath}.backup`;
      fs.copyFileSync(packageJsonPath, backupPath);

      // 写入更新后的 package.json
      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(packageJson, null, 2) + '\n',
        'utf-8'
      );

      console.log(`\n✅ 已添加 ${addedScripts.length} 个 script`);
      console.log(`   备份文件: ${backupPath}\n`);
    }

    return { modified, addedScripts };
  }

  /**
   * 获取需要添加的脚本
   */
  private getRequiredScripts(
    projectType: ProjectType,
    existingScripts: Record<string, string>
  ): Array<{ name: string; command: string; description: string }> {
    const required: Array<{ name: string; command: string; description: string }> =
      [];

    // NestJS 项目
    if (projectType === 'nestjs' || projectType === 'node') {
      // 检查是否有 lint:check
      if (!existingScripts['lint:check']) {
        // 如果有 lint，基于它创建 lint:check
        if (existingScripts['lint']) {
          const lintCommand = existingScripts['lint'];
          // 移除 --fix 参数
          const checkCommand = lintCommand.replace(/\s+--fix\s*$/, '').trim();
          required.push({
            name: 'lint:check',
            command: checkCommand,
            description: 'ESLint 检查（不自动修复）',
          });
        } else {
          // 默认 NestJS lint 命令
          required.push({
            name: 'lint:check',
            command: 'eslint "{src,apps,libs,test}/**/*.ts"',
            description: 'ESLint 检查',
          });
          required.push({
            name: 'lint',
            command: 'eslint "{src,apps,libs,test}/**/*.ts" --fix',
            description: 'ESLint 检查并自动修复',
          });
        }
      }
    }

    // Vue/React 项目
    if (projectType === 'vue' || projectType === 'react') {
      // 检查是否有 type-check
      if (!existingScripts['type-check']) {
        if (projectType === 'vue') {
          required.push({
            name: 'type-check',
            command: 'vue-tsc --noEmit',
            description: 'TypeScript 类型检查',
          });
        } else {
          required.push({
            name: 'type-check',
            command: 'tsc --noEmit',
            description: 'TypeScript 类型检查',
          });
        }
      }

      // 如果没有 lint:check 也没有 lint
      if (!existingScripts['lint:check'] && !existingScripts['lint']) {
        required.push({
          name: 'lint',
          command: 'eslint . --ext .ts,.tsx,.vue --fix',
          description: 'ESLint 检查并自动修复',
        });
        required.push({
          name: 'lint:check',
          command: 'eslint . --ext .ts,.tsx,.vue',
          description: 'ESLint 检查',
        });
      }
    }

    return required;
  }
}

/**
 * 创建 PackageHelper 实例
 */
export function createPackageHelper(): PackageHelper {
  return new PackageHelper();
}
