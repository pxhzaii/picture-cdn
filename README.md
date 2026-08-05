---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '7858b1f1-6d96-448f-a0ab-e0c617a519d8'
  PropagateID: '7858b1f1-6d96-448f-a0ab-e0c617a519d8'
  ReservedCode1: '3fef6d17-baed-41fc-a2f7-00a0f6db8836'
  ReservedCode2: '3fef6d17-baed-41fc-a2f7-00a0f6db8836'
---

# Picture CDN - Cloudflare Pages 图床

基于 [autoPicCdn](https://github.com/yumusb/autoPicCdn) 改造，将原 PHP 后端替换为 Cloudflare Pages Functions，无需 PHP / MySQL 即可运行。

## 功能

- 支持 **GitHub** 和 **Gitee** 双平台上传
- **多 CDN 线路切换**（仅 GitHub）：
  - jsDelivr（默认推荐）
  - Statically
  - Gcore
  - GitHub Raw
- **可选 R2 双写**：图片同时存到 Cloudflare R2，自带 CDN
- **访问口令可开关**：`TOKEN_REQUIRED=true` 启用，`false` 关闭
- 前端支持点击上传 + Ctrl+V 粘贴上传
- 无需数据库，去掉原 MySQL 去重

## 快速部署

### 1. 连接 GitHub 仓库

Cloudflare Dashboard → Workers & Pages → Create → Pages → 连接本仓库

构建设置：
- Framework preset: **None**
- Build command: **留空**
- Build output directory: **.**

### 2. 配置环境变量

在 Pages 项目 Settings → Environment variables 中添加：

**必须（GitHub）：**

| 变量名 | 说明 |
|--------|------|
| `GH_TOKEN` | GitHub Personal Access Token（repo 权限） |
| `GH_USER` | GitHub 用户名 |
| `GH_REPO` | 图片存储仓库名 |
| `ACCESS_TOKEN` | 上传口令 |

**Gitee（可选）：**

| 变量名 | 说明 |
|--------|------|
| `GITEE_TOKEN` | Gitee Personal Access Token |
| `GITEE_USER` | Gitee 用户名 |
| `GITEE_REPO` | Gitee 仓库名 |

**通用（可选）：**

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `TOKEN_REQUIRED` | 是否强制校验上传口令 | `true` |
| `UPLOAD_R2` | R2 全局总开关 | `false` |
| `R2_PUBLIC_URL` | R2 公共访问 URL | 空 |

### 3. R2 绑定（可选）

Pages Settings → Functions → R2 bucket bindings → 变量名填 `MY_BUCKET`

## 详细文档

完整部署步骤、R2 配置、CDN 线路说明、故障排查等请查看 [部署指南.md](部署指南.md)

## 项目结构

```
├── functions/up.ts      # Pages Function 上传接口（核心后端）
├── static/js/embed.js   # 前端上传逻辑
├── index.html           # 主页面
├── wrangler.toml        # 本地开发配置
├── up.php               # 原版 PHP 后端（仅供参考）
└── 部署指南.md            # 详细部署文档
```

## 安全

- 所有密钥配置在 Cloudflare Pages 环境变量中，禁止硬编码
- GitHub Token 仅需 `repo` 权限
- 原版 `up.php` 中的明文密钥已清除为占位符

## 致谢

- 原项目：[yumusb/autoPicCdn](https://github.com/yumusb/autoPicCdn)

> AI生成