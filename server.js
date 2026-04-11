#!/usr/bin/env node

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');

const PORT = 3000;
const HOST = '0.0.0.0'; // 监听所有网络接口，允许局域网访问

// 数据存储目录
const DATA_DIR = path.join(__dirname, 'data');
const KEYS_DIR = path.join(DATA_DIR, 'keys'); // 每个 key 一个文件，避免读写 34MB 大文件

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
}

// ============ 分片存储引擎 ============
// 用内存缓存避免每次 GET /api/storage 都读取所有文件
let _allStorageCache = null;
let _storageCacheDirty = true;
let _lastWriteTime = Date.now();

// 从旧的 storage.json 迁移到分片存储
function migrateFromOldStorage() {
    const oldFile = path.join(DATA_DIR, 'storage.json');
    if (!fs.existsSync(oldFile)) return;

    // 如果 keys 目录已有文件，说明已迁移过
    try {
        const existing = fs.readdirSync(KEYS_DIR);
        if (existing.length > 0) {
            console.log('[存储] 分片目录已有数据，跳过迁移');
            return;
        }
    } catch (e) {}

    try {
        console.log('[存储] 开始从 storage.json 迁移到分片存储...');
        const raw = fs.readFileSync(oldFile, 'utf8');
        const storage = JSON.parse(raw);
        const keys = Object.keys(storage);

        for (const key of keys) {
            const safeName = encodeURIComponent(key) + '.json';
            const filePath = path.join(KEYS_DIR, safeName);
            // 值本身就是字符串，直接用 JSON.stringify 包一层保证可逆
            fs.writeFileSync(filePath, JSON.stringify(storage[key]));
        }

        // 备份旧文件
        const backupPath = oldFile + '.bak';
        fs.renameSync(oldFile, backupPath);
        console.log(`[存储] 迁移完成: ${keys.length} 个键。旧文件已备份为 storage.json.bak`);
    } catch (e) {
        console.error('[存储] 迁移失败:', e.message);
    }
}

// 读取所有键值（带缓存）
function readAllStorage() {
    if (_allStorageCache && !_storageCacheDirty) {
        return _allStorageCache;
    }

    const result = {};
    try {
        const files = fs.readdirSync(KEYS_DIR);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
                const key = decodeURIComponent(file.slice(0, -5));
                const raw = fs.readFileSync(path.join(KEYS_DIR, file), 'utf8');
                result[key] = JSON.parse(raw);
            } catch (e) {
                console.error('[存储] 读取文件失败:', file, e.message);
            }
        }
    } catch (e) {
        console.error('[存储] 读取目录失败:', e.message);
    }

    _allStorageCache = result;
    _storageCacheDirty = false;
    return result;
}

// 写入单个键（只写一个小文件，不再读写 34MB 大文件）
function writeStorageKey(key, value) {
    const safeName = encodeURIComponent(key) + '.json';
    const filePath = path.join(KEYS_DIR, safeName);
    fs.writeFileSync(filePath, JSON.stringify(value));
    // 更新缓存（避免全量重读）
    if (_allStorageCache) {
        _allStorageCache[key] = value;
    }
    _lastWriteTime = Date.now();
}

// 删除单个键
function deleteStorageKey(key) {
    const safeName = encodeURIComponent(key) + '.json';
    const filePath = path.join(KEYS_DIR, safeName);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (e) {
        console.error('[存储] 删除失败:', key, e.message);
    }
    if (_allStorageCache) {
        delete _allStorageCache[key];
    }
    _lastWriteTime = Date.now();
}

// 启动时迁移
migrateFromOldStorage();
// 预热缓存
readAllStorage();

// 获取本机局域网 IP 地址
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // 跳过内部地址和非 IPv4 地址
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// 解析 POST 请求的 body
function parseBody(req, callback) {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    req.on('end', () => {
        try {
            callback(null, JSON.parse(body));
        } catch (e) {
            callback(e, null);
        }
    });
}

const server = http.createServer((req, res) => {
    // 解析 URL
    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname;

    // API 路由处理
    if (pathname.startsWith('/api/')) {
        handleAPI(req, res, pathname, parsedUrl.query);
        return;
    }

    // 移除前导斜杠
    if (pathname === '/') {
        pathname = '/index.html';
    }

    // 构建文件路径
    const filePath = path.join(__dirname, pathname);

    // 防止目录遍历攻击
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    // 尝试读取文件
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Server Error');
            }
            return;
        }

        // 确定 Content-Type
        const ext = path.extname(filePath).toLowerCase();
        let contentType = 'text/plain';

        switch (ext) {
            case '.html':
                contentType = 'text/html; charset=utf-8';
                break;
            case '.js':
                contentType = 'application/javascript; charset=utf-8';
                break;
            case '.css':
                contentType = 'text/css; charset=utf-8';
                break;
            case '.json':
                contentType = 'application/json; charset=utf-8';
                break;
            case '.png':
                contentType = 'image/png';
                break;
            case '.jpg':
            case '.jpeg':
                contentType = 'image/jpeg';
                break;
            case '.gif':
                contentType = 'image/gif';
                break;
            case '.svg':
                contentType = 'image/svg+xml; charset=utf-8';
                break;
        }

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    });
});

// API 处理函数
function handleAPI(req, res, pathname, query) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // GET /api/storage - 获取所有存储数据（从分片文件读取，带缓存）
    if (pathname === '/api/storage' && req.method === 'GET') {
        try {
            const storage = readAllStorage();
            const body = JSON.stringify(storage);
            // 支持客户端缓存：如果数据没变，返回 304
            const etag = '"' + _lastWriteTime + '"';
            res.setHeader('ETag', etag);
            if (req.headers['if-none-match'] === etag) {
                res.writeHead(304);
                res.end();
                return;
            }
            res.writeHead(200);
            res.end(body);
        } catch (e) {
            console.error('[API] 读取所有存储失败:', e.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to read storage' }));
        }
        return;
    }

    // POST /api/storage - 批量保存数据
    if (pathname === '/api/storage' && req.method === 'POST') {
        parseBody(req, (err, body) => {
            if (err) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
                return;
            }
            try {
                const keys = Object.keys(body);
                for (const key of keys) {
                    writeStorageKey(key, body[key]);
                }
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                console.error('[API] 批量保存失败:', e.message);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Failed to save storage' }));
            }
        });
        return;
    }

    // GET /api/storage/:key - 获取单个键值
    const storageKeyMatch = pathname.match(/^\/api\/storage\/(.+)$/);
    if (storageKeyMatch && req.method === 'GET') {
        const key = decodeURIComponent(storageKeyMatch[1]);
        try {
            const storage = readAllStorage();
            if (key in storage) {
                res.writeHead(200);
                res.end(JSON.stringify({ value: storage[key] }));
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Key not found' }));
            }
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to read storage' }));
        }
        return;
    }

    // PUT/POST /api/storage/:key - 设置单个键值（只写一个小文件！）
    if (storageKeyMatch && (req.method === 'PUT' || req.method === 'POST')) {
        const key = decodeURIComponent(storageKeyMatch[1]);
        parseBody(req, (err, body) => {
            if (err || !body.hasOwnProperty('value')) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid request body' }));
                return;
            }

            try {
                writeStorageKey(key, body.value);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                console.error(`[API] 保存失败: ${key}`, e.message);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Failed to save storage' }));
            }
        });
        return;
    }

    // DELETE /api/storage/:key - 删除单个键值
    if (storageKeyMatch && req.method === 'DELETE') {
        const key = decodeURIComponent(storageKeyMatch[1]);
        try {
            deleteStorageKey(key);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            console.error(`[API] 删除失败: ${key}`, e.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to delete from storage' }));
        }
        return;
    }

    // POST /api/fetch-url-metadata - 获取网页元数据
    if (pathname === '/api/fetch-url-metadata' && req.method === 'POST') {
        parseBody(req, (err, body) => {
            if (err || !body.url) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid request body' }));
                return;
            }

            let responseSent = false;
            fetchURLMetadata(body.url, (error, metadata) => {
                if (responseSent) return;
                responseSent = true;
                if (error) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: error.message }));
                    return;
                }
                res.writeHead(200);
                res.end(JSON.stringify(metadata));
            });
        });
        return;
    }

    // 未知的 API 路由
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'API endpoint not found' }));
}

// 获取网页元数据的函数
// 检测系统代理设置（仅当环境变量存在时才启用代理）
function getProxyConfig() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
                     process.env.HTTP_PROXY || process.env.http_proxy;
    if (!proxyUrl) return null;
    try {
        const parsed = new URL(proxyUrl);
        return { host: parsed.hostname, port: parseInt(parsed.port) };
    } catch (e) {
        return null;
    }
}

// 通过HTTP代理发送HTTPS请求（CONNECT隧道）
function fetchViaProxy(targetUrl, proxyConfig, callback) {
    const parsedUrl = new URL(targetUrl);
    const targetPort = parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80);
    let done = false;
    const safeCallback = (err, data) => {
        if (done) return;
        done = true;
        callback(err, data);
    };

    const connectReq = http.request({
        host: proxyConfig.host,
        port: proxyConfig.port,
        method: 'CONNECT',
        path: `${parsedUrl.hostname}:${targetPort}`,
        timeout: 5000
    });

    connectReq.on('connect', (res, socket) => {
        console.log('[代理] CONNECT状态:', res.statusCode);
        if (res.statusCode !== 200) {
            socket.destroy();
            safeCallback(new Error(`Proxy CONNECT failed: ${res.statusCode}`));
            return;
        }

        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
            socket: socket,
            agent: false
        };

        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        const req = protocol.request(options, (response) => {
            console.log('[代理] 目标响应状态:', response.statusCode);
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                socket.destroy();
                safeCallback(null, { redirect: response.headers.location });
                return;
            }
            if (response.statusCode !== 200) {
                socket.destroy();
                safeCallback(new Error(`HTTP ${response.statusCode}`));
                return;
            }
            let html = '';
            let dataDone = false;
            response.on('data', (chunk) => {
                html += chunk.toString();
                if (html.length > 100000) response.destroy();
            });
            response.on('end', () => {
                if (!dataDone) {
                    dataDone = true;
                    console.log('[代理] 数据接收完成，长度:', html.length);
                    socket.destroy();
                    safeCallback(null, { html });
                }
            });
            response.on('close', () => {
                if (!dataDone && html.length > 0) {
                    dataDone = true;
                    console.log('[代理] 连接关闭，数据长度:', html.length);
                    socket.destroy();
                    safeCallback(null, { html });
                }
            });
        });
        req.on('error', (err) => {
            console.error('[代理] 请求错误:', err.message);
            socket.destroy();
            safeCallback(err);
        });
        req.end();
    });

    connectReq.on('error', (err) => {
        safeCallback(err);
    });

    connectReq.on('timeout', () => {
        connectReq.destroy();
        safeCallback(new Error('Proxy connect timeout'));
    });

    connectReq.end();
}

// 直接发送HTTP(S)请求（不通过代理）
function fetchDirect(targetUrl, callback) {
    const parsedUrl = new URL(targetUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    let done = false;
    const safeCallback = (err, data) => {
        if (done) return;
        done = true;
        callback(err, data);
    };

    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        timeout: 5000
    };

    const request = protocol.request(options, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            safeCallback(null, { redirect: response.headers.location });
            return;
        }
        if (response.statusCode !== 200) {
            safeCallback(new Error(`HTTP ${response.statusCode}`));
            return;
        }
        let html = '';
        response.on('data', (chunk) => {
            html += chunk.toString();
            if (html.length > 100000) response.destroy();
        });
        response.on('end', () => {
            safeCallback(null, { html });
        });
        response.on('close', () => {
            if (html.length > 0) safeCallback(null, { html });
        });
    });

    request.on('error', (error) => safeCallback(error));
    request.on('timeout', () => {
        request.destroy();
        safeCallback(new Error('Request timeout'));
    });
    request.end();
}

function fetchURLMetadata(targetUrl, callback, _redirectCount) {
    const redirectCount = _redirectCount || 0;
    if (redirectCount > 5) {
        callback(new Error('Too many redirects'));
        return;
    }

    try {
        let callbackCalled = false;
        const safeCallback = (err, data) => {
            if (callbackCalled) return;
            callbackCalled = true;
            clearTimeout(hardTimeout);
            callback(err, data);
        };

        // 硬超时：确保无论如何都会在8秒内返回
        const hardTimeout = setTimeout(() => {
            safeCallback(new Error('Request timeout (hard limit)'));
        }, 8000);

        const proxyConfig = getProxyConfig();

        const handleResult = (err, result) => {
            if (err) {
                // 如果代理失败，尝试直接连接
                if (proxyConfig && !err._directFailed) {
                    console.log('[URL元数据] 代理失败，尝试直接连接:', err.message);
                    fetchDirect(targetUrl, (err2, result2) => {
                        if (err2) {
                            err2._directFailed = true;
                            safeCallback(err2);
                        } else {
                            handleResult(null, result2);
                        }
                    });
                    return;
                }
                safeCallback(err);
                return;
            }
            if (result.redirect) {
                // 跟随重定向
                clearTimeout(hardTimeout);
                callbackCalled = true;
                fetchURLMetadata(result.redirect, callback, redirectCount + 1);
                return;
            }
            if (result.html) {
                const metadata = parseHTMLMetadata(result.html, targetUrl);
                safeCallback(null, metadata);
            } else {
                safeCallback(new Error('No HTML content'));
            }
        };

        // 优先通过代理请求
        if (proxyConfig) {
            fetchViaProxy(targetUrl, proxyConfig, handleResult);
        } else {
            fetchDirect(targetUrl, handleResult);
        }
    } catch (error) {
        callback(error);
    }
}

// 解析HTML元数据
function parseHTMLMetadata(html, url) {
    const metadata = {
        url: url,
        title: '',
        description: '',
        favicon: ''
    };

    // 提取title - 查找所有非空的title标签
    const titleMatches = html.matchAll(/<title[^>]*>([^<]*)<\/title>/gi);
    for (const match of titleMatches) {
        const titleContent = match[1].trim();
        if (titleContent && titleContent.length > 0) {
            metadata.title = titleContent;
            break; // 使用第一个非空的title
        }
    }

    // 提取meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    if (descMatch) {
        metadata.description = descMatch[1].trim();
    }

    // 提取 Open Graph title (优先级更高)
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (ogTitleMatch) {
        metadata.title = ogTitleMatch[1].trim();
    }

    // 提取 Open Graph description
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
    if (ogDescMatch) {
        metadata.description = ogDescMatch[1].trim();
    }

    // 提取 Twitter Card title
    const twitterTitleMatch = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i) ||
                              html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:title["']/i);
    if (twitterTitleMatch && (!metadata.title || metadata.title.length < twitterTitleMatch[1].trim().length)) {
        metadata.title = twitterTitleMatch[1].trim();
    }

    // 提取 Twitter Card description
    const twitterDescMatch = html.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i) ||
                             html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:description["']/i);
    if (twitterDescMatch && !metadata.description) {
        metadata.description = twitterDescMatch[1].trim();
    }

    // 尝试从URL中提取更有意义的标题（用于SPA网站）
    let urlBasedTitle = '';
    try {
        const parsedUrl = new URL(url);
        
        // 检查URL查询参数中的id或其他标识符
        const searchParams = parsedUrl.searchParams;
        const idParam = searchParams.get('id') || searchParams.get('name') || searchParams.get('title') || searchParams.get('slug');
        
        if (idParam) {
            // 将id转换为更可读的格式 (例如: qwen3-vl -> Qwen3 VL)
            urlBasedTitle = idParam
                .replace(/[-_]/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());
        } else if (parsedUrl.pathname && parsedUrl.pathname !== '/') {
            // 从路径中提取
            const pathParts = parsedUrl.pathname.split('/').filter(p => p);
            if (pathParts.length > 0) {
                const lastPart = pathParts[pathParts.length - 1];
                urlBasedTitle = lastPart
                    .replace(/[-_]/g, ' ')
                    .replace(/\.\w+$/, '') // 移除文件扩展名
                    .replace(/\b\w/g, c => c.toUpperCase());
            }
        }
    } catch (e) {
        // 忽略URL解析错误
    }

    // 如果当前标题太短（可能只是网站名称），尝试使用URL提取的标题
    if (urlBasedTitle && (!metadata.title || metadata.title.length <= 20)) {
        // 将网站名称和页面标题组合
        if (metadata.title && metadata.title.length > 0) {
            metadata.title = urlBasedTitle + ' - ' + metadata.title;
        } else {
            metadata.title = urlBasedTitle;
        }
    }

    // 如果仍然没有标题，使用域名
    if (!metadata.title) {
        try {
            const parsedUrl = new URL(url);
            metadata.title = parsedUrl.hostname;
        } catch (e) {
            metadata.title = url;
        }
    }

    // 解码HTML实体
    metadata.title = decodeHTMLEntities(metadata.title);
    metadata.description = decodeHTMLEntities(metadata.description);

    return metadata;
}

// 解码常见的HTML实体
function decodeHTMLEntities(text) {
    if (!text) return text;
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#x27;/g, "'")
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
}

server.listen(PORT, HOST, () => {
    const localIP = getLocalIP();
    console.log(`
╔════════════════════════════════════════════════════════════╗
║         🎨 代码脑图编辑器 - 正在运行                      ║
╚════════════════════════════════════════════════════════════╝

📱 访问地址:
  • 本机访问: http://localhost:${PORT}
  • 局域网访问: http://${localIP}:${PORT}

💡 局域网访问说明:
  其他设备可以通过上面的"局域网访问"地址来访问
  请确保:
  1. 所有设备在同一个局域网（WiFi/路由器）下
  2. Mac 防火墙允许端口 ${PORT} 的入站连接
  3. 如果无法访问，请在"系统偏好设置 > 安全性与隐私 > 防火墙"中检查设置

✨ 功能特性:
  • 拖拽创建和移动节点
  • 连接节点形成脑图结构
  • 支持多种节点颜色
  • 自动保存到本地存储
  • 导出为PNG图片
  • 文件管理
  • 命名空间管理

⌨️  快捷键:
  • Cmd/Ctrl + S: 保存文件
  • Ctrl + Click: 快速添加节点
  • Delete: 删除选中节点
  • Shift + Click/拖拽: 创建连接

按 Ctrl+C 停止服务器
    `);
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n\n服务器已关闭');
    server.close();
    process.exit(0);
});

