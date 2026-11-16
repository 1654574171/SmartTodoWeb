/**
 * Netlify Function：把 /dav/* 同源转发到坚果云 WebDAV。
 *
 * 前端只请求本站的 /dav/...，浏览器不会碰到跨域请求，用户无需填代理地址。
 * 仅透传认证与内容相关请求头，不记录、不存储任何凭据。
 */
const TARGET_BASE = 'https://dav.jianguoyun.com/dav';
const PASS_HEADERS = ['authorization', 'content-type', 'accept'];

exports.handler = async (event) => {
  try {
    const rawUrl = event.rawUrl || event.path || '';
    // rawUrl 形如 .../dav/SmartTodo/index.json，也兼容直接访问函数端点。
    const match = rawUrl.match(/\/dav(\/[^?#]*)?/);
    const remotePath = match && match[1] ? match[1] : '/';
    const params = { ...(event.queryStringParameters || {}) };

    const headers = {};
    for (const name of PASS_HEADERS) {
      const value = event.headers && (event.headers[name] || event.headers[name.toUpperCase()]);
      if (value) headers[name] = value;
    }

    // 优先用查询参数还原方法（Netlify 不会过滤），自定义头作为兼容。
    const headerOverride = event.headers
      && (event.headers['x-http-method-override'] || event.headers['X-HTTP-Method-Override']);
    const override = params.__method || headerOverride;
    delete params.__method;
    const method = (override ? String(override) : event.httpMethod || 'GET').toUpperCase();
    const query = Object.keys(params).length
      ? `?${new URLSearchParams(params).toString()}`
      : '';
    const hasBody = event.body && method !== 'GET' && method !== 'HEAD';
    const body = hasBody
      ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body)
      : undefined;

    const response = await fetch(`${TARGET_BASE}${remotePath}${query}`, {
      method,
      headers,
      body,
      redirect: 'manual',
    });

    const responseHeaders = {
      'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      // 便于在浏览器 Network 面板确认平台实际转发的方法与目标地址。
      'X-Dav-Method': method,
      'X-Dav-Target': `${TARGET_BASE}${remotePath}${query}`,
    };
    const etag = response.headers.get('etag');
    if (etag) responseHeaders.ETag = etag;
    const lastModified = response.headers.get('last-modified');
    if (lastModified) responseHeaders['Last-Modified'] = lastModified;

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: await response.text(),
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'WebDAV 代理请求失败', message: String(error) }),
    };
  }
};
