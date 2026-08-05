/**
 * Pages Function: 图床上传接口
 * 替代原 PHP 版 up.php，运行于 Cloudflare Pages Functions（无 PHP/MySQL）。
 *
 * 功能：
 *  - 将图片上传到 GitHub 公开仓库（base64 提交），返回 jsDelivr CDN 链接（原方案）
 *  - 可选地同时写入 Cloudflare R2（通过环境变量 UPLOAD_R2=true 开启）
 *  - 访问口令可开关（TOKEN_REQUIRED=false 时无需口令）
 *  - 已去掉原 MySQL 去重逻辑（KV 不再需要）
 *
 * 环境变量（在 Cloudflare Pages 项目设置中配置）：
 *  - GH_TOKEN       GitHub Personal Access Token（仅需 repo 权限）
 *  - GH_USER        GitHub 用户名
 *  - GH_REPO        仓库名
 *  - GH_BRANCH      分支名（默认 main）
 *  - GH_EMAIL       提交邮箱（可随便写）
 *  - ACCESS_TOKEN   上传访问口令（依赖 TOKEN_REQUIRED 开关）
 *  - TOKEN_REQUIRED 是否强制校验口令，true/false（默认 true）
 *  - UPLOAD_R2      是否同时写入 R2，true/false（默认 false）
 *  - R2_PUBLIC_URL  R2 公共访问基础 URL（直链），如 https://cdn.example.com
 * 绑定：R2 存储桶，变量名需为 MY_BUCKET（见 wrangler.toml / Pages 绑定）
 *
 * 前端需 POST multipart/form-data，字段：
 *  - file     图片文件
 *  - token    访问口令（若开启）
 *  - useR2    "true"/"false"，是否同时写入 R2
 */

interface Env {
  GH_TOKEN: string;
  GH_USER: string;
  GH_REPO: string;
  GH_BRANCH?: string;
  GH_EMAIL?: string;
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

// 分块将 ArrayBuffer 转为 base64，避免大文件展开报栈溢出（与原 PHP base64_encode 一致）
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// 校验口令（可开关）
function checkToken(env: Env, token?: string): boolean {
  const required = (env.TOKEN_REQUIRED ?? 'true').toLowerCase() !== 'false';
  if (!required) return true;
  return !!token && token === env.ACCESS_TOKEN;
}

// 上传到 GitHub（base64，与原 PHP 一致），返回 jsDelivr 链接
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
    const err = await res.text();
    throw new Error(`GitHub 上传失败 (${res.status}): ${err}`);
  }
  const data = (await res.json()) as { content?: { path?: string } };
  const p = data.content?.path || path;
  return `https://cdn.jsdelivr.net/gh/${env.GH_USER}/${env.GH_REPO}@${branch}/${p}`;
}

// 可选：写入 R2（需同时满足环境变量总开关 + 前端用户选择）
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

    // 口令校验
    if (!checkToken(env, token)) {
      return json({ code: 403, msg: '访问口令错误或未填写', url: null }, 403);
    }

    if (!(file instanceof File) || file.size < 100) {
      return json({ code: 404, msg: '无法识别你的文件', url: null }, 404);
    }

    // 后端文件大小校验（GitHub Contents API 上限约 19MB 原始文件）
    const MAX_SIZE = 20 * 1024 * 1024; // 20MB
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
    const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const path = `${y}/${m}/${d}/${rand}.${ext}`;

    let ghUrl = '';
    try {
      ghUrl = await pushToGitHub(env, path, base64);
    } catch (e) {
      return json({ code: 500, msg: (e as Error).message, url: null }, 500);
    }

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
        url: ghUrl,
        r2url: r2Url || '',
        filemd5: '',
      },
    });
  } catch (e) {
    return json({ code: 500, msg: '上传处理异常：' + (e as Error).message, url: null }, 500);
  }
};
