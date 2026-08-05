/**
 * Pages Function: 图床上传接口
 * 替代原 PHP 版 up.php，运行于 Cloudflare Pages Functions（无 PHP/MySQL）。
 *
 * 功能：
 *  - 支持上传到 GitHub 或 Gitee 公开仓库（base64 提交）
 *  - 多 CDN 线路切换：jsDelivr / gcore / staticaly / GitHub Raw / GHProxy / GitHub加速（Gitee 用直链）
 *  - 可选同时写入 Cloudflare R2
 *  - 访问口令可开关（TOKEN_REQUIRED=false 时无需口令）
 *
 * 环境变量（在 Cloudflare Pages 项目设置中配置）：
 *  --- GitHub（必填，STORAGE_TYPE 含 github 时需要） ---
 *  - GH_TOKEN       GitHub Personal Access Token（仅需 repo 权限）
 *  - GH_USER        GitHub 用户名
 *  - GH_REPO        仓库名
 *  - GH_BRANCH      分支名（默认 main）
 *  - GH_EMAIL       提交邮箱
 *
 *  --- Gitee（STORAGE_TYPE 含 gitee 时需要） ---
 *  - GITEE_TOKEN    Gitee Personal Access Token
 *  - GITEE_USER     Gitee 用户名
 *  - GITEE_REPO     仓库名
 *  - GITEE_BRANCH   分支名（默认 master）
 *  - GITEE_EMAIL    提交邮箱
 *
 *  --- 通用 ---
 *  - ACCESS_TOKEN   上传访问口令
 *  - TOKEN_REQUIRED 是否强制校验口令，true/false（默认 true）
 *  - UPLOAD_R2      是否同时写入 R2，true/false（默认 false）
 *  - R2_PUBLIC_URL  R2 公共访问基础 URL
 *
 * 前端需 POST multipart/form-data，字段：
 *  - file     图片文件
 *  - token    访问口令（若开启）
 *  - useR2    "true"/"false"
 *  - storage  "github" / "gitee"（默认 github）
 *  - cdn      "jsdelivr" / "gcore" / "staticaly" / "raw" / "ghproxy" / "gh加速"（默认 jsdelivr，仅 GitHub 有效）
 */

interface Env {
  GH_TOKEN: string;
  GH_USER: string;
  GH_REPO: string;
  GH_BRANCH?: string;
  GH_EMAIL?: string;
  GITEE_TOKEN?: string;
  GITEE_USER?: string;
  GITEE_REPO?: string;
  GITEE_BRANCH?: string;
  GITEE_EMAIL?: string;
  ACCESS_TOKEN: string;
  TOKEN_REQUIRED?: string;
  UPLOAD_R2?: string;
  R2_PUBLIC_URL?: string;
  MY_BUCKET?: R2Bucket;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // 分块编码避免大文件栈溢出（每块 512KB，对齐 3 字节边界保证 base64 正确拼接）
  const CHUNK = 512 * 1024;
  let result = '';
  for (let offset = 0; offset < bytes.length; ) {
    // 确保每块长度是 3 的倍数（base64 编码单元）
    let end = Math.min(offset + CHUNK, bytes.length);
    const remainder = (end - offset) % 3;
    if (remainder !== 0 && end < bytes.length) {
      end -= remainder;
    }
    const slice = bytes.subarray(offset, end);
    let binary = '';
    for (let i = 0; i < slice.length; i++) {
      binary += String.fromCharCode(slice[i]);
    }
    result += btoa(binary);
    offset = end;
  }
  return result;
}

function checkToken(env: Env, token?: string): boolean {
  const required = (env.TOKEN_REQUIRED ?? 'true').toLowerCase() !== 'false';
  if (!required) return true;
  return !!token && token === env.ACCESS_TOKEN;
}

// GitHub CDN 线路
function githubCdnUrl(env: Env, filePath: string, cdn: string): string {
  const branch = env.GH_BRANCH || 'main';
  const user = env.GH_USER;
  const repo = env.GH_REPO;
  switch (cdn) {
    case 'gcore':
      return `https://gcore.jsdelivr.net/gh/${user}/${repo}@${branch}/${filePath}`;
    case 'staticaly':
      return `https://cdn.staticaly.com/gh/${user}/${repo}@${branch}/${filePath}`;
    case 'raw':
      return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath}`;
    case 'ghproxy':
      return `https://mirror.ghproxy.com/https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath}`;
    case 'gh加速':
      return `https://gh.api.99988866.xyz/https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath}`;
    case 'jsdelivr':
    default:
      return `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${filePath}`;
  }
}

// 上传到 GitHub
async function pushToGitHub(env: Env, path: string, base64: string): Promise<string> {
  const branch = env.GH_BRANCH || 'main';
  const email = env.GH_EMAIL || 'picbed@example.com';
  const url = `https://api.github.com/repos/${env.GH_USER}/${env.GH_REPO}/contents/${path}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${env.GH_TOKEN}`,
      'User-Agent': 'Cloudflare-Pages-Picbed',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({
      message: 'upload picture',
      branch,
      content: base64,
      committer: { name: env.GH_USER, email },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 422) {
      throw new Error('GitHub 上传失败：文件已存在（同名文件冲突），请重试');
    }
    throw new Error(`GitHub 上传失败 (${res.status}): ${errText}`);
  }
  const data = (await res.json()) as { content?: { path?: string } };
  return data.content?.path || path;
}

// 上传到 Gitee
async function pushToGitee(env: Env, path: string, base64: string): Promise<string> {
  const user = env.GITEE_USER || '';
  const repo = env.GITEE_REPO || '';
  const branch = env.GITEE_BRANCH || 'master';
  const url = `https://gitee.com/api/v5/repos/${user}/${repo}/contents/${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'Cloudflare-Pages-Picbed',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      access_token: env.GITEE_TOKEN,
      message: 'upload picture',
      content: base64,
      branch,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gitee 上传失败 (${res.status}): ${err}`);
  }
  const data = (await res.json()) as { content?: { path?: string; download_url?: string } };
  return data.content?.download_url || data.content?.path || path;
}

// 写入 R2
async function pushToR2(env: Env, key: string, body: ArrayBuffer, userRequested: boolean): Promise<string | null> {
  const globalEnabled = (env.UPLOAD_R2 ?? 'false').toLowerCase() === 'true';
  if (!globalEnabled || !userRequested || !env.MY_BUCKET) return null;
  await env.MY_BUCKET.put(key, body);
  const base = (env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  return base ? `${base}/${key}` : key;
}

export const onRequestOptions: PagesFunction = () => {
  return json({}, 204);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;
  try {
    const form = await context.request.formData();
    const file = form.get('file');
    const token = (form.get('token') as string) || undefined;
    const useR2 = (form.get('useR2') as string) || 'false';
    const storage = (form.get('storage') as string) || 'github';
    const cdn = (form.get('cdn') as string) || 'jsdelivr';

    // 口令校验
    if (!checkToken(env, token)) {
      return json({ code: 403, msg: '访问口令错误或未填写', url: null }, 403);
    }

    if (!(file instanceof File) || file.size < 100) {
      return json({ code: 404, msg: '无法识别你的文件', url: null }, 404);
    }

    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return json({ code: 413, msg: '文件过大，上限 20MB', url: null }, 413);
    }

    const buf = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const ts = date.getFullYear().toString()
      + String(date.getMonth() + 1).padStart(2, '0')
      + String(date.getDate()).padStart(2, '0')
      + String(date.getHours()).padStart(2, '0')
      + String(date.getMinutes()).padStart(2, '0')
      + String(date.getSeconds()).padStart(2, '0')
      + String(date.getMilliseconds()).padStart(3, '0');
    const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 4);
    const path = `${y}/${m}/${d}/${ts}${rand}.${ext}`;

    // 上传到对应平台并生成链接
    let url = '';
    if (storage === 'gitee') {
      try {
        url = await pushToGitee(env, path, base64);
      } catch (e) {
        return json({ code: 500, msg: (e as Error).message, url: null }, 500);
      }
    } else {
      // GitHub
      let filePath = '';
      try {
        filePath = await pushToGitHub(env, path, base64);
      } catch (e) {
        return json({ code: 500, msg: (e as Error).message, url: null }, 500);
      }
      url = githubCdnUrl(env, filePath, cdn);
    }

    // R2 双写
    let r2Url: string | null = null;
    if (useR2 === 'true') {
      try {
        r2Url = await pushToR2(env, path, buf, true);
      } catch {
        r2Url = null;
      }
    }

    return json({
      code: 'success',
      data: {
        url,
        r2url: r2Url || '',
        filemd5: '',
      },
    });
  } catch (e) {
    return json({ code: 500, msg: '上传处理异常：' + (e as Error).message, url: null }, 500);
  }
};
