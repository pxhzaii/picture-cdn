---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '1152692f-ceb2-4c87-a1f1-9d069f16f830'
  PropagateID: '1152692f-ceb2-4c87-a1f1-9d069f16f830'
  ReservedCode1: 'f15a535e-6ee5-4ed1-9ac2-5183b5c19db1'
  ReservedCode2: 'f15a535e-6ee5-4ed1-9ac2-5183b5c19db1'
---

# Picture CDN - Cloudflare Pages 图床

由 AI 基于 [autoPicCdn](https://github.com/yumusb/autoPicCdn) 改造，将原 PHP 后端替换为 Cloudflare Pages Functions，无需 PHP / MySQL 即可运行。

## 功能

- 支持 **GitHub** 和 **Gitee** 双平台上传
- **多 CDN 线路切换**（仅 GitHub）：jsDelivr / Gcore / Statically / GitHub Raw / GHProxy 镜像 / GitHub加速
- **时间戳自动重命名**：上传文件按 `年月日时分秒毫秒+随机字符` 命名，同名文件不会冲突
- **可选 R2 双写**：图片同时存到 Cloudflare R2，自带 CDN
- **访问口令可开关**：`TOKEN_REQUIRED=true` 启用，`false` 关闭
- 前端支持点击上传 + Ctrl+V 粘贴上传
- 无需数据库

---

## 一、前置准备

| 准备项 | 说明 |
|--------|------|
| GitHub 账号 | 用于存放图片的公开仓库 |
| Cloudflare 账号 | 用于部署 Pages 和可选的 R2 存储 |
| GitHub Token | 在 GitHub 生成，仅需 `repo` 权限 |

## 二、GitHub 仓库配置

### 2.1 创建图片存储仓库

1. 登录 GitHub，新建一个**公开仓库**（如 `tc`）
2. 初始化时选择 `main` 分支并添加一个 README 文件（让仓库不为空）

### 2.2 生成 GitHub Token

1. 访问 https://github.com/settings/tokens → Generate new token (classic)
2. 权限勾选：`repo`（Full control of private repositories）
3. 生成后复制 Token（**仅显示一次，务必保存**）

## 三、Cloudflare Pages 部署

### 3.1 创建 Pages 项目

1. 登录 Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git
2. 选择图床代码所在的 GitHub 仓库
3. 构建设置：
   - **Framework preset**: None
   - **Build command**: 留空
   - **Build output directory**: `.`（点号，表示根目录）
   - 可以在环境变量（高级）添加环境变量，也可以去**3.2**配置
4. 点击 Save and Deploy

### 3.2 配置环境变量

在 Pages 项目 → Settings → Environment variables 中添加以下变量：

#### 必须配置（GitHub）

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `GH_TOKEN` | GitHub Personal Access Token | `ghp_xxxxxxxxxxxx` |
| `GH_USER` | GitHub 用户名 | `pxhzaii` |
| `GH_REPO` | 图片存储仓库名 | `tc` |
| `ACCESS_TOKEN` | 上传口令（用户上传时需填写） | `your-secret-password` |
| `TOKEN_REQUIRED` | 是否强制校验上传口令 | `true` | `true` / `false` |


**口令开关说明**：
- `TOKEN_REQUIRED=true`（默认）：用户必须填写正确的口令才能上传
- `TOKEN_REQUIRED=false`：任何人无需口令即可上传（公开图床模式）

#### 可选配置（GitHub）

| 变量名 | 说明 | 默认值 | 示例值 |
|--------|------|--------|--------|
| `GH_BRANCH` | 仓库分支 | `main` | `main` |
| `GH_EMAIL` | 提交邮箱 | `picbed@example.com` | `you@example.com` |
| `UPLOAD_R2` | R2 全局总开关 | `false` | `true` / `false` |
| `R2_PUBLIC_URL` | R2 公共访问基础 URL | 空 | `https://cdn.yourdomain.com` |

#### Gitee 配置（需使用 Gitee 上传时填写）

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `GITEE_TOKEN` | Gitee Personal Access Token | 在 https://gitee.com/personal_access_tokens 生成 |
| `GITEE_USER` | Gitee 用户名 | `your-gitee-username` |
| `GITEE_REPO` | Gitee 仓库名（需公开） | `pic-repo` |
| `GITEE_BRANCH` | 分支名 | `master`（默认） |
| `GITEE_EMAIL` | 提交邮箱 | `you@example.com` |

**CDN 线路说明**（仅 GitHub 有效，Gitee 使用官方 download_url 直链）：

| 线路 | 地址格式 | 特点 |
|------|----------|------|
| jsDelivr | `cdn.jsdelivr.net/gh/...` | 全球 CDN，国内网宿加速，默认推荐 |
| Gcore | `gcore.jsdelivr.net/gh/...` | Gcore 节点加速 |
| Statically | `cdn.staticaly.com/gh/...` | 备用线路 |
| GitHub Raw | `raw.githubusercontent.com/...` | 原始链接，无 CDN |
| GHProxy 镜像 | `mirror.ghproxy.com/...` | GitHub 反代加速，国内友好 |
| GitHub 加速 | `gh.api.99988866.xyz/...` | Cloudflare Workers 反代 |


## 四、R2 存储配置（可选）

如果需要将图片同时存到 Cloudflare R2，需额外配置：

### 4.1 创建 R2 存储桶

1. Cloudflare Dashboard → R2 Object Storage → Create bucket
2. 填写桶名（如 `picture-cdn`），选择区域（建议选离用户最近的）
3. 创建完成后，进入桶 → Settings → R2.dev subdomain → Enable（获取公共访问 URL）

### 4.2 绑定 R2 到 Pages

1. Pages 项目 → Settings → Functions → R2 bucket bindings
2. 点击 Add binding：
   - **Variable name**: `MY_BUCKET`（必须填这个名字）
   - **R2 bucket**: 选择刚创建的桶
3. 保存

### 4.3 配置 R2 环境变量

将以下环境变量设为：
- `UPLOAD_R2` = `true`
- `R2_PUBLIC_URL` = R2 的公共访问 URL（如 `https://pub-xxxx.r2.dev`）

**双重开关机制**：R2 写入需要同时满足两个条件：
- 环境变量 `UPLOAD_R2=true`（管理员全局开关，决定 R2 功能是否可用）
- 前端用户勾选「同时存到 R2」开关（用户单次选择，决定本次上传是否存 R2）
- 两者都为 true 才会执行 R2 写入

## 五、自定义域名（可选）

1. Pages 项目 → Custom domains → Add
2. 输入你的域名并按提示添加 DNS 记录
3. 等待 SSL 证书签发完成

## 六、使用方法

1. 打开部署后的页面
2. 如果开启了口令（`TOKEN_REQUIRED=true`），在「访问口令」输入框填写正确的口令
3. 选择存储平台：**GitHub**（默认）或 **Gitee**
4. 如选 GitHub，可选择 CDN 线路（jsDelivr / Gcore / Statically / GitHub Raw / GHProxy 镜像 / GitHub加速）
5. 如果需要同时存到 R2，勾选「同时存到 R2」开关
6. 点击上传区域选择图片，或直接 Ctrl+V 粘贴剪贴板中的图片
7. 上传成功后会显示：
   - **URL**: CDN 加速链接（根据所选线路不同）
   - **UBB**: 论坛 BBCode 格式
   - **Markdown**: Markdown 图片格式
   - **R2 URL**: R2 直链（仅当存到 R2 时显示）

## 七、文件大小限制

- 前端 layui 组件限制：20MB
- 后端校验限制：20MB
- GitHub Contents API 限制：约 19MB 原始文件（base64 编码后约 25MB）

## 八、文件命名规则

上传文件自动重命名为时间戳，格式为 `YYYYMMDDHHmmssSSS+4位随机字符.扩展名`，例如：
```
2026/08/05/20260805143052783a2f.png
```
- 日期目录：`年/月/日/`
- 文件名：`年月日时分秒毫秒` + `4位随机字符` + `.扩展名`
- 同名文件不会冲突，无需担心覆盖

## 八、安全注意事项

- **所有密钥（GH_TOKEN、ACCESS_TOKEN）务必配置在 Cloudflare Pages 环境变量中，禁止硬编码在代码里**
- 代码仓库中不要提交 `.env` 文件或包含真实 Token 的配置文件
- GitHub Token 仅需 `repo` 权限，不要授予更多权限

## 九、项目文件结构

```
├── functions/
│   └── up.ts          # Pages Function 上传接口（核心后端）
├── static/
│   ├── css/
│   │   └── mystyle.css
│   ├── js/
│   │   ├── embed.js   # 前端上传逻辑
│   │   ├── clipBoard.min.js
│   │   ├── jquery.min.js
│   │   └── Message.js
│   └── layui/         # layui UI 框架
├── index.html         # 主页面
└── wrangler.toml      # 本地开发配置
```

## 十、故障排查

| 问题 | 可能原因 | 解决方法 |
|------|----------|----------|
| 上传返回 403 | 口令未填写或错误 | 检查前端口令与 `ACCESS_TOKEN` 环境变量是否一致 |
| 上传返回 500 + GitHub 错误 | Token 无权限或仓库不存在 | 确认 `GH_TOKEN` 有 `repo` 权限，`GH_USER/GH_REPO` 正确 |
| 上传成功但 jsDelivr 链接 404 | 缓存未刷新或分支名不对 | 等待几分钟；确认 `GH_BRANCH` 与仓库实际默认分支一致 |
| R2 链接不显示 | 环境变量或绑定缺失 | 确认 `UPLOAD_R2=true`、`MY_BUCKET` 已绑定、`R2_PUBLIC_URL` 已填写 |
| R2 链接显示但无法访问 | R2 未开启公共访问 | 在 R2 桶设置中启用 R2.dev subdomain 或自定义域名 |
| 上传返回 422 / 文件已存在 | 同名文件冲突（极少发生） | 自动时间戳重命名，通常不会出现；若出现请重试 |
| 上传大文件失败（413） | 超过大小限制 | 压缩图片后重试（上限 20MB） |

## 致谢

- 原项目：[yumusb/autoPicCdn](https://github.com/yumusb/autoPicCdn)

> AI生成
