// HTML转义函数 - 防止特殊字符被解析为HTML标签
function escapeHTML(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 颜色反转函数
function invertColor(hex) {
    if (typeof hex !== 'string') return hex;

    // 仅支持 #rgb / #rrggbb 格式；其它格式（rgb()、命名色等）原样返回
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return hex;

    let raw = hex.slice(1);
    if (raw.length === 3) {
        raw = raw.split('').map(char => char + char).join('');
    }

    const r = 255 - parseInt(raw.substr(0, 2), 16);
    const g = 255 - parseInt(raw.substr(2, 2), 16);
    const b = 255 - parseInt(raw.substr(4, 2), 16);

    const toHex = (num) => num.toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

// 将任意 hex 颜色解析为 { r, g, b }
function _parseHex(hex) {
    if (typeof hex !== 'string' || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
    let raw = hex.slice(1);
    if (raw.length === 3) raw = raw.split('').map(c => c + c).join('');
    return {
        r: parseInt(raw.substr(0, 2), 16),
        g: parseInt(raw.substr(2, 2), 16),
        b: parseInt(raw.substr(4, 2), 16)
    };
}

function _rgbToHex(r, g, b) {
    const to = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + to(r) + to(g) + to(b);
}

// 夜间模式专用：把原本为浅色/中等亮度的节点填充色，映射成深色调上好看的版本
// 思路：
//   - 极暗色（亮度 < 0.22）：用户显式选择了深色，保持原色
//   - 其它颜色：保留原色相，压低亮度至 ~18%，并向夜间底色 #1a1a2e 混入 65%
//     既保住用户能识别的颜色倾向，又不会在 #1a1a2e 画布上显得刺眼
function toNightFillColor(hex) {
    const rgb = _parseHex(hex);
    if (!rgb) return hex;
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    if (luminance < 0.22) return hex;
    // 与夜间底色混合
    const baseR = 0x1a, baseG = 0x1a, baseB = 0x2e;
    const mix = 0.65;
    // 压低原色亮度到 ~50% 后再混入底色，避免混出一团“泥”
    const dim = 0.5;
    const r = rgb.r * dim * (1 - mix) + baseR * mix;
    const g = rgb.g * dim * (1 - mix) + baseG * mix;
    const b = rgb.b * dim * (1 - mix) + baseB * mix;
    return _rgbToHex(r, g, b);
}

// 夜间模式专用：节点边框色
// 默认 #667eea 反转成土黄色太刺眼，改成柔和的亮靛蓝
const NIGHT_BORDER_DEFAULT = '#818cf8';
function toNightBorderColor(hex) {
    if (hex === '#667eea') return NIGHT_BORDER_DEFAULT;
    const rgb = _parseHex(hex);
    if (!rgb) return hex;
    // 对非默认边框，按亮度判断是否需要提亮到夜间可见
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    if (luminance > 0.4) return hex;
    // 偏暗的边框提亮 60%
    return _rgbToHex(rgb.r + (255 - rgb.r) * 0.6, rgb.g + (255 - rgb.g) * 0.6, rgb.b + (255 - rgb.b) * 0.6);
}

// URL检测函数
function isURL(text) {
    const trimmed = text.trim();

    // Only recognize URLs that start with http:// or https://
    return /^https?:\/\//i.test(trimmed);
}

// 标准化URL（仅用于已确认的URL）
function normalizeURL(text) {
    const trimmed = text.trim();
    // URL must already have http:// or https://
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    return null;
}

// 从文本中提取URL
function extractURLFromText(text) {
    // Only extract URLs that start with http:// or https://
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = text.match(urlRegex);
    if (matches && matches.length > 0) {
        return matches[0];
    }

    return null;
}

// 从导出的HTML或JSON中提取原始数据
function parseExportedHTML(text) {
    if (!text) return null;

    // 直接作为JSON尝试
    try {
        const asJson = JSON.parse(text);
        if (asJson && asJson.nodes && asJson.connections) return asJson;
    } catch (_) {}

    const tryMatch = (regex) => {
        const match = text.match(regex);
        if (match && match[1]) {
            try {
                const cleaned = match[1].trim().replace(/;$/, '');
                const parsed = JSON.parse(cleaned);
                if (parsed && parsed.nodes && parsed.connections) return parsed;
            } catch (_) {}
        }
        return null;
    };

    // 新增：检查可编辑HTML中的 <script id="export-data">
    const editableMatch = text.match(/<script id="export-data" type="application\/json">([\s\S]*?)<\/script>/);
    if (editableMatch && editableMatch[1]) {
        try {
            const parsed = JSON.parse(editableMatch[1]);
            if (parsed && parsed.nodes && parsed.connections) {
                return parsed;
            }
        } catch (_) {}
    }

    // 优先 rawData，其次 data
    return (
        tryMatch(/const\s+rawData\s*=\s*(\{[\s\S]*?\});/) ||
        tryMatch(/const\s+data\s*=\s*(\{[\s\S]*?\});/)
    );
}

function getUniqueFileName(baseName, existingNamesSet) {
    const clean = (baseName && baseName.trim()) || 'mindmap';
    let suffix = 1;
    let candidate = clean;
    while (existingNamesSet.has(candidate)) {
        candidate = `${clean}_${suffix++}`;
    }
    return candidate;
}

function showImportConflictDialog(baseName, existingNamesSet) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.35)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '999999';

        const box = document.createElement('div');
        box.style.background = '#fff';
        box.style.borderRadius = '12px';
        box.style.padding = '20px';
        box.style.width = '320px';
        box.style.boxShadow = '0 20px 50px rgba(0,0,0,0.25)';
        box.style.display = 'flex';
        box.style.flexDirection = 'column';
        box.style.gap = '12px';

        const title = document.createElement('div');
        title.textContent = '文件已存在';
        title.style.fontWeight = '700';
        title.style.fontSize = '16px';

        const desc = document.createElement('div');
        desc.textContent = `已存在名为 "${baseName}" 的脑图，选择如何处理：`;
        desc.style.fontSize = '13px';
        desc.style.color = '#555';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = getUniqueFileName(baseName, existingNamesSet);
        input.style.padding = '10px';
        input.style.border = '1px solid #ddd';
        input.style.borderRadius = '8px';
        input.style.fontSize = '14px';
        input.style.width = '100%';

        setTimeout(() => {
            input.focus();
            input.select();
        }, 0);

        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.gap = '8px';
        btnRow.style.justifyContent = 'flex-end';

        const newBtn = document.createElement('button');
        newBtn.textContent = '新建(默认)';
        newBtn.style.flex = '1';
        newBtn.style.padding = '10px';
        newBtn.style.border = '1px solid #ddd';
        newBtn.style.background = '#111827';
        newBtn.style.color = '#fff';
        newBtn.style.borderRadius = '8px';
        newBtn.style.cursor = 'pointer';
        newBtn.style.fontWeight = '700';

        const overwriteBtn = document.createElement('button');
        overwriteBtn.textContent = '覆盖(overwrite)';
        overwriteBtn.style.flex = '1';
        overwriteBtn.style.padding = '10px';
        overwriteBtn.style.border = '1px solid #ddd';
        overwriteBtn.style.background = '#fff';
        overwriteBtn.style.color = '#111';
        overwriteBtn.style.borderRadius = '8px';
        overwriteBtn.style.cursor = 'pointer';

        const cleanup = () => {
            document.body.removeChild(overlay);
        };

        newBtn.onclick = () => {
            const name = (input.value && input.value.trim()) || getUniqueFileName(baseName, existingNamesSet);
            cleanup();
            resolve({ mode: 'new', name });
        };

        overwriteBtn.onclick = () => {
            cleanup();
            resolve({ mode: 'overwrite', name: baseName });
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                newBtn.onclick();
            }
        };

        overlay.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                newBtn.onclick();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                newBtn.onclick();
            }
        };

        btnRow.appendChild(newBtn);
        btnRow.appendChild(overwriteBtn);
        box.appendChild(title);
        box.appendChild(desc);
        box.appendChild(input);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    });
}

// 获取URL元数据
async function fetchURLMetadata(url) {
    try {
        const normalizedUrl = normalizeURL(url);
        if (!normalizedUrl) {
            console.log('[URL元数据] 非有效URL，跳过:', url);
            return null;
        }
        console.log('[URL元数据] 开始请求:', normalizedUrl);

        // 添加超时控制，防止服务端请求挂起
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch('/api/fetch-url-metadata', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: normalizedUrl }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        console.log('[URL元数据] 响应状态:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[URL元数据] 请求失败:', response.status, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const metadata = await response.json();
        console.log('[URL元数据] 获取成功:', metadata);
        return metadata;
    } catch (error) {
        console.error('[URL元数据] 获取失败:', error.name === 'AbortError' ? '请求超时' : error);
        return null;
    }
}

class NamespaceManager {
    constructor() {
        this.storageKey = 'mindmap_current_namespace';
        this.namespacesKey = 'mindmap_namespaces';
        this._encryptedCurrentNamespace = null;
        this._encryptedNamespacesValue = null;
        this.currentNamespace = this.loadCurrentNamespace();
        this.currentPassword = null; // 用于存储当前加密空间密码
        this.passwordCache = {}; // 仅保存在当前会话中
        this.passwordModalNextAction = null;
        this.initializeNamespaces();
        this.setupUI();
    }
    readRawStorage(key) {
        if (window.storageAdapter && window.storageAdapter._originalGetItem) {
            return window.storageAdapter._originalGetItem(key);
        }
        return localStorage.getItem(key);
    }
    writeRawStorage(key, value) {
        if (window.storageAdapter && window.storageAdapter._originalSetItem) {
            window.storageAdapter._originalSetItem(key, value);
            return;
        }
        localStorage.setItem(key, value);
    }
    getNamespaceData(namespace) {
        const namespaces = this.getAllNamespaces(true);
        return namespaces.find(ns => ns.name === namespace) || null;
    }
    getPasswordForNamespace(namespace) {
        return this.passwordCache[namespace] || null;
    }
    setPasswordForNamespace(namespace, password) {
        if (!namespace) return;
        if (password) {
            this.passwordCache[namespace] = password;
        } else {
            delete this.passwordCache[namespace];
        }
        if (namespace === this.currentNamespace) {
            this.currentPassword = password || null;
        }
    }
    getAllNamespaces(includeMetadata = false) {
        const saved = this.readRawStorage(this.namespacesKey);
        if (!saved) return includeMetadata ? [{ name: 'default', isEncrypted: false }] : ['default'];

        try {
            const namespaces = JSON.parse(saved);
            if (Array.isArray(namespaces)) {
                // 迁移旧格式
                const newNamespaces = namespaces.map(ns => {
                    if (typeof ns === 'string') {
                        return { name: ns, isEncrypted: false };
                    }
                    return ns;
                });

                if (includeMetadata) return newNamespaces;
                return newNamespaces.map(ns => ns.name);
            }
        } catch (e) {
            console.error('解析命名空间失败:', e);
            if (typeof saved === 'string' && saved.indexOf('U2FsdGVkX1') === 0) {
                this._encryptedNamespacesValue = saved;
            }
        }
        return includeMetadata ? [{ name: 'default', isEncrypted: false }] : ['default'];
    }
    initializeNamespaces() {
        const namespaces = this.getAllNamespaces(true);
        if (!namespaces.find(ns => ns.name === 'default')) {
            this.addNamespace('default');
        }
    }
    
    loadCurrentNamespace() {
        // 优先从URL hash获取命名空间（支持多标签页独立访问）
        const hashNs = MindMapApp.getNamespaceFromURLHash();
        if (hashNs) {
            console.log('[命名空间] 从URL加载命名空间:', hashNs);
            return hashNs;
        }
        const stored = this.readRawStorage(this.storageKey);
        if (stored && typeof stored === 'string' && stored.indexOf('U2FsdGVkX1') === 0) {
            this._encryptedCurrentNamespace = stored;
            return 'default';
        }
        return stored || 'default';
    }

    saveCurrentNamespace(namespace) {
        localStorage.setItem(this.storageKey, namespace);
        this.currentNamespace = namespace;
    }

    
    addNamespace(namespace, isEncrypted = false, password = null) {
        const namespaces = this.getAllNamespaces(true);
        if (!namespaces.find(ns => ns.name === namespace)) {
            const newNamespace = {
                name: namespace,
                isEncrypted: isEncrypted,
                salt: isEncrypted ? CryptoJS.lib.WordArray.random(128 / 8).toString() : undefined
            };

            namespaces.push(newNamespace);
            localStorage.setItem(this.namespacesKey, JSON.stringify(namespaces));

            if (isEncrypted && password) {
                // 将密码安全地存储在当前会话中
                this.setPasswordForNamespace(namespace, password);
            }
        }
    }

    async deleteNamespace(namespace) {
        if (namespace === 'default') {
            alert('不能删除默认空间');
            return false;
        }

        // 1. 收集所有要删除的键（包括 localStorage 和 serverCache）
        var keysToDelete = [];
        var seenKeys = {};
        var namespacePrefix = `mindmap_${namespace}_`;
        
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.startsWith(namespacePrefix) && !seenKeys[key]) {
                seenKeys[key] = true;
                keysToDelete.push(key);
            }
        }
        // 也检查 serverCache 中的键
        if (window.storageAdapter && window.storageAdapter.serverCache) {
            var serverKeys = Object.keys(window.storageAdapter.serverCache);
            for (var j = 0; j < serverKeys.length; j++) {
                var key = serverKeys[j];
                if (key.startsWith(namespacePrefix) && !seenKeys[key]) {
                    seenKeys[key] = true;
                    keysToDelete.push(key);
                }
            }
        }
        
        console.log('[命名空间] 删除文件:', keysToDelete);
        
        // 2. 删除所有文件
        for (var k = 0; k < keysToDelete.length; k++) {
            try {
                await localStorage.removeItem(keysToDelete[k]);
            } catch (error) {
                console.error('[命名空间] 删除失败:', keysToDelete[k], error);
            }
        }

        // 3. 更新命名空间列表
        const namespaces = this.getAllNamespaces(true).filter(ns => ns.name !== namespace);
        localStorage.setItem(this.namespacesKey, JSON.stringify(namespaces));

        // 4. 切换到默认空间
        if (this.currentNamespace === namespace) {
            this.switchNamespace('default');
        }

        return true;
    }

    setupUI() {
        this.updateNamespaceSelect();

        document.getElementById('namespaceSelect').addEventListener('change', (e) => {
            const selectedNamespace = e.target.value;
            this.switchNamespace(selectedNamespace);
        });

        const passwordSwitchBtn = document.getElementById('passwordNamespaceSwitchBtn');
        if (passwordSwitchBtn) {
            passwordSwitchBtn.addEventListener('click', () => {
                this.switchNamespaceFromModal();
            });
        }
        const passwordInput = document.getElementById('passwordInput');
        if (passwordInput) {
            passwordInput.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                const modal = document.getElementById('passwordModal');
                if (modal && modal.classList.contains('active')) {
                    e.preventDefault();
                    this.confirmPassword();
                }
            });
        }

        document.getElementById('newNamespaceBtn').addEventListener('click', () => {
            this.createNewNamespace();
        });

        document.getElementById('deleteNamespaceBtn').addEventListener('click', () => {
            this.deleteCurrentNamespace();
        });

        document.getElementById('encryptNamespaceBtn').addEventListener('click', () => {
            this.encryptCurrentNamespace();
        });

        const decryptBtn = document.getElementById('decryptNamespaceBtn');
        if (decryptBtn) {
            decryptBtn.addEventListener('click', () => {
                this.removeEncryptionFromCurrentNamespace();
            });
        }

        document.getElementById('lockNamespaceBtn').addEventListener('click', () => {
            this.toggleNamespaceLock();
        });

        // 命名空间管理按钮折叠/展开功能
        document.getElementById('toggleNamespaceManage').addEventListener('click', () => {
            const manageButtons = document.getElementById('namespaceManageButtons');
            const icon = document.getElementById('toggleNamespaceIcon');

            if (manageButtons.style.display === 'none') {
                manageButtons.style.display = 'flex';
                icon.textContent = '▲';
            } else {
                manageButtons.style.display = 'none';
                icon.textContent = '▼';
            }
        });

        // 添加节点选单折叠/展开功能
        document.getElementById('addNodeSectionTitle').addEventListener('click', () => {
            const content = document.getElementById('addNodeContent');
            const icon = document.getElementById('addNodeToggleIcon');

            if (content.style.display === 'none') {
                content.style.display = 'block';
                icon.textContent = '▼';
            } else {
                content.style.display = 'none';
                icon.textContent = '▶';
            }
        });

        // 节点预设管理折叠功能
        document.getElementById('toggleNodePresetManage').addEventListener('click', () => {
            const buttons = document.getElementById('nodePresetManageButtons');
            const icon = document.getElementById('nodePresetManageIcon');
            if (buttons.style.display === 'none') {
                buttons.style.display = 'flex';
                icon.textContent = '▲';
            } else {
                buttons.style.display = 'none';
                icon.textContent = '▼';
            }
        });

        // 线条预设管理折叠功能
        document.getElementById('toggleConnectionPresetManage').addEventListener('click', () => {
            const buttons = document.getElementById('connectionPresetManageButtons');
            const icon = document.getElementById('connectionPresetManageIcon');
            if (buttons.style.display === 'none') {
                buttons.style.display = 'flex';
                icon.textContent = '▲';
            } else {
                buttons.style.display = 'none';
                icon.textContent = '▼';
            }
        });

        // 初始化预设系统
        AppState.initPresets();

        // 监听服务器数据更新
        window.addEventListener('serverStorageUpdate', (e) => {
            const { key, value } = e.detail;

            // 如果是命名空间列表更新
            if (key === this.namespacesKey) {
                console.log('[命名空间] 检测到服务器更新，刷新列表');
                this.updateNamespaceSelect();
            }

            // 如果是当前命名空间更新（但不是本机修改的）
            if (key === this.storageKey && value !== this.currentNamespace) {
                console.log('[命名空间] 检测到其他设备切换命名空间:', value);
                this.currentNamespace = value;
                this.updateNamespaceSelect();
            }
        });

        this.ensureAccessForCurrentNamespace();
        this.recoverEncryptedNamespaceMetadata();
    }

    async deleteCurrentNamespace() {
        const current = this.getCurrentNamespace();
        if (current === 'default') {
            alert('不能删除默认空间');
            return;
        }

        if (confirm(`确定要删除命名空间 "${current}" 及其所有文件吗？`)) {
            const success = await this.deleteNamespace(current);
            if (success) {
                this.updateNamespaceSelect();
            }
        }
    }

    updateNamespaceSelect() {
        const select = document.getElementById('namespaceSelect');
        select.innerHTML = '';

        const namespaces = this.getAllNamespaces(true);
        namespaces.forEach(ns => {
            const option = document.createElement('option');
            option.value = ns.name;
            let displayName = ns.name === 'default' ? '默认空间' : ns.name;
            if (ns.isEncrypted) {
                displayName += ' 🔒';
            }
            option.textContent = displayName;
            if (ns.name === this.currentNamespace) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        this.updateLockButton();
        this.updatePasswordNamespaceOptions();
    }

    updatePasswordNamespaceOptions() {
        const select = document.getElementById('passwordNamespaceSelect');
        if (!select) return;
        const namespaces = this.getAllNamespaces(true);
        const current = this.getCurrentNamespace();
        select.innerHTML = '';
        namespaces.forEach((ns) => {
            const option = document.createElement('option');
            option.value = ns.name;
            let displayName = ns.name === 'default' ? '默认空间' : ns.name;
            if (ns.isEncrypted) {
                displayName += ' 🔒';
            }
            option.textContent = displayName;
            if (ns.name === current) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    switchNamespaceFromModal() {
        const select = document.getElementById('passwordNamespaceSelect');
        if (!select) return;
        const target = select.value;
        this.closePasswordModal(false);
        this.switchNamespace(target);
    }

    createNewNamespace() {
        const name = prompt('请输入新命名空间的名称:');
        if (!name) return;

        const trimmedName = name.trim();
        if (!trimmedName) {
            alert('命名空间名称不能为空');
            return;
        }

        if (trimmedName === 'default') {
            alert('不能使用保留名称 "default"');
            return;
        }

        if (this.getAllNamespaces().includes(trimmedName)) {
            alert('该命名空间已存在');
            return;
        }

        const encrypt = confirm('是否为新的空间设置密码？');
        let password = null;
        if (encrypt) {
            password = prompt('请输入密码:');
            if (!password) {
                alert('密码不能为空');
                return;
            }
        }

        this.addNamespace(trimmedName, encrypt, password);
        this.updateNamespaceSelect();
        this.switchNamespace(trimmedName);
    }

    switchNamespace(namespace) {
        const namespaceData = this.getNamespaceData(namespace);
        if (namespaceData && namespaceData.isEncrypted) {
            const cachedPassword = this.getPasswordForNamespace(namespace);
            if (!cachedPassword) {
                this.updateEncryptedOverlay(true);
                this.showPasswordModal(namespace);
                return;
            }
            this.currentPassword = cachedPassword;
            // 解密历史数据为明文，避免旧加密内容显示乱码
            this.normalizeNamespaceData(namespace, cachedPassword, namespaceData.salt);
            this.updateEncryptedOverlay(false);
        } else {
            this.currentPassword = null;
            this.updateEncryptedOverlay(false);
        }

        this.saveCurrentNamespace(namespace);
        this.updateNamespaceSelect();

        // 重新加载两个屏幕的内容
        if (AppState.appLeft) {
            AppState.appLeft.onNamespaceChanged();
        }
        if (AppState.appRight) {
            AppState.appRight.onNamespaceChanged();
        }
        if (shortcutManager) {
            shortcutManager.reloadForNamespace();
            const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
            if (activeApp) {
                shortcutManager.setActiveFile(activeApp.currentFileName);
            }
        }
    }

    isCipherText(val) {
        return typeof val === 'string' && val.indexOf('U2FsdGVkX1') === 0;
    }

    normalizeNamespaceData(namespace, password, salt) {
        if (!namespace || !password) return;
        const prefix = `mindmap_${namespace}_`;
        const decryptValue = (value) => {
            if (!this.isCipherText(value)) return value;
            try {
                const bytes = CryptoJS.AES.decrypt(value, password, { salt });
                const text = bytes.toString(CryptoJS.enc.Utf8);
                return text || value;
            } catch (e) {
                console.warn('[命名空间] 解密失败，保持原值', e);
                return value;
            }
        };

        // 处理 localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                const val = localStorage.getItem(key);
                const plain = decryptValue(val);
                if (plain !== val) {
                    localStorage.setItem(key, plain);
                }
            }
        }

        // 处理 serverCache（若存在）
        if (window.storageAdapter && window.storageAdapter.serverCache) {
            const cacheKeys = Object.keys(window.storageAdapter.serverCache);
            cacheKeys.forEach((key) => {
                if (key.startsWith(prefix)) {
                    const val = window.storageAdapter.serverCache[key];
                    const plain = decryptValue(val);
                    if (plain !== val) {
                        window.storageAdapter.serverCache[key] = plain;
                    }
                }
            });
        }
    }

    updateEncryptedOverlay(show) {
        const overlay = document.getElementById('encryptedOverlay');
        if (!overlay) return;
        overlay.style.display = show ? 'block' : 'none';
        if (document.body) {
            document.body.classList.toggle('encrypted-locked', !!show);
        }
    }

    showPasswordModal(namespace, nextAction = null) {
        const modal = document.getElementById('passwordModal');
        const title = document.getElementById('passwordModalTitle');
        const desc = document.getElementById('passwordModalDesc');
        if (title) title.textContent = '请输入密码';
        if (desc) desc.textContent = '这个空间是加密的，请输入密码访问。';
        const input = document.getElementById('passwordInput');
        if (input) input.value = '';
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
        this.passwordModalNextAction = typeof nextAction === 'function' ? nextAction : null;
        this.updatePasswordNamespaceOptions();
        this.updateEncryptedOverlay(true);
        if (input) input.focus();
        this.passwordModalCallback = (password) => {
            if (!password) {
                alert('密码不能为空');
                return;
            }
            this.setPasswordForNamespace(namespace, password);
            this.switchNamespace(namespace);
        };
    }
    
    closePasswordModal(switchToDefault = false) {
        const modal = document.getElementById('passwordModal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
        document.getElementById('passwordInput').value = '';
        this.passwordModalNextAction = null;
        
        // 如果需要切换到默认空间（用户取消输入密码时）
        if (switchToDefault) {
            this.passwordModalCallback = null;
            const current = this.getCurrentNamespace();
            const namespaceData = this.getNamespaceData(current);
            // 只有当当前空间是加密的且没有密码时才切换
            if (namespaceData && namespaceData.isEncrypted && !this.getPasswordForNamespace(current)) {
                console.log('[命名空间] 用户取消密码输入，切换到默认空间');
                this.saveCurrentNamespace('default');
                this.currentPassword = null;
                this.updateNamespaceSelect();
                // 重新加载两个屏幕的内容
                if (AppState.appLeft) {
                    AppState.appLeft.onNamespaceChanged();
                }
                if (AppState.appRight) {
                    AppState.appRight.onNamespaceChanged();
                }
                if (shortcutManager) {
                    shortcutManager.reloadForNamespace();
                }
                this.updateEncryptedOverlay(false);
            }
        }
    }

    confirmPassword() {
        const input = document.getElementById('passwordInput');
        const password = input ? input.value : '';
        if (!password) {
            alert('密码不能为空');
            if (input) input.focus();
            return;
        }
        const nextAction = this.passwordModalNextAction;
        // 确认密码时不切换到默认空间
        this.closePasswordModal(false);
        if (this.passwordModalCallback) {
            this.passwordModalCallback(password);
            this.passwordModalCallback = null;
        }
        if (typeof nextAction === 'function') {
            this.passwordModalNextAction = null;
            nextAction();
        }
        this.updateEncryptedOverlay(false);
    }
    encryptCurrentNamespace() {
        const currentNamespace = this.getCurrentNamespace();
        if (currentNamespace === 'default') {
            alert('不能加密默认空间');
            return;
        }

        const namespaces = this.getAllNamespaces(true);
        const namespaceData = namespaces.find(ns => ns.name === currentNamespace);

        if (namespaceData.isEncrypted) {
            alert('这个空间已经是加密的');
            return;
        }

        const password = prompt('请输入密码来加密这个空间:');
        if (!password) {
            alert('密码不能为空');
            return;
        }

        // 更新命名空间信息
        namespaceData.isEncrypted = true;
        namespaceData.salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
        localStorage.setItem(this.namespacesKey, JSON.stringify(namespaces));

        // 更新当前会话的密码
        this.setPasswordForNamespace(currentNamespace, password);

        // 重新加密所有数据
        this.reEncryptData(currentNamespace, password, namespaceData.salt);

        this.updateNamespaceSelect();
    }

    ensureAccessForCurrentNamespace() {
        const current = this.getCurrentNamespace();
        const namespaceData = this.getNamespaceData(current);
        if (namespaceData && namespaceData.isEncrypted && !this.getPasswordForNamespace(current)) {
            this.updateEncryptedOverlay(true);
            this.showPasswordModal(current);
        }
    }

    recoverEncryptedNamespaceMetadata() {
        if (!this._encryptedCurrentNamespace && !this._encryptedNamespacesValue) return;

        const modal = document.getElementById('passwordModal');
        const title = document.getElementById('passwordModalTitle');
        const desc = document.getElementById('passwordModalDesc');
        const input = document.getElementById('passwordInput');
        if (title) title.textContent = '解锁命名空间信息';
        if (desc) desc.textContent = '检测到命名空间信息被加密，请输入密码以恢复。';
        if (input) input.value = '';
        modal.style.display = 'flex';
        this.updatePasswordNamespaceOptions();
        this.updateEncryptedOverlay(true);
        if (input) input.focus();

        this.passwordModalCallback = (password) => {
            if (!password) {
                alert('密码不能为空');
                return;
            }

            let recoveredNamespace = null;
            if (this._encryptedCurrentNamespace) {
                try {
                    const bytes = CryptoJS.AES.decrypt(this._encryptedCurrentNamespace, password);
                    const nsText = bytes.toString(CryptoJS.enc.Utf8);
                    if (nsText) {
                        recoveredNamespace = nsText;
                        this.writeRawStorage(this.storageKey, nsText);
                        this._encryptedCurrentNamespace = null;
                    }
                } catch (e) {}
            }

            if (this._encryptedNamespacesValue) {
                try {
                    const bytes = CryptoJS.AES.decrypt(this._encryptedNamespacesValue, password);
                    const nsJson = bytes.toString(CryptoJS.enc.Utf8);
                    if (nsJson) {
                        this.writeRawStorage(this.namespacesKey, nsJson);
                        this._encryptedNamespacesValue = null;
                    }
                } catch (e) {}
            }

            this.currentNamespace = recoveredNamespace || this.loadCurrentNamespace();
            const namespaceData = this.getNamespaceData(this.currentNamespace);
            if (namespaceData && namespaceData.isEncrypted) {
                this.setPasswordForNamespace(this.currentNamespace, password);
            }
            this.updateNamespaceSelect();
            this.updateEncryptedOverlay(false);
            this.ensureAccessForCurrentNamespace();
        };
    }

    updateLockButton() {
        const lockBtn = document.getElementById('lockNamespaceBtn');
        const decryptBtn = document.getElementById('decryptNamespaceBtn');
        if (!lockBtn) return;
        const current = this.getCurrentNamespace();
        const namespaceData = this.getNamespaceData(current);
        if (!namespaceData || !namespaceData.isEncrypted) {
            lockBtn.style.display = 'none';
            if (decryptBtn) {
                decryptBtn.style.display = 'none';
            }
            return;
        }

        const isUnlocked = !!this.getPasswordForNamespace(current);
        lockBtn.style.display = 'block';
        lockBtn.textContent = isUnlocked ? '锁定空间' : '解锁空间';
        lockBtn.style.background = isUnlocked ? '#6c757d' : '#5bc0de';
        if (decryptBtn) {
            decryptBtn.style.display = 'block';
        }
    }

    toggleNamespaceLock() {
        const current = this.getCurrentNamespace();
        const namespaceData = this.getNamespaceData(current);
        if (!namespaceData || !namespaceData.isEncrypted) {
            return;
        }

        const isUnlocked = !!this.getPasswordForNamespace(current);
        if (isUnlocked) {
            this.setPasswordForNamespace(current, null);
            this.updateLockButton();
            this.showPasswordModal(current);
        } else {
            this.showPasswordModal(current);
        }
    }

    removeEncryptionFromCurrentNamespace(forceConfirm = false) {
        const current = this.getCurrentNamespace();
        const namespaceData = this.getNamespaceData(current);
        if (!namespaceData || !namespaceData.isEncrypted) {
            return;
        }

        if (!forceConfirm) {
            this.showPasswordModal(current, () => this.removeEncryptionFromCurrentNamespace(true));
            return;
        }

        const password = this.getPasswordForNamespace(current);
        if (!password) {
            alert('密码不能为空');
            return;
        }

        this.normalizeNamespaceData(current, password, namespaceData.salt);
        namespaceData.isEncrypted = false;
        delete namespaceData.salt;
        const namespaces = this.getAllNamespaces(true).map((ns) => {
            if (ns.name !== current) return ns;
            const updated = { ...ns, isEncrypted: false };
            delete updated.salt;
            return updated;
        });
        localStorage.setItem(this.namespacesKey, JSON.stringify(namespaces));
        this.setPasswordForNamespace(current, null);
        this.updateNamespaceSelect();
        this.updateEncryptedOverlay(false);
        alert('已解除加密');
    }

    reEncryptData(namespace, password, salt) {
        // 关闭实际加密，仅保留“锁定”语义，避免性能开销
        return;
    }
    getCurrentNamespace() {
        return this.currentNamespace;
    }
}

// 全局应用状态管理器
const AppState = {
    activeScreen: 'left',      // 当前活跃屏幕
    mode: 'dual',              // 当前显示模式：'dual', 'fullscreen-left', 'fullscreen-right'
    appLeft: null,
    appRight: null,
    namespaceManager: null,
    isInitializing: true,      // 应用是否正在初始化

    setActiveScreen(screenId) {
        this.activeScreen = screenId;
        this.syncSidebar();

        // 更新文件列表以反映活跃屏幕的状态
        const activeApp = screenId === 'left' ? this.appLeft : this.appRight;
        if (activeApp) {
            const searchInput = document.getElementById('fileSearchInput');
            const searchTerm = searchInput ? searchInput.value : '';
            activeApp.updateSidebarFileList(searchTerm);
            if (shortcutManager) {
                shortcutManager.setActiveFile(activeApp.currentFileName);
            }
        }
    },

    syncSidebar() {
        const activeApp = this.activeScreen === 'left' ? this.appLeft : this.appRight;
        if (!activeApp) return;

        if (activeApp.selectedConnections.length > 0) {
            activeApp.updateSidebar('connection');
            // No need to populate fields here, selectConnection already does this.
        } else if (activeApp.selectedNode) {
            activeApp.updateSidebar('node');
            // 获取文本内容或链接URL
            const textContent = activeApp.selectedNode.content.filter(item => item.type === 'text').map(item => item.value).join('\n');
            const linkContent = activeApp.selectedNode.content.find(item => item.type === 'link');

            if (linkContent) {
                // 如果是链接类型，显示URL
                document.getElementById('editText').value = linkContent.url;
            } else {
                document.getElementById('editText').value = textContent;
            }
            document.getElementById('editText').disabled = false;
            document.getElementById('editFontSize').value = activeApp.selectedNode.fontSize || 13;
            document.getElementById('editFontSize').disabled = false;
            document.getElementById('editTextAlign').value = activeApp.selectedNode.textAlign || 'center';
            document.getElementById('editTextAlign').disabled = false;
            document.getElementById('nodeLocked').checked = activeApp.selectedNode.locked || false;
            document.getElementById('nodeLocked').disabled = false;
            const editCodeMode = document.getElementById('editCodeMode');
            if (editCodeMode) {
                editCodeMode.checked = !!activeApp.selectedNode.codeMode;
                editCodeMode.disabled = false;
            }
            const editCodeLanguage = document.getElementById('editCodeLanguage');
            if (editCodeLanguage) {
                editCodeLanguage.value = activeApp.selectedNode.codeLanguage || 'auto';
                editCodeLanguage.disabled = false;
            }
            const editNodeWidth = document.getElementById('editNodeWidth');
            if (editNodeWidth) {
                editNodeWidth.value = Math.round(activeApp.selectedNode.width || 100);
                editNodeWidth.disabled = false;
            }
            const editNodeHeight = document.getElementById('editNodeHeight');
            if (editNodeHeight) {
                editNodeHeight.value = Math.round(activeApp.selectedNode.height || 40);
                editNodeHeight.disabled = false;
            }
        } else {
            activeApp.updateSidebar('default');
            document.getElementById('editText').value = '';
            document.getElementById('editText').disabled = true;
            document.getElementById('editFontSize').value = '';
            document.getElementById('editFontSize').disabled = true;
            const editFontSizeDec = document.getElementById('editFontSizeDec');
            const editFontSizeInc = document.getElementById('editFontSizeInc');
            if (editFontSizeDec) editFontSizeDec.disabled = true;
            if (editFontSizeInc) editFontSizeInc.disabled = true;
            document.getElementById('editTextAlign').value = 'center';
            document.getElementById('editTextAlign').disabled = true;
            document.getElementById('nodeLocked').checked = false;
            document.getElementById('nodeLocked').disabled = true;
            const editCodeMode = document.getElementById('editCodeMode');
            if (editCodeMode) {
                editCodeMode.checked = false;
                editCodeMode.disabled = true;
            }
            const editCodeLanguage = document.getElementById('editCodeLanguage');
            if (editCodeLanguage) {
                editCodeLanguage.value = 'auto';
                editCodeLanguage.disabled = true;
            }
            const editNodeWidth = document.getElementById('editNodeWidth');
            if (editNodeWidth) {
                editNodeWidth.value = '';
                editNodeWidth.disabled = true;
            }
            const editNodeHeight = document.getElementById('editNodeHeight');
            if (editNodeHeight) {
                editNodeHeight.value = '';
                editNodeHeight.disabled = true;
            }
        }
    },

    // ============ 预设管理系统 ============

    initPresets() {
        // 加载节点预设列表
        AppState.loadNodePresets();
        // 加载线条预设列表
        AppState.loadConnectionPresets();

        // 节点预设事件监听
        document.getElementById('nodePresetSelect').addEventListener('change', (e) => {
            AppState.applyNodePreset(e.target.value);
        });

        document.getElementById('createNodePresetBtn').addEventListener('click', () => {
            AppState.createNodePreset();
        });

        document.getElementById('saveNodePresetBtn').addEventListener('click', () => {
            AppState.saveNodePreset();
        });

        document.getElementById('renameNodePresetBtn').addEventListener('click', () => {
            AppState.renameNodePreset();
        });

        document.getElementById('deleteNodePresetBtn').addEventListener('click', () => {
            AppState.deleteNodePreset();
        });

        // 线条预设事件监听
        document.getElementById('connectionPresetSelect').addEventListener('change', (e) => {
            AppState.applyConnectionPreset(e.target.value);
        });

        document.getElementById('createConnectionPresetBtn').addEventListener('click', () => {
            AppState.createConnectionPreset();
        });

        document.getElementById('saveConnectionPresetBtn').addEventListener('click', () => {
            AppState.saveConnectionPreset();
        });

        document.getElementById('renameConnectionPresetBtn').addEventListener('click', () => {
            AppState.renameConnectionPreset();
        });

        document.getElementById('deleteConnectionPresetBtn').addEventListener('click', () => {
            AppState.deleteConnectionPreset();
        });

        // 编辑区域的预设选择器事件监听
        document.getElementById('editNodePresetSelect').addEventListener('change', (e) => {
            if (e.target.value) {
                AppState.applyNodePresetToSelected(e.target.value);
            }
        });

        document.getElementById('editConnectionPresetSelect').addEventListener('change', (e) => {
            if (e.target.value) {
                AppState.applyConnectionPresetToSelected(e.target.value);
            }
        });

        // 加载编辑区域的预设列表
        AppState.loadEditNodePresets();
        AppState.loadEditConnectionPresets();

        // 导出/导入预设配置
        document.getElementById('exportPresetsBtn').addEventListener('click', () => {
            AppState.exportPresets();
        });

        document.getElementById('importPresetsBtn').addEventListener('click', () => {
            document.getElementById('importPresetsFile').click();
        });

        document.getElementById('importPresetsFile').addEventListener('change', (e) => {
            AppState.importPresets(e);
        });

        // 编辑区域的预设管理按钮
        document.getElementById('editCreateNodePresetBtn').addEventListener('click', () => {
            AppState.createNodePresetFromEdit();
        });

        document.getElementById('editSaveNodePresetBtn').addEventListener('click', () => {
            AppState.saveNodePresetFromEdit();
        });

        document.getElementById('editCreateConnectionPresetBtn').addEventListener('click', () => {
            AppState.createConnectionPresetFromEdit();
        });

        document.getElementById('editSaveConnectionPresetBtn').addEventListener('click', () => {
            AppState.saveConnectionPresetFromEdit();
        });
    },

    // ===== 节点预设管理 =====

    getNodePresets() {
        const presets = localStorage.getItem('nodePresets');
        if (!presets) {
            const defaultPresets = {
                'default': {
                    name: '默认预设',
                    color: '#e8f0fe',
                    textColor: '#1f2937',
                    fontSize: 13,
                    textAlign: 'center',
                    shape: 'rounded-rect',
                    width: 100,
                    height: 40,
                    locked: false
                }
            };
            localStorage.setItem('nodePresets', JSON.stringify(defaultPresets));
            return defaultPresets;
        }
        return JSON.parse(presets);
    },

    saveNodePresetsToStorage(presets) {
        localStorage.setItem('nodePresets', JSON.stringify(presets));
    },

    loadNodePresets() {
        const presets = this.getNodePresets();
        const select = document.getElementById('nodePresetSelect');
        select.innerHTML = '';

        Object.keys(presets).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = presets[key].name;
            select.appendChild(option);
        });
    },

    getCurrentNodeSettings() {
        const colorPicker = document.getElementById('nodeColorPicker');
        const selectedColor = colorPicker.querySelector('.color-option.selected');

        const textColorPicker = document.getElementById('textColorPicker');
        const selectedTextColor = textColorPicker.querySelector('.color-option.selected');
        const nodeLocked = document.getElementById('nodeLocked');

        return {
            color: selectedColor ? selectedColor.getAttribute('data-color') : '#e8f0fe',
            textColor: selectedTextColor ? selectedTextColor.getAttribute('data-color') : '#1f2937',
            fontSize: parseInt(document.getElementById('nodeFontSize').value) || 13,
            textAlign: document.getElementById('nodeTextAlign').value || 'center',
            shape: document.getElementById('nodeShape').value || 'rounded-rect',
            width: parseInt(document.getElementById('defaultNodeWidth').value) || 100,
            height: parseInt(document.getElementById('defaultNodeHeight').value) || 40,
            locked: nodeLocked ? nodeLocked.checked : false
        };
    },

    createNodePreset() {
        const name = prompt('请输入新预设名称:');
        if (!name || name.trim() === '') return;

        const presets = this.getNodePresets();
        const key = 'preset_' + Date.now();

        presets[key] = {
            name: name.trim(),
            ...this.getCurrentNodeSettings()
        };

        this.saveNodePresetsToStorage(presets);
        this.loadNodePresets();
        this.loadEditNodePresets();
        document.getElementById('nodePresetSelect').value = key;
        alert('节点预设创建成功！');
    },

    saveNodePreset() {
        const select = document.getElementById('nodePresetSelect');
        const key = select.value;

        if (!key) {
            alert('请先选择一个预设');
            return;
        }

        const presets = this.getNodePresets();

        // 保留预设名称，只更新设置
        const currentName = presets[key].name;
        presets[key] = {
            name: currentName,
            ...this.getCurrentNodeSettings()
        };

        this.saveNodePresetsToStorage(presets);
        this.loadNodePresets();
        this.loadEditNodePresets();
        document.getElementById('nodePresetSelect').value = key;
        alert('预设已保存！');
    },

    applyNodePreset(presetKey) {
        const presets = this.getNodePresets();
        const preset = presets[presetKey];
        if (!preset) return;

        // 应用颜色
        const colorPicker = document.getElementById('nodeColorPicker');
        colorPicker.querySelectorAll('.color-option').forEach(opt => {
            if (opt.getAttribute('data-color') === preset.color) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });

        // 应用文字颜色
        const textColorPicker = document.getElementById('textColorPicker');
        textColorPicker.querySelectorAll('.color-option').forEach(opt => {
            if (opt.getAttribute('data-color') === preset.textColor) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });

        // 应用其他设置
        document.getElementById('nodeFontSize').value = preset.fontSize;
        document.getElementById('nodeTextAlign').value = preset.textAlign;
        document.getElementById('nodeShape').value = preset.shape;
        document.getElementById('defaultNodeWidth').value = preset.width;
        document.getElementById('defaultNodeHeight').value = preset.height;
    },

    renameNodePreset() {
        const select = document.getElementById('nodePresetSelect');
        const key = select.value;

        if (!key) {
            alert('请先选择一个预设');
            return;
        }

        const presets = this.getNodePresets();
        const newName = prompt('请输入新名称:', presets[key].name);
        if (!newName || newName.trim() === '') return;

        presets[key].name = newName.trim();
        this.saveNodePresetsToStorage(presets);
        this.loadNodePresets();
        this.loadEditNodePresets(); // 同时更新编辑区域的预设列表
        select.value = key;
    },

    deleteNodePreset() {
        const select = document.getElementById('nodePresetSelect');
        const key = select.value;

        if (key === 'default') {
            alert('不能删除默认预设');
            return;
        }

        const presets = this.getNodePresets();
        if (!confirm(`确定要删除预设 "${presets[key].name}" 吗？`)) return;

        delete presets[key];
        this.saveNodePresetsToStorage(presets);
        this.loadNodePresets();
        this.loadEditNodePresets(); // 同时更新编辑区域的预设列表
        select.value = 'default';
        this.applyNodePreset('default');
    },

    // 加载编辑区域的节点预设列表
    loadEditNodePresets() {
        const presets = this.getNodePresets();
        const select = document.getElementById('editNodePresetSelect');
        select.innerHTML = '<option value="">-- 选择预设 --</option>';

        Object.keys(presets).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = presets[key].name;
            select.appendChild(option);
        });
    },

    // 应用预设到选中的节点
    applyNodePresetToSelected(presetKey) {
        const activeApp = this.activeScreen === 'left' ? this.appLeft : this.appRight;
        if (!activeApp || !activeApp.selectedNode) return;

        const presets = this.getNodePresets();
        const preset = presets[presetKey];
        if (!preset) return;

        const node = activeApp.selectedNode;

        // 应用预设到节点
        node.color = preset.color;
        node.textColor = preset.textColor;
        node.fontSize = preset.fontSize;
        node.textAlign = preset.textAlign;
        node.shape = preset.shape;
        node.width = preset.width;
        node.height = preset.height;
        node.locked = !!preset.locked;

        // 更新UI显示
        activeApp.selectNode(node);
        activeApp.saveToLocalStorage();
        activeApp.draw();
    },

    // ===== 线条预设管理 =====

    getConnectionPresets() {
        const presets = localStorage.getItem('connectionPresets');
        if (!presets) {
            const defaultPresets = {
                'default': {
                    name: '默认预设',
                    lineStyle: 'solid',
                    lineType: 'curve',
                    lineWidth: 2,
                    color: '#667eea',
                    independent: false
                }
            };
            localStorage.setItem('connectionPresets', JSON.stringify(defaultPresets));
            return defaultPresets;
        }
        return JSON.parse(presets);
    },

    saveConnectionPresetsToStorage(presets) {
        localStorage.setItem('connectionPresets', JSON.stringify(presets));
    },

    loadConnectionPresets() {
        const presets = this.getConnectionPresets();
        const select = document.getElementById('connectionPresetSelect');
        select.innerHTML = '';

        Object.keys(presets).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = presets[key].name;
            select.appendChild(option);
        });
    },

    getCurrentConnectionSettings() {
        const colorPicker = document.getElementById('defaultConnectionColorPicker');
        const selectedColor = colorPicker.querySelector('.color-option.selected');

        return {
            lineStyle: document.getElementById('defaultConnectionLineStyle').value || 'solid',
            lineType: document.getElementById('defaultConnectionLineType').value || 'curve',
            lineWidth: parseInt(document.getElementById('defaultConnectionLineWidth').value) || 2,
            color: selectedColor ? selectedColor.getAttribute('data-color') : '#667eea',
            independent: document.getElementById('defaultConnectionIndependent').checked || false
        };
    },

    createConnectionPreset() {
        const name = prompt('请输入新预设名称:');
        if (!name || name.trim() === '') return;

        const presets = this.getConnectionPresets();
        const key = 'preset_' + Date.now();

        presets[key] = {
            name: name.trim(),
            ...this.getCurrentConnectionSettings()
        };

        this.saveConnectionPresetsToStorage(presets);
        this.loadConnectionPresets();
        this.loadEditConnectionPresets();
        document.getElementById('connectionPresetSelect').value = key;
        alert('线条预设创建成功！');
    },

    saveConnectionPreset() {
        const select = document.getElementById('connectionPresetSelect');
        const key = select.value;

        if (!key) {
            alert('请先选择一个预设');
            return;
        }

        const presets = this.getConnectionPresets();

        // 保留预设名称，只更新设置
        const currentName = presets[key].name;
        presets[key] = {
            name: currentName,
            ...this.getCurrentConnectionSettings()
        };

        this.saveConnectionPresetsToStorage(presets);
        this.loadConnectionPresets();
        this.loadEditConnectionPresets();
        document.getElementById('connectionPresetSelect').value = key;
        alert('预设已保存！');
    },

    applyConnectionPreset(presetKey) {
        const presets = this.getConnectionPresets();
        const preset = presets[presetKey];
        if (!preset) return;

        // 应用线条样式
        document.getElementById('defaultConnectionLineStyle').value = preset.lineStyle;
        document.getElementById('defaultConnectionLineType').value = preset.lineType || 'curve';
        document.getElementById('defaultConnectionLineWidth').value = preset.lineWidth;
        document.getElementById('defaultConnectionIndependent').checked = preset.independent;

        // 应用颜色
        const colorPicker = document.getElementById('defaultConnectionColorPicker');
        colorPicker.querySelectorAll('.color-option').forEach(opt => {
            if (opt.getAttribute('data-color') === preset.color) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });

        // 同步默认连接线设置到内存和本地存储，确保新连接线继承预设
        const lineStyle = preset.lineStyle || 'solid';
        const lineType = preset.lineType || 'curve';
        const lineWidth = parseInt(preset.lineWidth, 10) || 2;
        const lineColor = preset.color || '#667eea';
        const lineIndependent = !!preset.independent;
        localStorage.setItem('mindmap_default_line_style', lineStyle);
        localStorage.setItem('mindmap_default_line_type', lineType);
        localStorage.setItem('mindmap_default_line_width', lineWidth);
        localStorage.setItem('mindmap_default_line_color', lineColor);
        localStorage.setItem('mindmap_default_line_independent', lineIndependent ? 'true' : 'false');
        if (this.appLeft) {
            this.appLeft.defaultLineStyle = lineStyle;
            this.appLeft.defaultLineType = lineType;
            this.appLeft.defaultLineWidth = lineWidth;
            this.appLeft.defaultLineColor = lineColor;
            this.appLeft.defaultLineIndependent = lineIndependent;
        }
        if (this.appRight) {
            this.appRight.defaultLineStyle = lineStyle;
            this.appRight.defaultLineType = lineType;
            this.appRight.defaultLineWidth = lineWidth;
            this.appRight.defaultLineColor = lineColor;
            this.appRight.defaultLineIndependent = lineIndependent;
        }
    },

    renameConnectionPreset() {
        const select = document.getElementById('connectionPresetSelect');
        const key = select.value;

        if (!key) {
            alert('请先选择一个预设');
            return;
        }

        const presets = this.getConnectionPresets();
        const newName = prompt('请输入新名称:', presets[key].name);
        if (!newName || newName.trim() === '') return;

        presets[key].name = newName.trim();
        this.saveConnectionPresetsToStorage(presets);
        this.loadConnectionPresets();
        this.loadEditConnectionPresets(); // 同时更新编辑区域的预设列表
        select.value = key;
    },

    deleteConnectionPreset() {
        const select = document.getElementById('connectionPresetSelect');
        const key = select.value;

        if (key === 'default') {
            alert('不能删除默认预设');
            return;
        }

        const presets = this.getConnectionPresets();
        if (!confirm(`确定要删除预设 "${presets[key].name}" 吗？`)) return;

        delete presets[key];
        this.saveConnectionPresetsToStorage(presets);
        this.loadConnectionPresets();
        this.loadEditConnectionPresets(); // 同时更新编辑区域的预设列表
        select.value = 'default';
        this.applyConnectionPreset('default');
    },

    // 加载编辑区域的连接线预设列表
    loadEditConnectionPresets() {
        const presets = this.getConnectionPresets();
        const select = document.getElementById('editConnectionPresetSelect');
        select.innerHTML = '<option value="">-- 选择预设 --</option>';

        Object.keys(presets).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = presets[key].name;
            select.appendChild(option);
        });
    },

    // 应用预设到选中的连接线
    applyConnectionPresetToSelected(presetKey) {
        const activeApp = this.activeScreen === 'left' ? this.appLeft : this.appRight;
        if (!activeApp || activeApp.selectedConnections.length === 0) return;

        const presets = this.getConnectionPresets();
        const preset = presets[presetKey];
        if (!preset) return;

        // 应用预设到所有选中的连接线
        activeApp.selectedConnections.forEach(conn => {
            conn.lineStyle = preset.lineStyle;
            conn.lineType = preset.lineType || 'curve';
            conn.lineWidth = preset.lineWidth;
            conn.color = preset.color;
            conn.isIndependent = preset.independent;
        });

        activeApp.saveToLocalStorage();
        activeApp.draw();

        // 手动更新UI组件
        const firstConnection = activeApp.selectedConnections[0];
        if(firstConnection) {
            document.getElementById('connectionLineStyle').value = firstConnection.lineStyle || 'solid';
            document.getElementById('connectionLineType').value = firstConnection.lineType || 'curve';
            document.getElementById('connectionLineWidth').value = firstConnection.lineWidth || 2;
            const connectionColorPicker = document.getElementById('connectionColorPicker');
            if (connectionColorPicker) {
                const colorOptions = connectionColorPicker.querySelectorAll('.color-option');
                colorOptions.forEach(option => {
                    option.classList.remove('selected');
                    if (option.getAttribute('data-color') === (firstConnection.color || '#667eea')) {
                        option.classList.add('selected');
                    }
                });
            }
            const connectionIndependent = document.getElementById('connectionIndependent');
            if (connectionIndependent) {
                const values = activeApp.selectedConnections.map(conn => !!conn.isIndependent);
                const allSame = values.every(v => v === values[0]);
                connectionIndependent.indeterminate = !allSame;
                connectionIndependent.checked = allSame ? values[0] : false;
            }
        }
    },

    // ===== 导出/导入预设配置 =====

    exportPresets() {
        const config = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            nodePresets: this.getNodePresets(),
            connectionPresets: this.getConnectionPresets()
        };

        const dataStr = JSON.stringify(config, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `mindmap-presets-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert('预设配置已导出！');
    },

    importPresets(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);

                // 验证配置文件格式
                if (!config.nodePresets || !config.connectionPresets) {
                    alert('无效的配置文件格式！');
                    return;
                }

                // 询问用户是合并还是替换
                const merge = confirm('是否合并到现有预设？\n\n点击"确定"合并，点击"取消"替换现有预设。');

                if (merge) {
                    // 合并预设
                    const currentNodePresets = this.getNodePresets();
                    const currentConnectionPresets = this.getConnectionPresets();

                    const mergedNodePresets = { ...currentNodePresets, ...config.nodePresets };
                    const mergedConnectionPresets = { ...currentConnectionPresets, ...config.connectionPresets };

                    this.saveNodePresetsToStorage(mergedNodePresets);
                    this.saveConnectionPresetsToStorage(mergedConnectionPresets);
                } else {
                    // 替换预设
                    this.saveNodePresetsToStorage(config.nodePresets);
                    this.saveConnectionPresetsToStorage(config.connectionPresets);
                }

                // 重新加载预设列表
                this.loadNodePresets();
                this.loadConnectionPresets();
                this.loadEditNodePresets();
                this.loadEditConnectionPresets();

                alert('预设配置导入成功！');
            } catch (error) {
                console.error('导入配置失败:', error);
                alert('导入配置失败：文件格式错误！');
            }
        };

        reader.readAsText(file);

        // 清空文件输入，允许重复导入同一文件
        event.target.value = '';
    },

    // ===== 从编辑区域管理预设 =====

    // 从编辑区域获取当前节点设置
    getCurrentEditNodeSettings() {
        const activeApp = this.activeScreen === 'left' ? this.appLeft : this.appRight;
        if (!activeApp || !activeApp.selectedNode) return null;

        const node = activeApp.selectedNode;
        return {
            color: node.color || '#e8f0fe',
            textColor: node.textColor || '#1f2937',
            fontSize: node.fontSize || 13,
            textAlign: node.textAlign || 'center',
            shape: node.shape || 'rounded-rect',
            width: node.width || 100,
            height: node.height || 40,
            locked: !!node.locked
        };
    },

    // 从编辑区域新建节点预设
    createNodePresetFromEdit() {
        const settings = this.getCurrentEditNodeSettings();
        if (!settings) {
            alert('请先选中一个节点');
            return;
        }

        const name = prompt('请输入新预设名称:');
        if (!name || name.trim() === '') return;

        const presets = this.getNodePresets();
        const key = 'preset_' + Date.now();

        presets[key] = {
            name: name.trim(),
            ...settings
        };

        this.saveNodePresetsToStorage(presets);
        this.loadNodePresets();
        this.loadEditNodePresets();
        document.getElementById('nodePresetSelect').value = key;
        alert('节点预设创建成功！');
    },

    // 从编辑区域保存节点预设
    saveNodePresetFromEdit() {
        const settings = this.getCurrentEditNodeSettings();
        if (!settings) {
            alert('请先选中一个节点');
            return;
        }

        const select = document.getElementById('editNodePresetSelect');
        const key = select.value;

        if (!key) {
            alert('请先从下拉框选择一个预设，或点击"新建"创建新预设');
            return;
        }

        const presets = this.getNodePresets();
        if (!presets[key]) {
            alert('预设不存在');
            return;
        }

        // 保留预设名称，只更新设置
        const currentName = presets[key].name;
        presets[key] = {
            name: currentName,
            ...settings
        };

        this.saveNodePresetsToStorage(presets);
        this.loadNodePresets();
        this.loadEditNodePresets();
        alert(`预设"${currentName}"已更新！`);
    },

    // 从编辑区域获取当前连接线设置
    getCurrentEditConnectionSettings() {
        const activeApp = this.activeScreen === 'left' ? this.appLeft : this.appRight;
        if (!activeApp || activeApp.selectedConnections.length === 0) return null;

        const conn = activeApp.selectedConnections[0];
        return {
            lineStyle: conn.lineStyle || 'solid',
            lineType: conn.lineType || 'curve',
            lineWidth: conn.lineWidth || 2,
            color: conn.color || '#667eea',
            independent: !!conn.isIndependent
        };
    },

    // 从编辑区域新建连接线预设
    createConnectionPresetFromEdit() {
        const settings = this.getCurrentEditConnectionSettings();
        if (!settings) {
            alert('请先选中一条连接线');
            return;
        }

        const name = prompt('请输入新预设名称:');
        if (!name || name.trim() === '') return;

        const presets = this.getConnectionPresets();
        const key = 'preset_' + Date.now();

        presets[key] = {
            name: name.trim(),
            ...settings
        };

        this.saveConnectionPresetsToStorage(presets);
        this.loadConnectionPresets();
        this.loadEditConnectionPresets();
        document.getElementById('connectionPresetSelect').value = key;
        alert('线条预设创建成功！');
    },

    // 从编辑区域保存连接线预设
    saveConnectionPresetFromEdit() {
        const settings = this.getCurrentEditConnectionSettings();
        if (!settings) {
            alert('请先选中一条连接线');
            return;
        }

        const select = document.getElementById('editConnectionPresetSelect');
        const key = select.value;

        if (!key) {
            alert('请先从下拉框选择一个预设，或点击"新建"创建新预设');
            return;
        }

        const presets = this.getConnectionPresets();
        if (!presets[key]) {
            alert('预设不存在');
            return;
        }

        // 保留预设名称，只更新设置
        const currentName = presets[key].name;
        presets[key] = {
            name: currentName,
            ...settings
        };

        this.saveConnectionPresetsToStorage(presets);
        this.loadConnectionPresets();
        this.loadEditConnectionPresets();
        alert(`预设"${currentName}"已更新！`);
    }
};

// 快捷方式管理器
class ShortcutManager {
    constructor() {
        this.shortcuts = [];
        this.bar = document.getElementById('shortcutBar');
        this.pills = document.getElementById('shortcutPills');
        this.directionBtn = document.getElementById('shortcutDirectionBtn');
        this.manageBtn = document.getElementById('shortcutManageBtn');
        this.managePanel = document.getElementById('shortcutManagePanel');
        this.manageList = document.getElementById('shortcutManageList');
        this.manageClose = document.getElementById('shortcutManageClose');
        this.dragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.activeFile = 'default';
        this.direction = 'horizontal'; // 'horizontal' or 'vertical'
        this.load();
        this.loadDirection();
        this.bindEvents();
        this.render();
    }

    getStorageKey() {
        const ns = AppState.namespaceManager ? AppState.namespaceManager.getCurrentNamespace() : 'default';
        const file = encodeURIComponent(this.activeFile || 'default');
        return `mindmap_shortcuts_${ns}_${file}`;
    }

    getPositionKey() {
        const ns = AppState.namespaceManager ? AppState.namespaceManager.getCurrentNamespace() : 'default';
        const file = encodeURIComponent(this.activeFile || 'default');
        return `mindmap_shortcut_pos_${ns}_${file}`;
    }

    getDirectionKey() {
        const ns = AppState.namespaceManager ? AppState.namespaceManager.getCurrentNamespace() : 'default';
        const file = encodeURIComponent(this.activeFile || 'default');
        return `mindmap_shortcut_dir_${ns}_${file}`;
    }

    load() {
        try {
            const raw = localStorage.getItem(this.getStorageKey());
            this.shortcuts = raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn('[ShortcutManager] 解析失败，重置为空', e);
            this.shortcuts = [];
        }
    }

    save() {
        localStorage.setItem(this.getStorageKey(), JSON.stringify(this.shortcuts));
    }

    loadDirection() {
        try {
            const dir = localStorage.getItem(this.getDirectionKey());
            this.direction = dir || 'horizontal';
            this.applyDirection();
        } catch (e) {
            this.direction = 'horizontal';
        }
    }

    saveDirection() {
        localStorage.setItem(this.getDirectionKey(), this.direction);
    }

    toggleDirection() {
        this.direction = this.direction === 'horizontal' ? 'vertical' : 'horizontal';
        this.saveDirection();
        this.applyDirection();
        // 切换方向后重新应用位置，确保在视口内
        this.applyPosition(false);
    }

    applyDirection() {
        if (!this.bar) return;
        if (this.direction === 'vertical') {
            this.bar.classList.add('vertical');
            if (this.directionBtn) this.directionBtn.textContent = '⇅';
        } else {
            this.bar.classList.remove('vertical');
            if (this.directionBtn) this.directionBtn.textContent = '⇄';
        }
    }

    reloadForNamespace() {
        this.load();
        this.loadDirection();
        this.applyPosition(false);
        this.render();
    }

    setActiveFile(fileName) {
        const name = fileName || '未保存';
        if (this.activeFile === name) return;
        this.activeFile = name;
        this.load();
        this.loadDirection();
        this.applyPosition(false);
        this.render();
    }

    hasShortcut(nodeId, fileName) {
        return this.shortcuts.some(s => s.nodeId === nodeId && s.fileName === fileName);
    }

    addShortcut(ref) {
        if (this.hasShortcut(ref.nodeId, ref.fileName)) return;
        this.shortcuts.push(ref);
        this.save();
        this.render();
    }

    removeShortcut(nodeId, fileName) {
        this.shortcuts = this.shortcuts.filter(s => !(s.nodeId === nodeId && s.fileName === fileName));
        this.save();
        this.render();
    }

    moveShortcut(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.shortcuts.length) return;
        const [item] = this.shortcuts.splice(index, 1);
        this.shortcuts.splice(newIndex, 0, item);
        this.save();
        this.render();
    }

    bindEvents() {
        if (this.directionBtn) {
            this.directionBtn.addEventListener('click', () => {
                this.toggleDirection();
            });
        }
        if (this.manageBtn) {
            this.manageBtn.addEventListener('click', () => {
                if (this.managePanel) {
                    this.managePanel.style.display = this.managePanel.style.display === 'block' ? 'none' : 'block';
                    this.renderManageList();
                }
            });
        }
        if (this.manageClose) {
            this.manageClose.addEventListener('click', () => {
                if (this.managePanel) this.managePanel.style.display = 'none';
            });
        }

        if (this.bar) {
            const dragStart = (e) => {
                if (this.shortcuts.length === 0) return;
                // 避免在点击 pill / 按钮时触发拖动
                if (e.target.closest('.shortcut-pill') || e.target.classList.contains('shortcut-manage-btn') || e.target.classList.contains('shortcut-remove')) {
                    return;
                }
                e.preventDefault();
                const rect = this.bar.getBoundingClientRect();
                this.dragging = true;
                this.dragOffsetX = e.clientX - rect.left;
                this.dragOffsetY = e.clientY - rect.top;
                window.addEventListener('mousemove', dragMove);
                window.addEventListener('mouseup', dragEnd, { once: true });
            };

            const dragMove = (e) => {
                if (!this.dragging) return;
                const rect = this.bar.getBoundingClientRect();
                const left = this.clamp(e.clientX - this.dragOffsetX, 10, window.innerWidth - rect.width - 10);
                const top = this.clamp(e.clientY - this.dragOffsetY, 10, window.innerHeight - rect.height - 10);
                this.setPosition(left, top, false);
            };

            const dragEnd = () => {
                if (!this.dragging) return;
                this.dragging = false;
                const rect = this.bar.getBoundingClientRect();
                this.savePosition({ left: rect.left, top: rect.top });
                window.removeEventListener('mousemove', dragMove);
            };

            this.bar.addEventListener('mousedown', dragStart);
        }
    }

    clamp(val, min, max) {
        return Math.min(max, Math.max(min, val));
    }

    savePosition(pos) {
        localStorage.setItem(this.getPositionKey(), JSON.stringify(pos));
    }

    loadPosition() {
        try {
            const raw = localStorage.getItem(this.getPositionKey());
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    setPosition(left, top, save = true) {
        if (!this.bar) return;
        this.bar.style.left = `${left}px`;
        this.bar.style.top = `${top}px`;
        this.bar.style.right = 'auto';
        this.bar.style.bottom = 'auto';
        this.bar.style.transform = 'translate(0, 0)';
        if (save) this.savePosition({ left, top });
    }

    applyPosition(forceDefault = false) {
        if (!this.bar) return;
        const stored = forceDefault ? null : this.loadPosition();
        this.bar.style.display = this.shortcuts.length > 0 ? 'flex' : 'none';
        if (this.shortcuts.length === 0) return;

        // 暂时显示以获得尺寸
        this.bar.style.visibility = 'hidden';
        this.bar.style.display = 'flex';
        const rect = this.bar.getBoundingClientRect();
        let left, top;
        if (stored) {
            left = stored.left;
            top = stored.top;
        } else {
            left = Math.max(10, (window.innerWidth - rect.width) / 2);
            top = Math.max(10, window.innerHeight - rect.height - 20);
            this.savePosition({ left, top });
        }
        this.setPosition(left, top, false);
        this.bar.style.visibility = 'visible';
    }

    render() {
        if (!this.bar || !this.pills) return;
        this.pills.innerHTML = '';
        if (this.shortcuts.length === 0) {
            this.bar.style.display = 'none';
            if (this.managePanel) this.managePanel.style.display = 'none';
            return;
        }

        this.bar.style.display = 'flex';
        this.shortcuts.forEach((sc) => {
            const pill = document.createElement('div');
            pill.className = 'shortcut-pill';
            pill.dataset.nodeId = sc.nodeId;
            pill.dataset.fileName = sc.fileName;

            const dot = document.createElement('div');
            dot.className = 'shortcut-dot';
            dot.style.background = sc.color || '#667eea';

            const text = document.createElement('span');
            text.textContent = sc.label || '快捷节点';

            const remove = document.createElement('span');
            remove.className = 'shortcut-remove';
            remove.textContent = '×';

            pill.appendChild(dot);
            pill.appendChild(text);
            pill.appendChild(remove);

            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (e.target === remove) {
                    if (activeApp) {
                        activeApp.removeShortcutById(sc.nodeId, sc.fileName);
                    }
                    this.removeShortcut(sc.nodeId, sc.fileName);
                    return;
                }
                if (activeApp && activeApp.focusShortcut) {
                    activeApp.focusShortcut(sc);
                }
            });

            this.pills.appendChild(pill);
        });

        this.renderManageList();
        this.applyPosition();
    }

    renderManageList() {
        if (!this.manageList) return;
        this.manageList.innerHTML = '';
        this.shortcuts.forEach((sc, idx) => {
            const row = document.createElement('div');
            row.className = 'shortcut-manage-item';
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <div class="shortcut-dot" style="background:${sc.color || '#667eea'}"></div>
                    <div style="font-size:13px; line-height:1.3;">
                        <div>${sc.label || '快捷节点'}</div>
                        <div style="opacity:0.6; font-size:11px;">${sc.fileName || ''}</div>
                    </div>
                </div>
                <div class="shortcut-manage-actions">
                    <button class="move" data-dir="-1">↑</button>
                    <button class="move" data-dir="1">↓</button>
                    <button class="delete">删除</button>
                </div>
            `;
            row.querySelectorAll('button.move').forEach(btn => {
                btn.addEventListener('click', () => {
                    const dir = parseInt(btn.getAttribute('data-dir'), 10);
                    this.moveShortcut(idx, dir);
                });
            });
            row.querySelector('button.delete').addEventListener('click', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) activeApp.removeShortcutById(sc.nodeId, sc.fileName);
                this.removeShortcut(sc.nodeId, sc.fileName);
            });
            this.manageList.appendChild(row);
        });
    }
}

let shortcutManager = null;

// 模式控制器
class ModeController {
    constructor() {
        this.storageKeyMode = 'mindmap_display_mode';
        this.storageKeyFullscreenView = 'mindmap_fullscreen_view';
        this.storageKeySidebarHidden = 'mindmap_sidebar_hidden';
        this.storageKeySidebarWidth = 'mindmap_sidebar_width';
        this.sidebarMinWidth = 180;
        this.sidebarMaxWidth = 420;
        this.sidebarWidth = this.loadSidebarWidth();
        // 从localStorage恢复显示模式
        this.currentMode = this.loadMode();
        this.isFullscreenView = this.loadFullscreenViewState();
        this.isSidebarHidden = this.loadSidebarHiddenState();
        this.applySidebarWidth(this.sidebarWidth);
        this.setupModeButtons();
        this.setupSidebarResizer();
    }

    loadMode() {
        const savedMode = localStorage.getItem(this.storageKeyMode);
        return savedMode || 'fullscreen-left';
    }

    loadFullscreenViewState() {
        const saved = localStorage.getItem(this.storageKeyFullscreenView);
        return saved === 'true';
    }

    loadSidebarHiddenState() {
        const saved = localStorage.getItem(this.storageKeySidebarHidden);
        return saved === 'true';
    }

    loadSidebarWidth() {
        const saved = parseInt(localStorage.getItem(this.storageKeySidebarWidth), 10);
        if (!isNaN(saved)) {
            return this.clampSidebarWidth(saved);
        }
        const cssValue = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width');
        const parsed = parseInt(cssValue, 10);
        return this.clampSidebarWidth(isNaN(parsed) ? 250 : parsed);
    }

    saveSidebarWidth(width) {
        localStorage.setItem(this.storageKeySidebarWidth, `${width}`);
    }

    clampSidebarWidth(width) {
        return Math.min(this.sidebarMaxWidth, Math.max(this.sidebarMinWidth, width));
    }

    applySidebarWidth(width) {
        const clamped = this.clampSidebarWidth(width);
        this.sidebarWidth = clamped;
        document.documentElement.style.setProperty('--sidebar-width', `${clamped}px`);

        requestAnimationFrame(() => {
            if (AppState.appLeft) {
                AppState.appLeft.resizeCanvas();
            }
            if (AppState.appRight) {
                AppState.appRight.resizeCanvas();
            }
        });
    }

    setupSidebarResizer() {
        const resizer = document.getElementById('sidebarResizer');
        if (!resizer) return;

        let startX = 0;
        let startWidth = this.sidebarWidth;
        let isResizing = false;

        const handleMove = (clientX) => {
            if (!isResizing) return;
            const delta = clientX - startX;
            const newWidth = this.clampSidebarWidth(startWidth + delta);
            this.applySidebarWidth(newWidth);
        };

        const stopResize = () => {
            if (!isResizing) return;
            isResizing = false;
            this.saveSidebarWidth(this.sidebarWidth);
            document.body.classList.remove('resizing-sidebar');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', stopResize);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', stopResize);
        };

        const onMouseMove = (e) => {
            e.preventDefault();
            handleMove(e.clientX);
        };

        const onTouchMove = (e) => {
            if (e.touches && e.touches[0]) {
                handleMove(e.touches[0].clientX);
            }
            if (e.cancelable) {
                e.preventDefault();
            }
        };

        const startResize = (clientX) => {
            isResizing = true;
            startX = clientX;
            startWidth = this.sidebarWidth;
            document.body.classList.add('resizing-sidebar');
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', stopResize);
            window.addEventListener('touchmove', onTouchMove, { passive: false });
            window.addEventListener('touchend', stopResize);
        };

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startResize(e.clientX);
        });

        resizer.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches[0]) {
                startResize(e.touches[0].clientX);
                if (e.cancelable) {
                    e.preventDefault();
                }
            }
        }, { passive: false });
    }

    saveMode(mode) {
        localStorage.setItem(this.storageKeyMode, mode);
    }

    saveFullscreenViewState(isFullscreen) {
        localStorage.setItem(this.storageKeyFullscreenView, isFullscreen ? 'true' : 'false');
    }

    saveSidebarHiddenState(isHidden) {
        localStorage.setItem(this.storageKeySidebarHidden, isHidden ? 'true' : 'false');
    }

    setupModeButtons() {
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        fullscreenBtn.onclick = () => this.toggleMode();

        const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
        toggleSidebarBtn.onclick = () => this.toggleSidebar();

        // 应用初始模式的CSS类
        this.setMode(this.currentMode);
        // 全屏显示状态在appsInitialized()后应用
    }

    toggleSidebar() {
        this.isSidebarHidden = !this.isSidebarHidden;
        this.saveSidebarHiddenState(this.isSidebarHidden);
        this.applySidebarState();
    }

    applySidebarState() {
        const mainContent = document.querySelector('.main-content');
        const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');

        if (this.isSidebarHidden) {
            mainContent.classList.add('sidebar-hidden');
            toggleSidebarBtn.textContent = '☰ 显示';
        } else {
            mainContent.classList.remove('sidebar-hidden');
            toggleSidebarBtn.textContent = '☰ 工具栏';
        }

        // 触发canvas重绘 - 使用requestAnimationFrame确保DOM已更新
        requestAnimationFrame(() => {
            if (AppState.appLeft) {
                AppState.appLeft.resizeCanvas();
            }
            if (AppState.appRight) {
                AppState.appRight.resizeCanvas();
            }
        });
    }

    applyInitialState() {
        // 在两个app都初始化完毕后调用此方法
        this.applySidebarWidth(this.sidebarWidth);
        this.applyFullscreenViewState();
        this.applySidebarState();
    }

    toggleMode() {
        const modes = ['dual', 'fullscreen-left'];
        const currentIndex = modes.indexOf(this.currentMode);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        this.setMode(nextMode);
    }

    setMode(mode) {
        this.currentMode = mode;
        AppState.mode = mode;
        this.saveMode(mode);

        const mainContent = document.querySelector('.main-content');
        mainContent.className = `main-content ${mode}`;

        // 更新按钮文本
        const texts = {
            'dual': '双屏',
            'fullscreen-left': '单屏'
        };
        document.getElementById('fullscreenBtn').textContent = texts[mode];

        // 调整Canvas尺寸
        if (AppState.appLeft) AppState.appLeft.resizeCanvas();
        if (AppState.appRight) AppState.appRight.resizeCanvas();

        // 全屏模式自动设置activeScreen
        // fullscreen-left 布局下显示的是右侧编辑区，因此将活跃屏设为 right
        if (mode === 'fullscreen-left') {
            AppState.setActiveScreen('right');
        } else if (mode === 'fullscreen-right') {
            AppState.setActiveScreen('left');
        }
    }

    toggleFullscreenView() {
        this.isFullscreenView = !this.isFullscreenView;
        this.saveFullscreenViewState(this.isFullscreenView);
        this.applyFullscreenViewState();
    }

    applyFullscreenViewState() {
        const container = document.querySelector('.container');
        const mainContent = document.querySelector('.main-content');
        const fullscreenViewBtn = document.getElementById('fullscreenViewBtn');
        const body = document.body;
        const statusBar = document.querySelector('.status-bar');
        const header = document.querySelector('.header');

        if (this.isFullscreenView) {
            container.classList.add('fullscreen-view-mode');
            mainContent.classList.add('fullscreen-view');
            body.classList.add('fullscreen-view-active');
            fullscreenViewBtn.textContent = '🖥 退出演示';

            // 强制显示 header 和 status-bar
            if (header) {
                header.setAttribute('data-fullscreen-mode', 'true');
                header.style.cssText = 'display: flex !important; align-items: center !important; visibility: visible !important; height: auto !important;';
            }
            if (statusBar) {
                statusBar.setAttribute('data-fullscreen-mode', 'true');
                statusBar.style.cssText = 'display: flex !important; visibility: visible !important; height: auto !important; min-height: 50px !important; position: relative !important;';
            }
        } else {
            container.classList.remove('fullscreen-view-mode');
            mainContent.classList.remove('fullscreen-view');
            body.classList.remove('fullscreen-view-active');
            fullscreenViewBtn.textContent = '🖥 演示';

            // 恢复默认样式
            if (header) {
                header.removeAttribute('data-fullscreen-mode');
                header.style.cssText = '';
            }
            if (statusBar) {
                statusBar.removeAttribute('data-fullscreen-mode');
                statusBar.style.cssText = '';
            }
        }

        // 触发canvas重绘 - 使用requestAnimationFrame确保DOM已更新
        requestAnimationFrame(() => {
            if (AppState.appLeft) {
                AppState.appLeft.resizeCanvas();
            }
            if (AppState.appRight) {
                AppState.appRight.resizeCanvas();
            }
        });
    }
}

// 脑图应用主逻辑
class MindMapApp {
    constructor(screenId = 'left') {
        // Sizing and padding constants - will be updated by padding mode
        const savedPaddingMode = localStorage.getItem('mindmap_default_padding_mode');
        this.paddingMode = savedPaddingMode || 'narrow'; // default mode
        this.updatePaddingConstants();
        this.IMAGE_TEXT_GAP = 10;

        this.screenId = screenId;
        this.currentFileName = '未保存';
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.draggedNode = null;
        this.currentColor = localStorage.getItem('mindmap_default_node_color') || '#e8f0fe';
        this.currentFontSize = parseInt(localStorage.getItem('mindmap_default_font_size'), 10) || 13;
        this.currentTextColor = localStorage.getItem('mindmap_default_text_color') || '#1f2937';
        this.currentShape = localStorage.getItem('mindmap_default_node_shape') || 'rounded-rect';
        this.currentTextAlign = localStorage.getItem('mindmap_default_node_align') || 'center';
        this.defaultLineWidth = parseInt(localStorage.getItem('mindmap_default_line_width'), 10) || 2;
        this.defaultArrowSize = parseInt(localStorage.getItem('mindmap_default_arrow_size'), 10) || 20;
        this.defaultLineStyle = localStorage.getItem('mindmap_default_line_style') || 'solid';
        this.defaultLineType = localStorage.getItem('mindmap_default_line_type') || 'curve';
        this.defaultLineColor = localStorage.getItem('mindmap_default_line_color') || '#667eea';
        this.defaultLineIndependent = localStorage.getItem('mindmap_default_line_independent') === 'true';
        this.codeFontStack = '"JetBrains Mono", "SFMono-Regular", "Menlo", "Consolas", "Fira Code", monospace';
        const savedProportional = localStorage.getItem('mindmap_setting_proportional_font');
        this.proportionalFontSize = savedProportional === null ? true : savedProportional === 'true';
        this.clipboard = null;
        this.clipboardMode = null;
        this.lastClickPos = null;
        this.lastClickTime = null;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
        // 触摸缩放相关
        this.lastTouchDistance = null;
        this.touchStartZoom = null;
        this.touchCenterX = null;
        this.touchCenterY = null;
        this.isSelecting = false;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.selectedConnections = [];
        this.selectedNodes = [];
        this.showSelectionBox = false;
        this.isDrawingConnection = false;
        this.connectionStartNode = null;
        this.connectionEndPos = null;
        this.connectionHoveredNode = null;
        this.isDraggingSelection = false;
        this.selectionDragStart = null;
        this.draggedConnection = null;
        this.draggedConnectionOffset = null;
        this.draggedConnectionEndpoint = null;
        this.resizingNode = null;
        this.resizeHandle = null;
        this.resizeStartPos = null;
        this.resizingImage = null;
        this.imageResizeHandle = null;
        this.imageResizeStartSize = null;
        this.nodeClickPos = null;
        this.potentialDragNode = null;
        this.potentialSelectionDrag = null;
        this.selectionDragStartPos = null;
        this.dragThreshold = 5;
        this.isDirty = true;
        this.rafId = null;
        this.textCache = new Map();
        this.imageCache = new Map();
        this.imageLoading = new Map();
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;
        this.isUndoRedoing = false;
        this.pendingShortcutSelect = null;
        this.fileSortBy = 'time';
        this.fileSortOrder = 'desc';
        this.currentContextImage = null;
        this.isLoadingFile = false; // 文件加载状态标志
        this.contextMenuHandled = false;
        this.imageOverlays = new Map();
        this.contextMenuHandled = false;

        // 右键文本选择相关
        this.isSelectingText = false;
        this.textSelectionStart = null;
        this.textSelectionEnd = null;
        this.textSelectionNode = null;
        this.rightClickStartPos = null;
        this.rightClickNode = null;

        const canvasId = `canvas${screenId.charAt(0).toUpperCase() + screenId.slice(1)}`;
        const containerId = `canvasContainer${screenId.charAt(0).toUpperCase() + screenId.slice(1)}`;

        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.canvasContainer = document.getElementById(containerId);

        this.setupMinimap();
        this.resizeCanvas();
        this.setupEventListeners();
        this.setupServerSyncListeners();
        this.setupURLHashListener();
        this.loadFromLocalStorage();
        this.updateFileNameDisplay();
        this.draw();
        this.updateSidebar('default');
        this.animate();
    }

    // 监听URL hash变化，实现通过URL直链切换文件和命名空间
    setupURLHashListener() {
        window.addEventListener('hashchange', () => {
            if (this.screenId !== AppState.activeScreen) return;
            const hashNs = MindMapApp.getNamespaceFromURLHash();
            const hashFileName = MindMapApp.getFileFromURLHash();
            const currentNs = AppState.namespaceManager ? AppState.namespaceManager.getCurrentNamespace() : 'default';

            // 命名空间变化时，切换命名空间（会自动重新加载文件）
            if (hashNs && hashNs !== currentNs && AppState.namespaceManager) {
                console.log('[URL直链] hash变化，切换命名空间:', hashNs);
                AppState.namespaceManager.switchNamespace(hashNs);
                return;
            }

            // 仅文件变化时，直接加载文件
            if (hashFileName && hashFileName !== this.currentFileName) {
                console.log('[URL直链] hash变化，切换文件:', hashFileName);
                try {
                    const fileKey = this.getFileKey(hashFileName);
                    const fileData = localStorage.getItem(fileKey);
                    if (fileData) {
                        this.loadFile(hashFileName);
                    }
                } catch (e) {
                    console.error('[URL直链] 切换文件失败:', e);
                }
            }
        });
    }

    // 监听服务器同步事件
    setupServerSyncListeners() {
        window.addEventListener('serverStorageUpdate', (e) => {
            const { key, value } = e.detail;
            const namespace = AppState.namespaceManager ? AppState.namespaceManager.getCurrentNamespace() : 'default';
            const prefix = `mindmap_${namespace}_`;

            // 如果是当前命名空间的文件更新，刷新文件列表
            if (key.startsWith(prefix) && !key.includes('_current_') && !key.endsWith('_filename')) {
                console.log('[文件] 检测到服务器文件更新:', key);

                // 如果是左屏或活跃屏幕，更新文件列表
                if (this.screenId === 'left' || this.screenId === AppState.activeScreen) {
                    const searchInput = document.getElementById('fileSearchInput');
                    const searchTerm = searchInput ? searchInput.value : '';
                    this.updateSidebarFileList(searchTerm);
                }

                // 如果当前打开的文件被其他设备修改了，提示用户
                const filename = key.replace(prefix, '');
                if (filename === this.currentFileName) {
                    console.log('[文件] 当前文件被其他设备修改，将在下次操作时同步');
                }
            }
        });
    }

    // 设置小地图
    setupMinimap() {
        // 创建小地图容器
        this.minimapContainer = document.createElement('div');
        this.minimapContainer.className = 'minimap';

        // 创建小地图canvas
        this.minimapCanvas = document.createElement('canvas');
        this.minimapCanvas.width = 200;
        this.minimapCanvas.height = 150;
        this.minimapCtx = this.minimapCanvas.getContext('2d');

        this.minimapContainer.appendChild(this.minimapCanvas);
        this.canvasContainer.appendChild(this.minimapContainer);

        // 小地图计时器
        this.minimapTimer = null;
        this.minimapVisible = false;

        // 添加点击事件
        this.minimapContainer.addEventListener('click', (e) => {
            this.handleMinimapClick(e);
        });

        // 鼠标移入时暂停自动隐藏
        this.minimapContainer.addEventListener('mouseenter', () => {
            if (this.minimapTimer) {
                clearTimeout(this.minimapTimer);
                this.minimapTimer = null;
            }
        });

        // 鼠标移出时重新启动自动隐藏
        this.minimapContainer.addEventListener('mouseleave', () => {
            if (this.minimapVisible) {
                this.minimapTimer = setTimeout(() => {
                    this.hideMinimap();
                }, 3000);
            }
        });
    }

    // 显示小地图
    showMinimap() {
        if (!this.minimapVisible) {
            this.minimapContainer.classList.add('visible');
            this.minimapVisible = true;
        }

        // 渲染小地图
        this.renderMinimap();

        // 清除之前的定时器
        if (this.minimapTimer) {
            clearTimeout(this.minimapTimer);
        }

        // 3秒后自动隐藏
        this.minimapTimer = setTimeout(() => {
            this.hideMinimap();
        }, 3000);
    }

    // 隐藏小地图
    hideMinimap() {
        this.minimapContainer.classList.remove('visible');
        this.minimapVisible = false;
        if (this.minimapTimer) {
            clearTimeout(this.minimapTimer);
            this.minimapTimer = null;
        }
    }

    // 渲染小地图
    renderMinimap() {
        if (this.nodes.length === 0) return;

        const ctx = this.minimapCtx;
        const width = this.minimapCanvas.width;
        const height = this.minimapCanvas.height;

        // 清空小地图
        const isNightMode = document.body.classList.contains('night-mode');
        ctx.fillStyle = isNightMode ? '#1a1a2e' : '#ffffff';
        ctx.fillRect(0, 0, width, height);

        if (!this.nodes || this.nodes.length === 0) {
            this.minimapTransform = null;
            return;
        }

        // 计算所有节点的边界
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.nodes.forEach(node => {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + node.width);
            maxY = Math.max(maxY, node.y + node.height);
        });

        // 添加边距
        const margin = 20;
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        if (contentWidth === 0 || contentHeight === 0) {
            this.minimapTransform = null;
            return;
        }

        // 计算缩放比例
        const scaleX = (width - margin * 2) / contentWidth;
        const scaleY = (height - margin * 2) / contentHeight;
        const scale = Math.min(scaleX, scaleY, 1);

        // 计算偏移量使内容居中
        const offsetX = (width - contentWidth * scale) / 2 - minX * scale;
        const offsetY = (height - contentHeight * scale) / 2 - minY * scale;

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // 绘制连接线
        ctx.strokeStyle = isNightMode ? NIGHT_BORDER_DEFAULT : '#667eea';
        ctx.lineWidth = 1 / scale;
        this.connections.forEach(connection => {
            const { x1, y1, x2, y2 } = this.getConnectionEndpoints(connection);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        });

        // 绘制节点
        this.nodes.forEach(node => {
            const nodeColor = isNightMode ? toNightFillColor(node.color) : node.color;
            ctx.fillStyle = nodeColor;
            ctx.fillRect(node.x, node.y, node.width, node.height);

            // 如果节点有图片，绘制缩略图（优化：复用主画布的缓存）
            const imageItem = Array.isArray(node.content)
                ? node.content.find(item => item.type === 'image')
                : null;
            if (imageItem) {
                if (!this.imageCache) this.imageCache = new Map();
                let img = this.imageCache.get(imageItem.value);

                // 只在图片已加载的情况下绘制，避免阻塞
                if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                    const displayWidth = imageItem.displayWidth || imageItem.width || img.naturalWidth;
                    const displayHeight = imageItem.displayHeight || imageItem.height || img.naturalHeight;
                    const ratio = displayWidth > 0 ? displayHeight / displayWidth : 1;
                    let thumbW = Math.min(displayWidth, node.width * 0.9);
                    let thumbH = thumbW * ratio;
                    if (thumbH > node.height * 0.9) {
                        thumbH = node.height * 0.9;
                        thumbW = thumbH / ratio;
                    }
                    const thumbX = node.x + (node.width - thumbW) / 2;
                    const thumbY = node.y + (node.height - thumbH) / 2;
                    ctx.drawImage(img, thumbX, thumbY, thumbW, thumbH);
                }
            }

            ctx.strokeStyle = isNightMode ? NIGHT_BORDER_DEFAULT : '#667eea';
            ctx.lineWidth = 1 / scale;
            ctx.strokeRect(node.x, node.y, node.width, node.height);
        });

        // 绘制当前视口矩形
        const viewportX = -this.panX / this.zoom;
        const viewportY = -this.panY / this.zoom;
        const viewportWidth = this.canvas.width / this.zoom;
        const viewportHeight = this.canvas.height / this.zoom;

        ctx.restore();

        // 在minimap坐标系中绘制视口矩形，确保边框完整显示
        const vpLeft = viewportX * scale + offsetX;
        const vpTop = viewportY * scale + offsetY;
        const vpRight = (viewportX + viewportWidth) * scale + offsetX;
        const vpBottom = (viewportY + viewportHeight) * scale + offsetY;

        // 将视口矩形限制在minimap边界内
        const clampedLeft = Math.max(0, Math.min(vpLeft, width));
        const clampedTop = Math.max(0, Math.min(vpTop, height));
        const clampedRight = Math.max(0, Math.min(vpRight, width));
        const clampedBottom = Math.max(0, Math.min(vpBottom, height));

        // 检查视口是否与minimap有交集
        const hasOverlap = vpRight > 0 && vpLeft < width && vpBottom > 0 && vpTop < height;
        
        if (hasOverlap) {
            ctx.strokeStyle = isNightMode ? '#4ade80' : '#ff6b6b';
            ctx.lineWidth = 2;
            ctx.beginPath();

            // 始终绘制四条边，使用clamp后的坐标
            // 上边：如果原始上边在minimap上方，则沿minimap顶部绘制
            const drawTop = Math.max(0, vpTop);
            ctx.moveTo(clampedLeft, drawTop);
            ctx.lineTo(clampedRight, drawTop);

            // 下边：如果原始下边在minimap下方，则沿minimap底部绘制
            const drawBottom = Math.min(height, vpBottom);
            ctx.moveTo(clampedLeft, drawBottom);
            ctx.lineTo(clampedRight, drawBottom);

            // 左边：如果原始左边在minimap左侧，则沿minimap左侧绘制
            const drawLeft = Math.max(0, vpLeft);
            ctx.moveTo(drawLeft, clampedTop);
            ctx.lineTo(drawLeft, clampedBottom);

            // 右边：如果原始右边在minimap右侧，则沿minimap右侧绘制
            const drawRight = Math.min(width, vpRight);
            ctx.moveTo(drawRight, clampedTop);
            ctx.lineTo(drawRight, clampedBottom);

            ctx.stroke();
        }

        // 保存变换参数供点击事件使用
        this.minimapTransform = {
            minX, minY, maxX, maxY,
            contentWidth, contentHeight,
            scale, offsetX, offsetY,
            width, height
        };
    }

    // 处理小地图点击事件
    handleMinimapClick(e) {
        if (!this.minimapTransform) return;

        // 获取点击位置相对于小地图canvas的坐标
        const rect = this.minimapCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const { scale, offsetX, offsetY } = this.minimapTransform;

        // 将点击位置转换为世界坐标
        const worldX = (clickX - offsetX) / scale;
        const worldY = (clickY - offsetY) / scale;

        // 计算要使视口中心对准点击位置所需的平移值
        const viewportCenterX = this.canvas.width / 2 / this.zoom;
        const viewportCenterY = this.canvas.height / 2 / this.zoom;

        this.panX = -(worldX - viewportCenterX) * this.zoom;
        this.panY = -(worldY - viewportCenterY) * this.zoom;

        // 重新绘制主画布和小地图
        this.draw();
        this.renderMinimap();

        // 重置自动隐藏计时器
        if (this.minimapTimer) {
            clearTimeout(this.minimapTimer);
        }
        this.minimapTimer = setTimeout(() => {
            this.hideMinimap();
        }, 3000);
    }

    getStorageKey() {
        // LocalStorage键包含命名空间
        const namespace = AppState.namespaceManager ? AppState.namespaceManager.getCurrentNamespace() : 'default';
        return `mindmap_${namespace}_current_${this.screenId}`;
    }

    getFileKey(filename) {
        const namespace = AppState.namespaceManager ? AppState.namespaceManager.getCurrentNamespace() : 'default';
        return `mindmap_${namespace}_${filename}`;
    }

    onNamespaceChanged() {
        // 命名空间切换时，清空当前内容并加载新命名空间的自动保存
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.selectedNodes = [];
        this.selectedConnections = [];
        this.currentFileName = '未保存';
        this.selectNode(null);
        this.loadFromLocalStorage();
        this.updateFileNameDisplay();
        this.draw();

        // 更新小地图（切换命名空间后显示新的内容）
        if (this.nodes.length > 0) {
            this.renderMinimap();
            this.showMinimap();
        } else {
            this.hideMinimap();
        }

        // 更新侧边栏文件列表
        if (this.screenId === 'left') {
            const searchInput = document.getElementById('fileSearchInput');
            if (searchInput) {
                searchInput.value = ''; // 清空搜索框
            }
            this.updateSidebarFileList();
        }
    }

    updateSidebarFileList(searchTerm = '') {
        console.log('=== [updateSidebarFileList] 开始 ===');
        console.log('searchTerm:', searchTerm);
        console.log('screenId:', this.screenId);
        console.log('currentFileName:', this.currentFileName);

        const fileListContainer = document.getElementById('fileListSidebar');
        const filesData = this.listSavedFiles();

        console.log('[updateSidebarFileList] listSavedFiles 返回:', filesData.length, '个文件');
        console.log('[updateSidebarFileList] 文件列表:', filesData.map(f => f.name).join(', '));

        // 过滤文件
        let filteredFiles = searchTerm
            ? filesData.filter(fileData => fileData.name.toLowerCase().includes(searchTerm.toLowerCase()))
            : filesData;

        console.log('[updateSidebarFileList] 过滤后:', filteredFiles.length, '个文件');

        // 排序文件
        filteredFiles.sort((a, b) => {
            let comparison = 0;
            if (this.fileSortBy === 'name') {
                comparison = a.name.localeCompare(b.name, 'zh-CN');
            } else if (this.fileSortBy === 'time') {
                comparison = (a.timestamp || 0) - (b.timestamp || 0);
            }
            return this.fileSortOrder === 'asc' ? comparison : -comparison;
        });

        if (filteredFiles.length === 0) {
            fileListContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #999; font-size: 12px;">没有找到文件</div>';
            return;
        }

        fileListContainer.innerHTML = '';
        var self = this;
        for (var i = 0; i < filteredFiles.length; i++) {
            (function(fileData) {
                var file = fileData.name;
                var item = document.createElement('div');
                item.className = 'file-list-item';
                item.setAttribute('data-filename', file);
                item.style.cssText = 'padding: 8px 10px; border-bottom: 1px solid #eee; cursor: pointer; font-size: 12px; transition: background 0.2s;';

                // 显示文件名和时间信息
                var nameSpan = document.createElement('div');
                nameSpan.textContent = file;
                nameSpan.style.fontWeight = file === self.currentFileName ? 'bold' : 'normal';
                item.appendChild(nameSpan);

                // 如果有时间戳，显示时间信息
                if (fileData.timestamp) {
                    var timeSpan = document.createElement('div');
                    var date = new Date(fileData.timestamp);
                    var now = new Date();
                    var isToday = date.toDateString() === now.toDateString();

                    if (isToday) {
                        timeSpan.textContent = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                    } else {
                        timeSpan.textContent = date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
                    }
                    timeSpan.style.fontSize = '10px';
                    timeSpan.style.color = '#999';
                    timeSpan.style.marginTop = '2px';
                    item.appendChild(timeSpan);
                }

                // 高亮当前打开的文件
                if (file === self.currentFileName) {
                    item.style.background = '#e3f2fd';
                    item.style.color = '#667eea';
                }

                // 鼠标悬停效果 - 直接在每个元素上设置
                var currentFile = self.currentFileName;
                item.addEventListener('mouseenter', function() {
                    if (file !== currentFile) {
                        this.style.background = '#f5f5f5';
                    }
                });
                item.addEventListener('mouseleave', function() {
                    if (file !== currentFile) {
                        this.style.background = 'white';
                    }
                });

                fileListContainer.appendChild(item);
            })(filteredFiles[i]);
        }
    }

    // 更新边距常量
    updatePaddingConstants() {
        if (this.paddingMode === 'wide') {
            // 宽边模式：更宽松的边距
            this.NODE_HORIZONTAL_PADDING = 80;  // 原来40，差异更明显
            this.TEXT_VERTICAL_PADDING = 36;    // 原来16，差异更明显
            this.IMAGE_TOP_PADDING = 24;        // 原来10，差异更明显
        } else {
            // 窄边模式：紧凑的边距（默认）
            this.NODE_HORIZONTAL_PADDING = 40;
            this.TEXT_VERTICAL_PADDING = 16;
            this.IMAGE_TOP_PADDING = 10;
        }
    }

    // 设置边距模式
    setPaddingMode(mode) {
        this.paddingMode = mode;
        this.updatePaddingConstants();

        // 清除文本缓存
        this.textCache.clear();

        // 只保存设置，不自动调整现有节点
        // 新的边距模式将应用于新建或编辑的节点

        // 重绘画布
        this.draw();

        // 保存到本地存储
        this.saveToLocalStorage();
    }

    setupEventListeners() {
        // 窗口大小改变
        window.addEventListener('resize', () => this.resizeCanvas());

        // Canvas 事件 - 添加activeScreen自动切换
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.screenId !== AppState.activeScreen) {
                AppState.setActiveScreen(this.screenId);
            }
            this.handleCanvasMouseDown(e);
        });
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));
        this.canvas.addEventListener('mousemove', (e) => this.updateCoordinates(e));
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const pos = this.getMousePos(e);
            const imageInfo = this.getImageAtPosition(pos);
            if (imageInfo) {
                this.contextMenuHandled = true;
                this.showContextMenu(e.clientX, e.clientY, {
                    node: imageInfo.node,
                    imageInfo,
                    allowCopyText: false
                });
            }
            // 未命中图片则等 mouseup 统一处理节点/文本
        });

        // 添加 window 级别的 mouseup 监听器，防止鼠标拖拽到屏幕外时无法释放
        window.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));
        // 添加 mouseleave 监听器，当鼠标离开文档时也释放拖拽状态
        document.addEventListener('mouseleave', (e) => this.handleCanvasMouseUp(e));

        // 触摸板双指滑动/滚轮平移画布
        this.canvas.addEventListener('wheel', (e) => {
            // 检查是否锁定画布
            const lockCheckbox = document.getElementById('lockCanvasCheckbox');
            const isLocked = lockCheckbox && lockCheckbox.checked;

            // 如果锁定画布，禁用所有滚轮/触摸板操作
            if (isLocked) {
                e.preventDefault();
                return;
            }

            // 如果按住 Cmd/Ctrl 键，执行缩放操作
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();

                // 获取鼠标位置（相对于画布）
                const rect = this.canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // 计算缩放前鼠标在画布坐标系中的位置
                const worldX = (mouseX - this.panX) / this.zoom;
                const worldY = (mouseY - this.panY) / this.zoom;

                // 根据滚轮方向计算缩放因子
                // 优先使用 deltaX（水平滚动，如苹果鼠标左右滑动）
                // 如果没有水平滚动，则使用 deltaY（垂直滚动）
                let zoomFactor;
                if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                    // 水平滚动：左滑（deltaX > 0）缩小，右滑（deltaX < 0）放大
                    zoomFactor = e.deltaX > 0 ? 0.9 : 1.1;
                } else {
                    // 垂直滚动：向上（deltaY < 0）放大，向下（deltaY > 0）缩小
                    zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
                }
                const oldZoom = this.zoom;

                // 应用缩放
                this.zoom *= zoomFactor;
                this.zoom = Math.max(0.01, Math.min(20, this.zoom));

                // 调整平移，使鼠标位置保持不变
                this.panX = mouseX - worldX * this.zoom;
                this.panY = mouseY - worldY * this.zoom;

                this.draw();
                this.updateEditorPosition();
                this.showMinimap();

                return;
            }

            // 用于平移画布
            e.preventDefault();
            this.panX -= e.deltaX;
            this.panY -= e.deltaY;
            this.draw();
            this.updateEditorPosition();

            // 显示小地图
            this.showMinimap();
        }, { passive: false });

        // 触摸事件 - 双指缩放支持
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                // 检查是否锁定画布
                const lockCheckbox = document.getElementById('lockCanvasCheckbox');
                const isLocked = lockCheckbox && lockCheckbox.checked;
                if (isLocked) {
                    e.preventDefault();
                    return;
                }

                e.preventDefault();

                // 计算两个触摸点之间的距离
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const dx = touch2.clientX - touch1.clientX;
                const dy = touch2.clientY - touch1.clientY;
                this.lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
                this.touchStartZoom = this.zoom;

                // 计算两个触摸点的中心位置
                const rect = this.canvas.getBoundingClientRect();
                this.touchCenterX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
                this.touchCenterY = (touch1.clientY + touch2.clientY) / 2 - rect.top;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && this.lastTouchDistance !== null) {
                // 检查是否锁定画布
                const lockCheckbox = document.getElementById('lockCanvasCheckbox');
                const isLocked = lockCheckbox && lockCheckbox.checked;
                if (isLocked) {
                    e.preventDefault();
                    return;
                }

                e.preventDefault();

                // 计算当前两个触摸点之间的距离
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const dx = touch2.clientX - touch1.clientX;
                const dy = touch2.clientY - touch1.clientY;
                const currentDistance = Math.sqrt(dx * dx + dy * dy);

                // 计算缩放比例
                const scale = currentDistance / this.lastTouchDistance;

                // 计算缩放前触摸中心在画布坐标系中的位置
                const worldX = (this.touchCenterX - this.panX) / this.zoom;
                const worldY = (this.touchCenterY - this.panY) / this.zoom;

                // 应用缩放
                this.zoom = this.touchStartZoom * scale;
                this.zoom = Math.max(0.01, Math.min(20, this.zoom));

                // 调整平移，使触摸中心位置保持不变
                this.panX = this.touchCenterX - worldX * this.zoom;
                this.panY = this.touchCenterY - worldY * this.zoom;

                this.draw();
                this.updateEditorPosition();
                this.showMinimap();
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                this.lastTouchDistance = null;
                this.touchStartZoom = null;
                this.touchCenterX = null;
                this.touchCenterY = null;
            }
        }, { passive: false });

        // 双击事件 - 编辑节点或创建新节点
        this.canvas.addEventListener('dblclick', (e) => {
            const pos = this.getMousePos(e);
            const clickedNode = this.getNodeAt(pos);
            if (clickedNode) {
                // 检查是否按住了 Cmd/Ctrl 键
                const isCmdOrCtrlPressed = e.metaKey || e.ctrlKey;

                // 检查是否为页面链接节点
                if (clickedNode.isPageLink) {
                    // 双击页面链接节点 → 导航到目标页面
                    this.navigateToPageLink(clickedNode);
                    return;
                }

                // 检查是否为链接类型节点
                const linkItem = clickedNode.content.find(item => item.type === 'link');

                if (linkItem && linkItem.url && isCmdOrCtrlPressed) {
                    // 按住 Cmd/Ctrl + 双击链接节点 → 打开URL
                    console.log('[双击] Cmd/Ctrl + 双击，打开链接:', linkItem.url);
                    window.open(linkItem.url, '_blank');
                } else {
                    // 正常双击 → 编辑模式（即使是链接节点）
                    this.startNodeEditing(clickedNode);
                }
            } else {
                // 双击空白处，创建新节点并进入编辑模式
                const newNode = this.addNodeAt(pos, true);  // skipPrompt = true
                if (newNode) {
                    // 使用 setTimeout 确保节点创建完成后再进入编辑
                    setTimeout(() => {
                        this.startNodeEditing(newNode);
                    }, 0);
                }
            }
        });

        // 粘贴事件 - 支持粘贴图片到节点
        if (this.screenId === 'left') {  // 只绑定一次
            document.addEventListener('paste', (e) => {
                console.log('[粘贴事件] 触发paste事件');

                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (!activeApp) {
                    console.log('[粘贴事件] 没有活动应用');
                    return;
                }

                // 检查焦点是否在输入框中
                const activeElement = document.activeElement;
                const isInputFocused = activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                );

                // 检查剪贴板中是否有图片
                const items = e.clipboardData && e.clipboardData.items;
                const files = e.clipboardData && e.clipboardData.files;

                const findImageFile = () => {
                    if (items && items.length) {
                        for (let i = 0; i < items.length; i++) {
                            if (items[i].type && items[i].type.indexOf('image') !== -1) {
                                const f = items[i].getAsFile();
                                if (f) return f;
                            }
                        }
                    }
                    if (files && files.length) {
                        for (let i = 0; i < files.length; i++) {
                            if (files[i].type && files[i].type.indexOf('image') !== -1) {
                                return files[i];
                            }
                        }
                    }
                    return null;
                };

                const imageFile = findImageFile();

                // 先检查是否有图片
                const hasImage = !!imageFile;

                // 如果在普通输入框中（非编辑器）且没有图片，让浏览器正常处理
                if (isInputFocused && !hasImage) {
                    console.log('[粘贴事件] 焦点在输入框且无图片，跳过');
                    return;
                }

                // 如果在编辑器中且有图片，或者不在输入框中且有图片，处理图片粘贴
                if (imageFile) {
                    console.log('[粘贴事件] 发现图片，准备处理');
                    e.preventDefault();
                    const file = imageFile;
                    console.log('[粘贴事件] 图片文件大小:', (file.size / 1024).toFixed(2), 'KB');

                    // 如果在编辑状态下（editTextDiv存在且是contentEditable），直接插入图片到编辑器
                    if (activeApp.editTextDiv && activeApp.editingNode) {
                        console.log('[粘贴事件] 检测到编辑状态，在编辑器中粘贴图片');
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            console.log('[粘贴事件] FileReader完成，调用insertImage');
                            activeApp.insertImage(ev.target.result);
                        };
                        reader.onerror = () => {
                            console.error('[粘贴事件] FileReader错误');
                        };
                        reader.readAsDataURL(file);
                    } else {
                        // 否则创建新节点
                        console.log('[粘贴事件] 不在编辑状态，创建新节点');
                        activeApp.handleImagePaste(file);
                    }
                    return;
                }

                // 没有图片，检查是否有文本（可能是URL）
                console.log('[粘贴事件] 未找到图片数据，检查文本');
                
                // 如果焦点在输入框中，让浏览器正常处理
                if (isInputFocused) {
                    console.log('[粘贴事件] 焦点在输入框，由浏览器处理');
                    return;
                }
                
                // 检查是否有文本数据
                const textData = e.clipboardData.getData('text/plain');
                if (textData && textData.trim()) {
                    console.log('[粘贴事件] 发现文本数据:', textData.substring(0, 50));
                    
                    // 检查是否为URL
                    const url = extractURLFromText(textData.trim());
                    if (url) {
                        console.log('[粘贴事件] 检测到URL，创建链接节点:', url);
                        e.preventDefault();
                        
                        // 在画布中心创建节点
                        const centerX = (-activeApp.panX + activeApp.canvas.width / 2) / activeApp.zoom;
                        const centerY = (-activeApp.panY + activeApp.canvas.height / 2) / activeApp.zoom;

                        // 获取默认节点大小
                        const defaultWidth = parseInt(localStorage.getItem('mindmap_default_node_width')) || 150;
                        const defaultHeight = parseInt(localStorage.getItem('mindmap_default_node_height')) || 50;

                        // 创建临时节点显示URL
                        const newNode = {
                            id: Date.now() + Math.random(),
                            content: [{ type: 'text', value: textData.trim() }],
                            x: centerX - defaultWidth / 2,
                            y: centerY - defaultHeight / 2,
                            width: defaultWidth,
                            height: defaultHeight,
                            color: activeApp.currentColor || '#e8f0fe',
                            textColor: activeApp.currentTextColor || '#1f2937',
                            fontSize: activeApp.currentFontSize || 13,
                            textAlign: 'center',
                            shape: activeApp.currentShape || 'rounded-rect',
                            properties: ''
                        };
                        
                        activeApp.nodes.push(newNode);
                        activeApp.selectNode(newNode);
                        activeApp.draw();
                        activeApp.saveToLocalStorage();
                        
                        // 异步获取元数据
                        (async () => {
                            try {
                                console.log('[粘贴URL] 开始获取元数据...');
                                const metadata = await fetchURLMetadata(url);
                                console.log('[粘贴URL] 获取到元数据:', metadata);
                                
                                if (metadata && metadata.title) {
                                    // 更新为链接类型
                                    newNode.content = [{
                                        type: 'link',
                                        url: metadata.url,
                                        title: metadata.title,
                                        description: metadata.description || ''
                                    }];
                                } else {
                                    console.log('[粘贴URL] 未获取到标题，使用域名作为标题');
                                    let fallbackTitle = url;
                                    try {
                                        const urlObj = new URL(url);
                                        fallbackTitle = urlObj.hostname;
                                    } catch (e) {}
                                    newNode.content = [{
                                        type: 'link',
                                        url: url,
                                        title: fallbackTitle,
                                        description: ''
                                    }];
                                }

                                // 自动调整节点大小
                                activeApp.autoFitNodeSize(newNode);
                                activeApp.saveToLocalStorage();
                                activeApp.draw();
                                console.log('[粘贴URL] 节点已更新为链接类型');
                            } catch (error) {
                                console.error('[粘贴URL] 获取元数据失败:', error);
                                // 发生错误时仍然创建link类型
                                let fallbackTitle = url;
                                try {
                                    const urlObj = new URL(url);
                                    fallbackTitle = urlObj.hostname;
                                } catch (e) {}
                                newNode.content = [{
                                    type: 'link',
                                    url: url,
                                    title: fallbackTitle,
                                    description: ''
                                }];
                                activeApp.autoFitNodeSize(newNode);
                                activeApp.saveToLocalStorage();
                                activeApp.draw();
                            }
                        })();
                    } else {
                        // 不是URL，创建普通文本节点
                        console.log('[粘贴事件] 不是URL，创建文本节点');
                        e.preventDefault();

                        const centerX = (-activeApp.panX + activeApp.canvas.width / 2) / activeApp.zoom;
                        const centerY = (-activeApp.panY + activeApp.canvas.height / 2) / activeApp.zoom;

                        // 获取默认节点大小
                        const defaultWidth = parseInt(localStorage.getItem('mindmap_default_node_width')) || 100;
                        const defaultHeight = parseInt(localStorage.getItem('mindmap_default_node_height')) || 40;

                        const newNode = {
                            id: Date.now() + Math.random(),
                            content: [{ type: 'text', value: textData.trim() }],
                            x: centerX - defaultWidth / 2,
                            y: centerY - defaultHeight / 2,
                            width: defaultWidth,
                            height: defaultHeight,
                            color: activeApp.currentColor || '#e8f0fe',
                            textColor: activeApp.currentTextColor || '#1f2937',
                            fontSize: activeApp.currentFontSize || 13,
                            textAlign: 'center',
                            shape: activeApp.currentShape || 'rounded-rect',
                            properties: ''
                        };
                        
                        activeApp.nodes.push(newNode);
                        activeApp.autoFitNodeSize(newNode);
                        activeApp.selectNode(newNode);
                        activeApp.draw();
                        activeApp.saveToLocalStorage();
                    }
                }
            });
        }

        // 颜色选择 - 共享事件
        if (this.screenId === 'left') {  // 只绑定一次
            // 创建节点的颜色选择器（排除编辑面板中的）
            document.querySelectorAll('#nodeColorPicker .color-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    const parentPicker = e.target.closest('.color-picker');
                    parentPicker.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
                    e.target.classList.add('selected');
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp) {
                        activeApp.currentColor = e.target.getAttribute('data-color');
                        localStorage.setItem('mindmap_default_node_color', activeApp.currentColor);
                    }
                });
            });
            const defaultColor = localStorage.getItem('mindmap_default_node_color');
            if (defaultColor) {
                const colorOptions = document.querySelectorAll('#nodeColorPicker .color-option');
                colorOptions.forEach(opt => {
                    const isSelected = opt.getAttribute('data-color') === defaultColor;
                    opt.classList.toggle('selected', isSelected);
                });
            }

            // 默认文字颜色选择器
            document.querySelectorAll('#textColorPicker .color-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    const picker = document.getElementById('textColorPicker');
                    picker.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
                    e.target.classList.add('selected');
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) {
                    activeApp.currentTextColor = e.target.getAttribute('data-color');
                    localStorage.setItem('mindmap_default_text_color', activeApp.currentTextColor);
                }
            });
            });
            const defaultTextColor = localStorage.getItem('mindmap_default_text_color');
            if (defaultTextColor) {
                const textOptions = document.querySelectorAll('#textColorPicker .color-option');
                textOptions.forEach(opt => {
                    const isSelected = opt.getAttribute('data-color') === defaultTextColor;
                    opt.classList.toggle('selected', isSelected);
                });
            }

            // 编辑节点的颜色选择器 - 实时更新
            document.querySelectorAll('#editColorPicker .color-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    const editColorPicker = document.getElementById('editColorPicker');
                    editColorPicker.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
                    e.target.classList.add('selected');

                    // 实时更新选中节点的颜色
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp && activeApp.selectedNode) {
                        activeApp.selectedNode.color = e.target.getAttribute('data-color');
                        activeApp.saveToLocalStorage();
                        activeApp.draw();
                    }
                });
            });

            // 编辑节点文字颜色选择器 - 实时更新
            document.querySelectorAll('#editTextColorPicker .color-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    const editTextColorPicker = document.getElementById('editTextColorPicker');
                    editTextColorPicker.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
                    e.target.classList.add('selected');

                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp && activeApp.selectedNode) {
                        activeApp.selectedNode.textColor = e.target.getAttribute('data-color');
                        activeApp.saveToLocalStorage();
                        activeApp.draw();
                    }
                });
            });

            // 字体大小输入 - 共享事件
            document.getElementById('nodeFontSize').addEventListener('input', (e) => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val > 0) {
                        activeApp.currentFontSize = val;
                        localStorage.setItem('mindmap_default_font_size', val);
                    }
                }
            });
            const savedFontSize = localStorage.getItem('mindmap_default_font_size');
            if (savedFontSize) {
                const fontSizeInput = document.getElementById('nodeFontSize');
                if (fontSizeInput) {
                    fontSizeInput.value = savedFontSize;
                }
            }

            // 文本对齐选择
            const nodeTextAlignSelect = document.getElementById('nodeTextAlign');
            if (nodeTextAlignSelect) {
                const savedAlign = localStorage.getItem('mindmap_default_node_align');
                if (savedAlign) {
                    nodeTextAlignSelect.value = savedAlign;
                }
                nodeTextAlignSelect.addEventListener('change', (e) => {
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp) {
                        activeApp.currentTextAlign = e.target.value || 'center';
                        localStorage.setItem('mindmap_default_node_align', activeApp.currentTextAlign);
                    }
                });
            }

            // 快捷文本对齐按钮
            const alignButtons = [
                { id: 'editAlignLeft', value: 'left' },
                { id: 'editAlignCenter', value: 'center' },
                { id: 'editAlignRight', value: 'right' }
            ];
            alignButtons.forEach(btn => {
                const el = document.getElementById(btn.id);
                if (el) {
                    el.addEventListener('click', () => {
                        const select = document.getElementById('editTextAlign');
                        if (select && !select.disabled) {
                            select.value = btn.value;
                            select.dispatchEvent(new Event('change'));
                        }
                    });
                }
            });

            document.getElementById('editFontSize').addEventListener('change', (e) => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp && activeApp.selectedNode) {
                    activeApp.selectedNode.fontSize = parseInt(e.target.value) || 13;
                    activeApp.saveToLocalStorage();
                    activeApp.draw();
                }
            });

            const editCodeMode = document.getElementById('editCodeMode');
            if (editCodeMode) {
                editCodeMode.addEventListener('change', (e) => {
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp && activeApp.selectedNode) {
                        activeApp.selectedNode.codeMode = !!e.target.checked;
                        activeApp.saveToLocalStorage();
                        activeApp.draw();
                    }
                });
            }

            const editCodeLanguage = document.getElementById('editCodeLanguage');
            if (editCodeLanguage) {
                editCodeLanguage.addEventListener('change', (e) => {
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp && activeApp.selectedNode) {
                        const value = e.target.value || 'auto';
                        activeApp.selectedNode.codeLanguage = value;
                        activeApp.saveToLocalStorage();
                        activeApp.draw();
                    }
                });
            }

            // 节点形状选择 - 共享事件
            document.getElementById('nodeShape').addEventListener('change', (e) => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) {
                    activeApp.currentShape = e.target.value || 'rounded-rect';
                    localStorage.setItem('mindmap_default_node_shape', activeApp.currentShape);
                }
            });
            const savedShape = localStorage.getItem('mindmap_default_node_shape');
            const nodeShapeSelect = document.getElementById('nodeShape');
            if (savedShape && nodeShapeSelect) {
                nodeShapeSelect.value = savedShape;
            }

            document.getElementById('editNodeShape').addEventListener('change', (e) => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp && activeApp.selectedNode) {
                    activeApp.selectedNode.shape = e.target.value || 'rounded-rect';
                    activeApp.saveToLocalStorage();
                    activeApp.draw();
                }
            });

            // 等比例改变字体checkbox - 共享事件
            const proportionalCheckbox = document.getElementById('proportionalFontSize');
            if (proportionalCheckbox) {
                const savedProportional = localStorage.getItem('mindmap_setting_proportional_font');
                if (savedProportional !== null) {
                    proportionalCheckbox.checked = savedProportional === 'true';
                }
                proportionalCheckbox.addEventListener('change', (e) => {
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp) {
                        activeApp.proportionalFontSize = e.target.checked;
                        localStorage.setItem('mindmap_setting_proportional_font', e.target.checked ? 'true' : 'false');
                    }
                });
            }

            // 边距模式选择器 - 共享事件
            const paddingModeSelect = document.getElementById('paddingMode');
            if (paddingModeSelect) {
                const savedPadding = localStorage.getItem('mindmap_default_padding_mode');
                if (savedPadding) {
                    paddingModeSelect.value = savedPadding;
                }
                const applyPadding = (mode) => {
                    localStorage.setItem('mindmap_default_padding_mode', mode);
                    if (AppState.appLeft) {
                        AppState.appLeft.setPaddingMode(mode);
                    }
                    if (AppState.appRight) {
                        AppState.appRight.setPaddingMode(mode);
                    }
                };
                paddingModeSelect.addEventListener('change', (e) => {
                    const mode = e.target.value;
                    applyPadding(mode);
                });
                if (savedPadding) {
                    applyPadding(savedPadding);
                }
            }

            // 自动适应文本、拖拽移动子节点、快速删除等默认设置
            const autoFitCheckbox = document.getElementById('autoFitText');
            if (autoFitCheckbox) {
                const savedAutoFit = localStorage.getItem('mindmap_setting_auto_fit_text');
                if (savedAutoFit !== null) {
                    autoFitCheckbox.checked = savedAutoFit === 'true';
                }
                autoFitCheckbox.addEventListener('change', (e) => {
                    localStorage.setItem('mindmap_setting_auto_fit_text', e.target.checked ? 'true' : 'false');
                });
            }

            const moveChildrenCheckbox = document.getElementById('moveChildrenWithParent');
            if (moveChildrenCheckbox) {
                const savedMove = localStorage.getItem('mindmap_setting_move_children_with_parent');
                if (savedMove !== null) {
                    moveChildrenCheckbox.checked = savedMove === 'true';
                }
                moveChildrenCheckbox.addEventListener('change', (e) => {
                    localStorage.setItem('mindmap_setting_move_children_with_parent', e.target.checked ? 'true' : 'false');
                });
            }

            const quickDeleteCheckbox = document.getElementById('quickDelete');
            if (quickDeleteCheckbox) {
                const savedQuickDelete = localStorage.getItem('mindmap_setting_quick_delete');
                if (savedQuickDelete !== null) {
                    quickDeleteCheckbox.checked = savedQuickDelete === 'true';
                }
                quickDeleteCheckbox.addEventListener('change', (e) => {
                    localStorage.setItem('mindmap_setting_quick_delete', e.target.checked ? 'true' : 'false');
                });
            }

            // 默认节点宽度和高度设置
            const defaultNodeWidthInput = document.getElementById('defaultNodeWidth');
            if (defaultNodeWidthInput) {
                const savedWidth = localStorage.getItem('mindmap_default_node_width');
                if (savedWidth !== null) {
                    defaultNodeWidthInput.value = savedWidth;
                }
                defaultNodeWidthInput.addEventListener('change', (e) => {
                    const value = parseInt(e.target.value);
                    if (value >= 50 && value <= 500) {
                        localStorage.setItem('mindmap_default_node_width', value);
                    }
                });
            }

            const defaultNodeHeightInput = document.getElementById('defaultNodeHeight');
            if (defaultNodeHeightInput) {
                const savedHeight = localStorage.getItem('mindmap_default_node_height');
                if (savedHeight !== null) {
                    defaultNodeHeightInput.value = savedHeight;
                }
                defaultNodeHeightInput.addEventListener('change', (e) => {
                    const value = parseInt(e.target.value);
                    if (value >= 30 && value <= 500) {
                        localStorage.setItem('mindmap_default_node_height', value);
                    }
                });
            }

            // 侧边栏按钮事件 - 共享事件
            document.getElementById('addNodeBtn').addEventListener('click', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) activeApp.addNode();
            });

            document.getElementById('deleteNodeBtn').addEventListener('click', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) activeApp.deleteSelectedNode();
            });

            // 实时更新选中节点的文本
            document.getElementById('editText').addEventListener('input', async () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp && activeApp.selectedNode) {
                    const newText = document.getElementById('editText').value;

                    // 检测是否为URL
                    const url = extractURLFromText(newText);
                    if (url) {
                        console.log('[编辑节点] 检测到URL:', url);

                        // 先显示URL作为临时文本，避免节点显示为空
                        let textItem = activeApp.selectedNode.content.find(item => item.type === 'text');
                        if (textItem) {
                            textItem.value = newText;
                        } else {
                            // 移除link类型，先添加临时text
                            activeApp.selectedNode.content = activeApp.selectedNode.content.filter(item => item.type !== 'link');
                            activeApp.selectedNode.content.unshift({ type: 'text', value: newText });
                        }
                        activeApp.draw();

                        // 异步获取元数据
                        try {
                            const metadata = await fetchURLMetadata(url);
                            if (metadata && metadata.title) {
                                console.log('[编辑节点] 获取到元数据:', metadata);
                                // 查找并更新或添加link类型内容
                                const linkItem = activeApp.selectedNode.content.find(item => item.type === 'link');
                                if (linkItem) {
                                    linkItem.url = metadata.url;
                                    linkItem.title = metadata.title;
                                    linkItem.description = metadata.description || '';
                                } else {
                                    // 移除临时text，添加link内容
                                    activeApp.selectedNode.content = activeApp.selectedNode.content.filter(item => item.type !== 'text');
                                    activeApp.selectedNode.content.unshift({
                                        type: 'link',
                                        url: metadata.url,
                                        title: metadata.title,
                                        description: metadata.description || ''
                                    });
                                }
                                activeApp.saveToLocalStorage();
                                activeApp.draw();
                            } else {
                                console.log('[编辑节点] 元数据获取失败或无标题，保持显示URL');
                                // 保持URL文本显示
                            }
                        } catch (error) {
                            console.error('[编辑节点] 元数据获取错误:', error);
                            // 发生错误时保持显示URL文本
                        }
                    } else {
                        // 不是URL，作为普通文本处理
                        let textItem = activeApp.selectedNode.content.find(item => item.type === 'text');
                        if (textItem) {
                            textItem.value = newText;
                        } else {
                            // 移除link类型，添加text
                            activeApp.selectedNode.content = activeApp.selectedNode.content.filter(item => item.type !== 'link');
                            activeApp.selectedNode.content.unshift({ type: 'text', value: newText });
                        }
                    }

                    // 检查是否需要自动适应文本（跳过被锁定的节点）
                    const autoFitCheckbox = document.getElementById('autoFitText');
                    if (autoFitCheckbox && autoFitCheckbox.checked && !activeApp.selectedNode.locked) {
                        activeApp.autoFitNodeSize(activeApp.selectedNode);
                    }

                    activeApp.saveToLocalStorage();
                    activeApp.draw();
                }
            });

            // 实时更新选中节点的字体大小
            document.getElementById('editFontSize').addEventListener('input', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp && activeApp.selectedNode) {
                    const newFontSize = parseInt(document.getElementById('editFontSize').value);
                    if (newFontSize && newFontSize >= 10 && newFontSize <= 32) {
                        activeApp.selectedNode.fontSize = newFontSize;

                        // 检查是否需要自动适应文本（跳过被锁定的节点）
                        const autoFitCheckbox = document.getElementById('autoFitText');
                        if (autoFitCheckbox && autoFitCheckbox.checked && !activeApp.selectedNode.locked) {
                            activeApp.autoFitNodeSize(activeApp.selectedNode);
                        }

                        activeApp.saveToLocalStorage();
                        activeApp.draw();
                    }
                }
            });

            // 实时更新选中节点的文本对齐
            document.getElementById('editTextAlign').addEventListener('change', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp && activeApp.selectedNode) {
                    activeApp.selectedNode.textAlign = document.getElementById('editTextAlign').value;
                    activeApp.saveToLocalStorage();
                    activeApp.draw();
                }
            });

            // 实时更新选中节点的宽度
            const editNodeWidth = document.getElementById('editNodeWidth');
            if (editNodeWidth) {
                editNodeWidth.addEventListener('input', () => {
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp && activeApp.selectedNode) {
                        const newWidth = parseInt(editNodeWidth.value);
                        if (newWidth && newWidth >= 50 && newWidth <= 1000) {
                            activeApp.selectedNode.width = newWidth;
                            activeApp.clearNodeTextCache(activeApp.selectedNode.id);
                            activeApp.saveToLocalStorage();
                            activeApp.draw();
                        }
                    }
                });
            }

            // 实时更新选中节点的高度
            const editNodeHeight = document.getElementById('editNodeHeight');
            if (editNodeHeight) {
                editNodeHeight.addEventListener('input', () => {
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp && activeApp.selectedNode) {
                        const newHeight = parseInt(editNodeHeight.value);
                        if (newHeight && newHeight >= 30 && newHeight <= 1000) {
                            activeApp.selectedNode.height = newHeight;
                            activeApp.clearNodeTextCache(activeApp.selectedNode.id);
                            activeApp.saveToLocalStorage();
                            activeApp.draw();
                        }
                    }
                });
            }

            // 节点锁定状态切换
            document.getElementById('nodeLocked').addEventListener('change', (e) => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp && activeApp.selectedNode) {
                    activeApp.selectedNode.locked = e.target.checked;
                    activeApp.saveToLocalStorage();
                    console.log(`[节点锁定] 节点 ${activeApp.selectedNode.id} 锁定状态: ${e.target.checked}`);
                }
            });

            // 节点属性面板展开/折叠按钮
            document.getElementById('togglePropertiesBtn').addEventListener('click', () => {
                const content = document.getElementById('propertiesContent');
                const icon = document.getElementById('togglePropertiesIcon');
                const btn = document.getElementById('togglePropertiesBtn');

                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.textContent = '▲';
                    btn.childNodes[1].textContent = ' 收起';
                } else {
                    content.style.display = 'none';
                    icon.textContent = '▼';
                    btn.childNodes[1].textContent = ' 展开';
                }
            });

            // 节点属性输入事件
            document.getElementById('nodeProperties').addEventListener('input', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp && activeApp.selectedNode) {
                    activeApp.selectedNode.properties = document.getElementById('nodeProperties').value;
                    activeApp.saveToLocalStorage();
                }
            });

            // 头部按钮事件 - 共享事件
            document.getElementById('newBtn').addEventListener('click', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) activeApp.newMindMap();
            });

            document.getElementById('saveBtn').addEventListener('click', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) {
                    activeApp.saveOrSaveAs();
                }
            });

            document.getElementById('saveAsBtn').addEventListener('click', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) {
                    activeApp.showSaveModal(true); // true for 'Save As'
                }
            });

            document.getElementById('renameBtn').addEventListener('click', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) {
                    activeApp.renameFile();
                }
            });

            document.getElementById('loadBtn').addEventListener('click', () => {
                // 打开文件选择器
                const fileInput = document.getElementById('fileInput');
                fileInput.onchange = (e) => {
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp) {
                        const file = e.target.files[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                try {
                                    const data = JSON.parse(event.target.result);
                                    activeApp.loadFileData(data, file.name.replace('.json', ''));
                                } catch (err) {
                                    alert('文件格式错误: ' + err.message);
                                }
                            };
                            reader.readAsText(file);
                        }
                    }
                    // 重置输入框以便再次选择同一文件
                    fileInput.value = '';
                };
                fileInput.click();
            });

            document.getElementById('loadHtmlBtn').addEventListener('click', () => {
                const fileInput = document.getElementById('fileInput');
                fileInput.onchange = async (e) => {
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp) {
                        const file = e.target.files[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = async (event) => {
                                try {
                                    const text = event.target.result;
                                    const parsed = parseExportedHTML(text);
                                    if (!parsed) throw new Error('无法从HTML中解析数据');
                                    const proposed = file.name.replace(/\\.html?$/i, '') || '导入HTML';
                                    const existingNames = new Set(activeApp.listSavedFiles().map(f => f.name));
                                    let decision = { mode: 'new', name: proposed };
                                    if (existingNames.has(proposed)) {
                                        decision = await showImportConflictDialog(proposed, existingNames);
                                    }
                                    const finalName = decision.mode === 'overwrite'
                                        ? proposed
                                        : getUniqueFileName(decision.name || proposed, existingNames);

                                    activeApp.importExternalData(parsed, finalName);
                                    activeApp.saveFile(finalName);
                                    alert(`导入成功: ${finalName}${decision.mode === 'overwrite' ? '（已覆盖）' : ''}`);
                                } catch (err) {
                                    console.error('[导入HTML失败]', err);
                                    alert('导入HTML失败: ' + err.message);
                                }
                            };
                            reader.readAsText(file);
                        }
                    }
                    fileInput.value = '';
                };
                fileInput.click();
            });

            document.getElementById('exportImageBtn').addEventListener('click', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) activeApp.exportAsImage();
            });

            document.getElementById('exportJsonBtn').addEventListener('click', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) activeApp.exportFileAsJSON();
            });

            document.getElementById('exportEditableHtmlBtn').addEventListener('click', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) activeApp.exportAsEditableHTML();
            });

            document.getElementById('fitViewBtn').addEventListener('click', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) activeApp.fitToView();
            });

            document.getElementById('fileManagerBtn').addEventListener('click', () => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (activeApp) activeApp.showFileManager();
            });

            // 文件搜索功能
            const fileSearchInput = document.getElementById('fileSearchInput');
            if (fileSearchInput) {
                fileSearchInput.addEventListener('input', (e) => {
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp) {
                        activeApp.updateSidebarFileList(e.target.value);
                    }
                });
            }

            // 文件排序选择
            const fileSortSelect = document.getElementById('fileSortSelect');
            if (fileSortSelect) {
                fileSortSelect.addEventListener('change', (e) => {
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp) {
                        activeApp.fileSortBy = e.target.value;
                        const searchTerm = fileSearchInput ? fileSearchInput.value : '';
                        activeApp.updateSidebarFileList(searchTerm);
                        // 同步文件管理弹窗的排序选择
                        const fileManagerSortSelect = document.getElementById('fileManagerSortSelect');
                        if (fileManagerSortSelect) {
                            fileManagerSortSelect.value = e.target.value;
                        }
                    }
                });
            }

            // 文件排序方向切换
            const fileSortOrderBtn = document.getElementById('fileSortOrderBtn');
            if (fileSortOrderBtn) {
                fileSortOrderBtn.addEventListener('click', () => {
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp) {
                        activeApp.fileSortOrder = activeApp.fileSortOrder === 'asc' ? 'desc' : 'asc';
                        fileSortOrderBtn.textContent = activeApp.fileSortOrder === 'asc' ? '↑' : '↓';
                        const searchTerm = fileSearchInput ? fileSearchInput.value : '';
                        activeApp.updateSidebarFileList(searchTerm);
                        // 同步文件管理弹窗的排序按钮
                        const fileManagerSortOrderBtn = document.getElementById('fileManagerSortOrderBtn');
                        if (fileManagerSortOrderBtn) {
                            fileManagerSortOrderBtn.textContent = activeApp.fileSortOrder === 'asc' ? '↑' : '↓';
                        }
                    }
                });
            }

            // 文件列表刷新
            const fileListRefreshBtn = document.getElementById('fileListRefreshBtn');
            if (fileListRefreshBtn) {
                fileListRefreshBtn.addEventListener('click', () => {
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (!activeApp) return;

                    const updateLists = () => {
                        const searchTerm = fileSearchInput ? fileSearchInput.value : '';
                        activeApp.updateSidebarFileList(searchTerm);

                        const managerSearchInput = document.getElementById('fileManagerSearchInput');
                        const managerSearchTerm = managerSearchInput ? managerSearchInput.value : '';
                        activeApp.updateFileManagerList(managerSearchTerm);
                    };

                    const originalText = fileListRefreshBtn.textContent;
                    fileListRefreshBtn.disabled = true;
                    fileListRefreshBtn.textContent = '刷新中...';

                    if (window.storageAdapter && typeof window.storageAdapter.refreshFromServer === 'function') {
                        window.storageAdapter.refreshFromServer({ allowDeleteLocal: true })
                            .then(updateLists)
                            .catch(updateLists)
                            .finally(() => {
                                fileListRefreshBtn.disabled = false;
                                fileListRefreshBtn.textContent = originalText;
                            });
                    } else {
                        updateLists();
                        fileListRefreshBtn.disabled = false;
                        fileListRefreshBtn.textContent = originalText;
                    }
                });
            }

            // Node search functionality
            const nodeSearchInput = document.getElementById('nodeSearchInput');
            const searchResults = document.getElementById('searchResults');

            if (nodeSearchInput && searchResults) {
                nodeSearchInput.addEventListener('input', () => {
                    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                    if (activeApp) {
                        const query = nodeSearchInput.value;
                        if (query.trim() === '') {
                            activeApp.updateSearchResults([]);
                            return;
                        }
                        const results = activeApp.searchNodes(query);
                        activeApp.updateSearchResults(results);
                    }
                });

                nodeSearchInput.addEventListener('focus', () => {
                    if (searchResults.children.length > 0) {
                        searchResults.classList.add('active');
                    }
                });

                document.addEventListener('mousedown', (event) => {
                    const isClickInsideSearch = nodeSearchInput.contains(event.target) || searchResults.contains(event.target);
                    if (!isClickInsideSearch) {
                        searchResults.classList.remove('active');
                    }
                });
            }

            // 初始加载文件列表
            this.updateSidebarFileList();

            // 全屏显示按钮 - 全局（通过ModeController处理，保存状态）
            const fullscreenViewBtn = document.getElementById('fullscreenViewBtn');
            if (fullscreenViewBtn) {
                fullscreenViewBtn.addEventListener('click', () => {
                    modeController.toggleFullscreenView();
                });
            }

            // 键盘事件 - 全局
            document.addEventListener('keydown', (e) => {
                const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
                if (!activeApp) return;

                // Cmd+F (Mac) 或 Ctrl+F (Windows/Linux) - 聚焦搜索框
                if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                    e.preventDefault(); // 阻止浏览器默认的查找行为
                    const searchInput = document.getElementById('nodeSearchInput');
                    if (searchInput) {
                        searchInput.focus();
                        searchInput.select(); // 选中已有的搜索文本，方便直接输入新内容
                    }
                    return;
                }

                // Cmd+S (Mac) 或 Ctrl+S (Windows/Linux) - 快速保存
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault(); // 阻止浏览器默认的保存行为
                    activeApp.saveOrSaveAs();
                    return;
                }

                // Cmd+A (Mac) 或 Ctrl+A (Windows/Linux) - 全选节点
                if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                    // 检查是否在编辑模式
                    const activeElement = document.activeElement;
                    const isInputFocused = activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    );

                    // 如果正在编辑节点或焦点在输入框中，让浏览器正常处理全选
                    if (isInputFocused || activeApp.editingNode) {
                        return;
                    }

                    // 否则选中所有节点
                    e.preventDefault();
                    activeApp.selectAllNodes();
                    return;
                }

                // Cmd+C (Mac) 或 Ctrl+C (Windows/Linux) - 复制节点或选中的文本
                if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
                    // 检查焦点是否在输入框中
                    const activeElement = document.activeElement;
                    const isInputFocused = activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    );

                    // 如果焦点在输入框中，让浏览器正常处理复制
                    if (isInputFocused) {
                        return;
                    }

                    // 如果有文本选择，复制选中的文本
                    if (activeApp.textSelectionNode) {
                        e.preventDefault();
                        activeApp.copySelectedText();
                        activeApp.hideContextMenu();
                        return;
                    }

                    // 否则复制节点
                    e.preventDefault();
                    activeApp.copyNode();
                    return;
                }

                // Cmd+X (Mac) 或 Ctrl+X (Windows/Linux) - 剪切节点
                if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
                    // 检查焦点是否在输入框中
                    const activeElement = document.activeElement;
                    const isInputFocused = activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    );

                    // 如果焦点在输入框中，让浏览器正常处理剪切
                    if (isInputFocused) {
                        return;
                    }

                    // 否则剪切节点
                    e.preventDefault();
                    activeApp.cutNode();
                    return;
                }

                // Cmd+V (Mac) 或 Ctrl+V (Windows/Linux) - 粘贴节点
                // 注意：图片粘贴由paste事件处理，这里只处理节点粘贴
                if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
                    // 检查焦点是否在输入框中
                    const activeElement = document.activeElement;
                    const isInputFocused = activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    );

                    // 如果焦点在输入框中，让浏览器正常处理粘贴
                    if (isInputFocused) {
                        return;
                    }

                    // 不要preventDefault，让paste事件也能触发（用于图片粘贴）
                    // 如果剪贴板有节点，则粘贴节点
                    if (activeApp.clipboard && activeApp.clipboard.nodes) {
                        e.preventDefault();
                        activeApp.pasteNode();
                    }
                    // 否则让paste事件处理（可能是图片）
                    return;
                }

                // Delete 键删除节点（不需要修饰键）
                if (e.key === 'Delete') {
                    // 检查焦点是否在输入框中，如果在输入框中则不删除节点
                    const activeElement = document.activeElement;
                    const isInputFocused = activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    );

                    // 如果焦点在输入框中，让 Delete 正常工作（删除文字）
                    if (isInputFocused) {
                        return;
                    }

                    // 否则删除节点
                    e.preventDefault();

                    // 优先删除框选的项目，然后删除单选项目
                    if (activeApp.selectedNodes.length > 0 || activeApp.selectedConnections.length > 0) {
                        activeApp.deleteFrameSelectedItems();
                    } else if (activeApp.selectedNode) {
                        activeApp.deleteSelectedNode();
                    }
                }

                // Cmd+箭头：快速设置对齐
                if (e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp')) {
                    const activeElement = document.activeElement;
                    const isInputFocused = activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    );
                    if (isInputFocused || activeApp.editingNode) {
                        return;
                    }

                    const targets = activeApp.selectedNodes.length > 0
                        ? activeApp.selectedNodes
                        : activeApp.selectedNode
                            ? [activeApp.selectedNode]
                            : [];
                    if (targets.length === 0) return;

                    e.preventDefault();
                    const align = e.key === 'ArrowLeft'
                        ? 'left'
                        : e.key === 'ArrowRight'
                            ? 'right'
                            : 'center';

                    targets.forEach(node => {
                        node.textAlign = align;
                    });

                    const editAlignSelect = document.getElementById('editTextAlign');
                    if (editAlignSelect) {
                        editAlignSelect.value = align;
                    }
                    ['editAlignLeft','editAlignCenter','editAlignRight'].forEach(id => {
                        const btn = document.getElementById(id);
                        if (btn) btn.classList.toggle('active', (
                            (id === 'editAlignLeft' && align === 'left') ||
                            (id === 'editAlignCenter' && align === 'center') ||
                            (id === 'editAlignRight' && align === 'right')
                        ));
                    });

                    activeApp.saveToLocalStorage();
                    activeApp.draw();
                    return;
                }

                // Cmd+向下箭头：快速锁定/解锁节点
                if (e.metaKey && e.key === 'ArrowDown') {
                    const activeElement = document.activeElement;
                    const isInputFocused = activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    );
                    if (isInputFocused || activeApp.editingNode) {
                        return;
                    }

                    const targets = activeApp.selectedNodes.length > 0
                        ? activeApp.selectedNodes
                        : activeApp.selectedNode
                            ? [activeApp.selectedNode]
                            : [];
                    if (targets.length === 0) return;

                    e.preventDefault();

                    // 切换锁定状态（如果有多个节点，取第一个节点的锁定状态取反作为目标状态）
                    const targetLocked = !(targets[0].locked || false);

                    targets.forEach(node => {
                        node.locked = targetLocked;
                    });

                    // 更新侧边栏的锁定复选框（只在单选时更新）
                    if (activeApp.selectedNode && activeApp.selectedNodes.length === 0) {
                        const lockCheckbox = document.getElementById('nodeLocked');
                        if (lockCheckbox) {
                            lockCheckbox.checked = targetLocked;
                        }
                    }

                    activeApp.saveToLocalStorage();
                    console.log(`[快捷键] ${targets.length}个节点已${targetLocked ? '锁定' : '解锁'}`);
                    return;
                }

                // Cmd+Z (Mac) 或 Ctrl+Z (Windows/Linux) - 撤销
                if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                    // 检查焦点是否在输入框中
                    const activeElement = document.activeElement;
                    const isInputFocused = activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    );

                    // 如果焦点在输入框中，让浏览器正常处理撤销
                    if (isInputFocused) {
                        return;
                    }

                    // 否则执行画布撤销
                    e.preventDefault();
                    activeApp.undo();
                    return;
                }

                // Cmd+Shift+Z (Mac) 或 Ctrl+Shift+Z (Windows/Linux) - 重做
                if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
                    // 检查焦点是否在输入框中
                    const activeElement = document.activeElement;
                    const isInputFocused = activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    );

                    // 如果焦点在输入框中，让浏览器正常处理重做
                    if (isInputFocused) {
                        return;
                    }

                    // 否则执行画布重做
                    e.preventDefault();
                    activeApp.redo();
                    return;
                }

                // Cmd+Backspace (Mac) 或 Ctrl+Backspace (Windows/Linux) 删除节点
                if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
                    // 检查焦点是否在输入框中
                    const activeElement = document.activeElement;
                    const isInputFocused = activeElement && (
                        activeElement.tagName === 'INPUT' ||
                        activeElement.tagName === 'TEXTAREA' ||
                        activeElement.isContentEditable
                    );

                    // 如果焦点在输入框中，不删除节点
                    if (isInputFocused) {
                        return;
                    }

                    // 删除节点
                    e.preventDefault(); // 阻止 Backspace 的默认返回行为

                    // 优先删除框选的项目，然后删除单选项目
                    if (activeApp.selectedNodes.length > 0 || activeApp.selectedConnections.length > 0) {
                        activeApp.deleteFrameSelectedItems();
                    } else if (activeApp.selectedNode) {
                        activeApp.deleteSelectedNode();
                    }
                }

                // Tab 键
                if (e.key === 'Tab') {
                    const activeElement = document.activeElement;

                    // 节点内编辑器（contentEditable div）
                    const isNodeEditor = activeElement &&
                        activeElement.id === 'nodeEditText';

                    // 侧边栏的普通输入框
                    const isSidebarInput = activeElement && (
                        activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA'
                    );

                    if (isSidebarInput) {
                        // 保持默认Tab行为（在表单间切换）
                        return;
                    }

                    if (isNodeEditor) {
                        // 在节点编辑器内：插入一个 tab 字符，而不是创建子节点
                        e.preventDefault();
                        if (!e.shiftKey) {
                            document.execCommand('insertText', false, '\t');
                        }
                    } else if (activeApp.selectedNode) {
                        // 非编辑状态下按 Tab：创建子节点
                        e.preventDefault();
                        activeApp.createChildNode(activeApp.selectedNode);
                    }
                } else if (e.key === 'Escape') {
                    // ESC: 双屏模式下不处理
                    // 全屏模式由ModeController处理
                }
            });
        }

        // 缩放按钮 - 屏幕特定的
        const zoomInId = `zoomIn${this.screenId.charAt(0).toUpperCase() + this.screenId.slice(1)}`;
        const zoomOutId = `zoomOut${this.screenId.charAt(0).toUpperCase() + this.screenId.slice(1)}`;
        const zoomInBtn = document.getElementById(zoomInId);
        const zoomOutBtn = document.getElementById(zoomOutId);
        if (zoomInBtn) zoomInBtn.addEventListener('click', () => this.changeZoom(1.2));
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this.changeZoom(0.8));

        // 锁定画布复选框 - 只在左屏初始化一次
        if (this.screenId === 'left') {
            const lockCheckbox = document.getElementById('lockCanvasCheckbox');
            if (lockCheckbox) {
                // 从 localStorage 恢复状态
                const savedLockState = localStorage.getItem('canvasLocked');
                if (savedLockState === 'true') {
                    lockCheckbox.checked = true;
                }

                // 监听变化并保存到 localStorage
                lockCheckbox.addEventListener('change', () => {
                    localStorage.setItem('canvasLocked', lockCheckbox.checked);
                });
            }
        }
    }

    updateFileNameDisplay() {
        const fileNameElement = document.getElementById(`fileName${this.screenId.charAt(0).toUpperCase() + this.screenId.slice(1)}`);
        if (fileNameElement) {
            fileNameElement.textContent = this.currentFileName;
        }
        // 更新浏览器标签页标题
        if (this.screenId === AppState.activeScreen && this.currentFileName) {
            const ns = AppState.namespaceManager ? AppState.namespaceManager.getCurrentNamespace() : '';
            const nsPrefix = (ns && ns !== 'default') ? ns + ' / ' : '';
            document.title = nsPrefix + this.currentFileName + ' - 脑图';
        }
        // 更新URL hash，使每个文件有唯一的URL（支持多标签页独立访问）
        if (this.screenId === AppState.activeScreen && this.currentFileName && this.currentFileName !== '未保存') {
            const namespace = AppState.namespaceManager ? AppState.namespaceManager.getCurrentNamespace() : 'default';
            const hashParts = [];
            hashParts.push('ns=' + encodeURIComponent(namespace));
            hashParts.push('file=' + encodeURIComponent(this.currentFileName));
            const newHash = '#' + hashParts.join('&');
            if (window.location.hash !== newHash) {
                history.replaceState(null, '', newHash);
            }
        }
    }

    resizeCanvas() {
        const rect = this.canvasContainer.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.draw();
        this.updateEditorPosition();
    }

    fitToView() {
        if (!this.nodes || this.nodes.length === 0) return;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        this.nodes.forEach(node => {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + node.width);
            maxY = Math.max(maxY, node.y + node.height);
        });

        if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;

        const margin = 40;
        const contentWidth = Math.max(1, maxX - minX);
        const contentHeight = Math.max(1, maxY - minY);
        const availableWidth = Math.max(1, this.canvas.width - margin * 2);
        const availableHeight = Math.max(1, this.canvas.height - margin * 2);

        const scaleX = availableWidth / contentWidth;
        const scaleY = availableHeight / contentHeight;
        this.zoom = Math.max(0.05, Math.min(20, Math.min(scaleX, scaleY)));
        this.panX = (this.canvas.width - contentWidth * this.zoom) / 2 - minX * this.zoom;
        this.panY = (this.canvas.height - contentHeight * this.zoom) / 2 - minY * this.zoom;

        this.draw();
        this.showMinimap();
        this.saveToLocalStorageWithoutHistory();
    }

    handleCanvasMouseDown(e) {
        const pos = this.getMousePos(e);
        const clickedNode = this.getNodeAt(pos);
        const tagHitNode = this.getNodeTagHit(pos);

        // 记录点击位置和时间（用于粘贴）
        this.lastClickPos = pos;
        this.lastClickTime = Date.now();
        this.contextMenuHandled = false;

        // 如果正在编辑节点，先结束编辑
        if (this.editingNode) {
            this.finishNodeEditing();
        }

        // 标签点击优先处理（仅左键、无修饰键）
        if (e.button === 0 && tagHitNode && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            this.selectNode(tagHitNode);
            const currentTag = (tagHitNode.tag || '').trim();
                const input = prompt('请输入标签（留空清除）：', currentTag);
                if (input === null) return;
                const trimmed = input.trim();
                if (trimmed) {
                    tagHitNode.tag = trimmed;
                } else {
                    delete tagHitNode.tag;
                }
                this.saveToLocalStorage();
                this.draw();
                return;
        }

        // 端点拖拽手柄优先处理（仅左键且不带修饰键）
        if (e.button === 0 && !e.shiftKey && !e.ctrlKey) {
            const endpointHandle = this.getConnectionEndpointHandleAt(pos);
            if (endpointHandle) {
                if (!this.selectedConnections.includes(endpointHandle.connection)) {
                    this.selectConnection(endpointHandle.connection);
                } else {
                    // 即使连接线已被选中，也要确保清空节点选择并更新侧边栏
                    this.selectedNode = null;
                    this.selectedNodes = [];
                    if (this.screenId === AppState.activeScreen) {
                        this.updateSidebar('connection');
                    }
                }
                this.draggedConnectionEndpoint = endpointHandle;
                return;
            }
        }

        // 右键处理
        if (e.button === 2) {
            // 检查是否锁定画布
            const lockCheckbox = document.getElementById('lockCanvasCheckbox');
            const isLocked = lockCheckbox && lockCheckbox.checked;

            if (!isLocked) {
                // 记录右键按下的位置和节点，用于判断是点击还是拖拽
                this.rightClickStartPos = { x: e.clientX, y: e.clientY };
                this.rightClickNode = clickedNode;

                if (clickedNode && !this.editingNode) {
                    // 右键在node上：准备文本选择
                    this.isSelectingText = true;
                    this.textSelectionStart = pos;
                    this.textSelectionEnd = pos;
                    this.textSelectionNode = clickedNode;
                } else {
                    // 右键不在node上：平移画布
                    this.isPanning = true;
                    this.panStartX = e.clientX;
                    this.panStartY = e.clientY;
                    this.canvas.style.cursor = 'grab';
                }
            }
            return;
        }

        // Cmd/Ctrl + Click 链接节点: 打开URL 或导航到页面链接
        if ((e.metaKey || e.ctrlKey) && e.button === 0 && clickedNode) {
            // 检查是否为页面链接节点
            if (clickedNode.isPageLink) {
                console.log('[点击] Cmd/Ctrl + 点击页面链接节点');
                this.navigateToPageLink(clickedNode);
                return;
            }

            const linkItem = clickedNode.content && clickedNode.content.find(item => item.type === 'link');
            if (linkItem && linkItem.url) {
                console.log('[点击] Cmd/Ctrl + 点击，打开链接:', linkItem.url);
                window.open(linkItem.url, '_blank');
                return; // 打开链接后直接返回，不处理其他逻辑
            }
        }

        if (e.ctrlKey && e.button === 0) {
            // Ctrl+Click: 添加新节点（只有在不是链接节点时）
            this.addNodeAt(pos);
        } else if (e.shiftKey && e.button === 0) {
            // Shift+Click: 从选中的节点连接到目标节点
            // 或 Shift+拖拽: 拉动连接线
            if (this.selectedNode) {
                if (clickedNode && clickedNode !== this.selectedNode) {
                    // Shift+Click 到另一个节点: 直接连接
                    const connectionExists = this.connections.some(
                        c => c.from === this.selectedNode && c.to === clickedNode
                    );

                    if (!connectionExists) {
                        this.connections.push({
                            from: this.selectedNode,
                            to: clickedNode,
                            controlOffsetY: 0,
                            lineStyle: this.defaultLineStyle || 'solid',
                            lineType: this.defaultLineType || 'curve',
                            lineWidth: this.defaultLineWidth || 2,
                            color: this.defaultLineColor || '#667eea',
                            arrowSize: this.defaultArrowSize || 20,
                            label: '',
                            labelFontSize: 12,
                            isIndependent: this.defaultLineIndependent,
                            fromAnchorX: 0.5,
                            fromAnchorY: 1,
                            toAnchorX: 0.5,
                            toAnchorY: 0
                        });
                        this.saveToLocalStorage();
                        this.draw();
                    }
                } else {
                    // 在节点或空白处 Shift+按住: 准备拖拽拉线
                    this.isDrawingConnection = true;
                    this.connectionStartNode = this.selectedNode;
                    this.connectionEndPos = pos;
                }
            }
        } else if (e.button === 0) {
            // 左键: 框选或拖拽（Shift 时跳过，因为 Shift 已在上面处理）
            if (clickedNode && !this.isDrawingConnection) {
                // 优先检查是否点击了图片的调整控制点
                const imageResizeHandle = this.getImageResizeHandleAt(pos, clickedNode);
                if (imageResizeHandle) {
                    // 点击了图片的角: 调整图片大小
                    this.selectNode(clickedNode);
                    this.resizingImage = clickedNode;
                    this.imageResizeHandle = imageResizeHandle;
                    this.resizeStartPos = pos;
                    // 保存图片调整开始时的大小和原始宽高比
                    this.imageResizeStartSize = {
                        width: clickedNode.imageDisplayWidth,
                        height: clickedNode.imageDisplayHeight,
                        aspectRatio: clickedNode.imageWidth / clickedNode.imageHeight
                    };
                } else {
                    // 检查是否点击了节点的角用来改变大小
                    const resizeHandle = this.getResizeHandleAt(pos, clickedNode);
                    if (resizeHandle) {
                        // 点击了节点的角: 无论是否选中都可以改变大小
                        this.selectNode(clickedNode);
                        this.resizingNode = clickedNode;
                        this.resizeHandle = resizeHandle;
                        this.resizeStartPos = pos;
                        // 记录改变大小前的原始几何信息
                        clickedNode._originalX = clickedNode.x;
                        clickedNode._originalY = clickedNode.y;
                        clickedNode._originalWidth = clickedNode.width;
                        clickedNode._originalHeight = clickedNode.height;
                        clickedNode._originalFontSize = clickedNode.fontSize || 13;
                        if (clickedNode.image && clickedNode.imageDisplayWidth) {
                            clickedNode._originalImageDisplayWidth = clickedNode.imageDisplayWidth;
                            clickedNode._originalImageDisplayHeight = clickedNode.imageDisplayHeight;
                        }
                    } else if (this.selectedNodes.length > 0 && this.selectedNodes.includes(clickedNode)) {
                    // 点击框选的节点: 记录起始位置，等待鼠标移动超过阈值后再开始拖拽
                    this.potentialSelectionDrag = true;
                    this.selectionDragStartPos = pos;
                } else {
                    // 点击单个节点: 选中，记录点击位置用于判断是否拖拽
                    this.selectNode(clickedNode);
                    this.potentialDragNode = clickedNode;
                    this.nodeClickPos = pos;
                    // 记录鼠标相对于节点的偏移量
                    this.dragOffsetX = pos.x - clickedNode.x;
                    this.dragOffsetY = pos.y - clickedNode.y;
                }
                }
            } else if (!clickedNode && !this.isDrawingConnection) {
                // 检查是否点击了连接线
                const clickedConnection = this.getConnectionAt(pos);
                if (clickedConnection) {
                    // 点击了连接线: 准备拖拽改变形状
                    if (!this.selectedConnections.includes(clickedConnection)) {
                        // 如果未选中，先选中它
                        this.selectConnection(clickedConnection);
                    } else {
                        // 即使连接线已被选中，也要确保清空节点选择并更新侧边栏
                        this.selectedNode = null;
                        this.selectedNodes = [];
                        if (this.screenId === AppState.activeScreen) {
                            this.updateSidebar('connection');
                        }
                    }
                    this.draggedConnection = clickedConnection;
                    this.draggedConnectionOffset = pos.y;
                } else {
                    // 空白处: 开始框选
                    this.isSelecting = true;
                    this.selectionStart = pos;
                    this.selectedNodes = [];
                    this.selectedConnections = [];
                    this.selectNode(null);
                }
            }
        }
    }

    handleCanvasMouseMove(e) {
        const pos = this.getMousePos(e);

        if (!this.resizingNode && !this.resizingImage && !this.isPanning && !this.draggedConnection && !this.draggedConnectionEndpoint) {
            const hoveredTagNode = this.getNodeTagHit(pos);
            if (hoveredTagNode) {
                this.canvas.style.cursor = 'pointer';
                return;
            }
        }

        // 更新光标样式
        if (this.selectedNode && !this.resizingNode) {
            const resizeHandle = this.getResizeHandleAt(pos, this.selectedNode);
            if (resizeHandle) {
                if (resizeHandle === 'tl' || resizeHandle === 'br') {
                    this.canvas.style.cursor = 'nwse-resize';
                } else if (resizeHandle === 'tr' || resizeHandle === 'bl') {
                    this.canvas.style.cursor = 'nesw-resize';
                }
            } else {
                this.canvas.style.cursor = 'default';
            }
        } else if (!this.resizingNode) {
            // 检查是否悬停在连接线上
            const hoveredConnection = this.getConnectionAt(pos);
            if (hoveredConnection) {
                this.canvas.style.cursor = 'move';
            } else {
                this.canvas.style.cursor = 'crosshair';
            }
        }

        // 右键文本选择
        if (this.isSelectingText) {
            this.textSelectionEnd = pos;
            this.draw();
            return;
        }

        // 右键拖拽平移画布
        if (this.isPanning) {
            const dx = e.clientX - this.panStartX;
            const dy = e.clientY - this.panStartY;
            this.panX += dx;
            this.panY += dy;
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;
            this.canvas.style.cursor = 'grabbing';
            this.draw();

            // 显示小地图
            this.showMinimap();

            return;
        }

        if (this.isDrawingConnection) {
            // 正在绘制连接线时，更新连接线端点
            this.connectionEndPos = pos;
            // 检查是否悬停在节点上
            const hoveredNode = this.getNodeAt(pos);
            this.connectionHoveredNode = hoveredNode && hoveredNode !== this.connectionStartNode ? hoveredNode : null;
            this.draw();
        } else if (this.resizingImage) {
            // 拖拽图片的角改变大小（保持宽高比）
            const node = this.resizingImage;
            const handle = this.imageResizeHandle;
            const startSize = this.imageResizeStartSize;

            // 计算鼠标移动距离
            const dx = pos.x - this.resizeStartPos.x;
            const dy = pos.y - this.resizeStartPos.y;

            // 根据拖拽方向计算新的宽度
            let newWidth;

            if (handle === 'br' || handle === 'tr') {
                newWidth = startSize.width + dx;
            } else {
                newWidth = startSize.width - dx;
            }

            // 保持宽高比
            let newHeight = newWidth / startSize.aspectRatio;

            // 添加最小尺寸限制
            if (newWidth < 20) {
                newWidth = 20;
                newHeight = newWidth / startSize.aspectRatio;
            }
            // 允许放大，不设上限，节点会自适应

            // 更新图片显示尺寸
            node.imageDisplayWidth = newWidth;
            node.imageDisplayHeight = newHeight;

            // 同步更新内容项中的显示尺寸，避免自动缩回
            const imgItem = node.content && node.content.find(item => item.type === 'image');
            if (imgItem) {
                imgItem.displayWidth = newWidth;
                imgItem.displayHeight = newHeight;
            }

            // 如果节点未锁定，实时调整其大小以适应新图片尺寸
            if (!node.locked) {
                const fontSize = node.fontSize || 13;
                const lineHeight = fontSize * 1.3;
                const hPadding = this.NODE_HORIZONTAL_PADDING;
                const imageTopPadding = this.IMAGE_TOP_PADDING;
                const imageTextGap = this.IMAGE_TEXT_GAP;
                const textVPadding = this.TEXT_VERTICAL_PADDING;

                let requiredWidth = node.imageDisplayWidth + hPadding;
                let textHeight = 0;

                // 从node.content中获取文本内容
                const textContent = node.content.filter(item => item.type === 'text').map(item => item.value).join('\n');
                if (textContent) {
                    this.ctx.font = `${fontSize}px Arial`;
                    const paragraphs = textContent.split(/\r?\n/);
                    let lines = [];
                    paragraphs.forEach(paragraph => {
                        let line = '';
                        const chars = paragraph.split('');
                        for(let char of chars) {
                            const testLine = line + char;
                            if (this.ctx.measureText(testLine).width > requiredWidth - hPadding && line) {
                                lines.push(line);
                                line = char;
                            } else {
                                line = testLine;
                            }
                        }
                        if (line) lines.push(line);
                    });
                    textHeight = (lines.length * lineHeight) + textVPadding;
                }

                node.width = requiredWidth;
                node.height = node.imageDisplayHeight + imageTopPadding + imageTextGap + textHeight;
            }

            this.draw();
        } else if (this.resizingNode) {
            // 恢复到原始的、无阻尼的delta计算
            const dx = pos.x - this.resizeStartPos.x;
            const dy = pos.y - this.resizeStartPos.y;

            const node = this.resizingNode;
            const handle = this.resizeHandle;
            
            // 基于原始几何形状计算新尺寸和位置，防止反馈循环
            if (handle === 'tl') { // 左上角
                node.x = node._originalX + dx;
                node.y = node._originalY + dy;
                node.width = node._originalWidth - dx;
                node.height = node._originalHeight - dy;
            } else if (handle === 'tr') { // 右上角
                node.y = node._originalY + dy;
                node.width = node._originalWidth + dx;
                node.height = node._originalHeight - dy;
            } else if (handle === 'bl') { // 左下角
                node.x = node._originalX + dx;
                node.width = node._originalWidth - dx;
                node.height = node._originalHeight + dy;
            } else if (handle === 'br') { // 右下角
                node.width = node._originalWidth + dx;
                node.height = node._originalHeight + dy;
            }

            // 保证最小大小
            if (node.width < 60) node.width = 60;
            if (node.height < 40) node.height = 40;

            // 等比例改变字体大小（跳过被锁定的节点）
            if (this.proportionalFontSize && !node.locked) {
                const widthScale = node.width / node._originalWidth;
                const heightScale = node.height / node._originalHeight;
                const avgScale = (widthScale + heightScale) / 2;
                let newFontSize = Math.round(node._originalFontSize * avgScale);
                newFontSize = Math.max(10, Math.min(32, newFontSize));
                node.fontSize = newFontSize;
            }

            // 如果节点有图片，也按比例调整图片大小
            if (node._originalImageDisplayWidth && (node.width !== node._originalWidth || node.height !== node._originalHeight)) {
                // 默认按宽度比例缩放
                const widthScaleFactor = node.width / node._originalWidth;
                let newImageWidth = node._originalImageDisplayWidth * widthScaleFactor;
                let newImageHeight = node._originalImageDisplayHeight * widthScaleFactor;

                // 计算当前文本需要的高度
                const fontSize = node.fontSize || 13;
                const lineHeight = fontSize * 1.3;
                
                // (临时创建ctx用于测量，或找到更好的方法)
                this.ctx.font = `${fontSize}px sans-serif`;
                const text = node.content.filter(item => item.type === 'text').map(item => item.value).join('\n');
                const paragraphs = text.split(/\r?\n/);
                let lines = [];
                paragraphs.forEach(p => {
                    if (p === '') { lines.push(''); return; }
                    let currentLine = '';
                    const chars = p.split('');
                    for (let char of chars) {
                        const testLine = currentLine + char;
                        if (this.ctx.measureText(testLine).width > (node.width - 20) && currentLine) {
                            lines.push(currentLine);
                            currentLine = char;
                        } else {
                            currentLine = testLine;
                        }
                    }
                    if (currentLine) lines.push(currentLine);
                });
                const textBlockHeight = lines.length * lineHeight;

                // 计算图片可用的最大高度
                const totalVerticalPadding = this.IMAGE_TOP_PADDING + this.IMAGE_TEXT_GAP + 20; // 20是底部的padding
                const maxImageHeight = node.height - textBlockHeight - totalVerticalPadding;

                // 如果计算出的新图片高度超过了可用空间，则限制图片高度
                if (newImageHeight > maxImageHeight) {
                    newImageHeight = maxImageHeight;
                    // 根据限制后的高度和原始宽高比，反推宽度
                    const aspectRatio = node.imageWidth / node.imageHeight;
                    if(aspectRatio) newImageWidth = newImageHeight * aspectRatio;
                }

                // 保证图片有最小尺寸
                if (newImageHeight < 20) newImageHeight = 20;
                if (newImageWidth < 20) newImageWidth = 20;

                node.imageDisplayHeight = newImageHeight;
                node.imageDisplayWidth = newImageWidth;
            }

            this.draw();
            this.updateEditorPosition();
        } else if (this.draggedConnectionEndpoint) {
            const { connection, side } = this.draggedConnectionEndpoint;
            const targetNode = side === 'from' ? connection.from : connection.to;
            if (targetNode) {
                const detachThreshold = 60;
                const snapThreshold = 30;

                const distanceFromCurrent = this.getDistanceToNodeRect(pos, targetNode);

                // 找到最近的其他节点（用于自动吸附）
                let candidateNode = null;
                let candidateDist = snapThreshold;
                for (let i = 0; i < this.nodes.length; i++) {
                    const node = this.nodes[i];
                    if (node === targetNode) continue;
                    const dist = this.getDistanceToNodeRect(pos, node);
                    if (dist < candidateDist) {
                        candidateNode = node;
                        candidateDist = dist;
                    }
                }

                if (distanceFromCurrent > detachThreshold) {
                    // 端点已从原节点脱离，跟随鼠标
                    connection[`${side}FloatingPos`] = { x: pos.x, y: pos.y };

                    if (candidateNode) {
                        const { anchorX, anchorY } = this.getAnchorOnNearestEdge(candidateNode, pos);
                        connection[`${side}CandidateNode`] = candidateNode;
                        connection[`${side}CandidateAnchorX`] = anchorX;
                        connection[`${side}CandidateAnchorY`] = anchorY;
                    } else {
                        connection[`${side}CandidateNode`] = null;
                        connection[`${side}CandidateAnchorX`] = null;
                        connection[`${side}CandidateAnchorY`] = null;
                    }
                } else {
                    // 仍然依附在当前节点，更新锚点
                    const { anchorX, anchorY } = this.getAnchorOnNearestEdge(targetNode, pos);
                    if (side === 'from') {
                        connection.fromAnchorX = anchorX;
                        connection.fromAnchorY = anchorY;
                    } else {
                        connection.toAnchorX = anchorX;
                        connection.toAnchorY = anchorY;
                    }
                    connection[`${side}FloatingPos`] = null;
                    connection[`${side}CandidateNode`] = null;
                    connection[`${side}CandidateAnchorX`] = null;
                    connection[`${side}CandidateAnchorY`] = null;
                }
                this.draw();
            }
        } else if (this.draggedConnection) {
            // 拖拽连接线: 改变其曲率
            const dy = pos.y - this.draggedConnectionOffset;
            this.draggedConnection.controlOffsetY = (this.draggedConnection.controlOffsetY || 0) + dy;
            this.draggedConnectionOffset = pos.y;
            this.draw();
        } else if (this.potentialSelectionDrag) {
            // 检查是否移动距离超过阈值
            const dx = pos.x - this.selectionDragStartPos.x;
            const dy = pos.y - this.selectionDragStartPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > this.dragThreshold) {
                // 开始实际拖拽框选的节点
                this.isDraggingSelection = true;
                this.potentialSelectionDrag = false;
                this.selectionDragStart = this.selectionDragStartPos;
                this.selectionDragStartPos = null;

                // 继续移动节点
                const moveDx = pos.x - this.selectionDragStart.x;
                const moveDy = pos.y - this.selectionDragStart.y;
                this.selectedNodes.forEach(node => {
                    node.x += moveDx;
                    node.y += moveDy;
                });
                this.selectionDragStart = pos;
            }
            this.draw();
        } else if (this.isDraggingSelection) {
            // 拖拽框选的节点: 整体移动
            const dx = pos.x - this.selectionDragStart.x;
            const dy = pos.y - this.selectionDragStart.y;

            // 移动所有框选的节点
            this.selectedNodes.forEach(node => {
                node.x += dx;
                node.y += dy;
            });

            // 更新拖拽起点以实现平滑移动
            this.selectionDragStart = pos;
            this.draw();
        } else if (this.draggedNode) {
            // 计算移动距离
            const newX = pos.x - this.dragOffsetX;
            const newY = pos.y - this.dragOffsetY;
            const dx = newX - this.draggedNode.x;
            const dy = newY - this.draggedNode.y;

            // 移动主节点
            this.draggedNode.x = newX;
            this.draggedNode.y = newY;

            // 检查是否需要同时移动子节点
            const moveChildrenCheckbox = document.getElementById('moveChildrenWithParent');
            if (moveChildrenCheckbox && moveChildrenCheckbox.checked) {
                const childNodes = this.getAllChildNodes(this.draggedNode);
                childNodes.forEach(child => {
                    child.x += dx;
                    child.y += dy;
                });
            }

            this.draw();
            this.updateEditorPosition();
        } else if (this.potentialDragNode) {
            // 检查是否移动距离超过阈值
            const dx = pos.x - this.nodeClickPos.x;
            const dy = pos.y - this.nodeClickPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > this.dragThreshold) {
                // 开始实际拖拽
                this.draggedNode = this.potentialDragNode;
                this.potentialDragNode = null;
                this.nodeClickPos = null;

                // 计算新位置和移动距离
                const oldX = this.draggedNode.x;
                const oldY = this.draggedNode.y;
                const newX = pos.x - this.dragOffsetX;
                const newY = pos.y - this.dragOffsetY;
                const moveDx = newX - oldX;
                const moveDy = newY - oldY;

                // 使用偏移量来计算正确的节点位置
                this.draggedNode.x = newX;
                this.draggedNode.y = newY;

                // 检查是否需要同时移动子节点
                const moveChildrenCheckbox = document.getElementById('moveChildrenWithParent');
                if (moveChildrenCheckbox && moveChildrenCheckbox.checked) {
                    const childNodes = this.getAllChildNodes(this.draggedNode);
                    childNodes.forEach(child => {
                        child.x += moveDx;
                        child.y += moveDy;
                    });
                }
            }
            this.draw();
        } else if (this.isSelecting) {
            this.selectionEnd = pos;
            this.selectItemsInArea();
            this.draw();
        }
    }

    handleCanvasMouseUp(e) {
        // 处理右键释放
        if (e.button === 2 && this.rightClickStartPos) {
            const dx = e.clientX - this.rightClickStartPos.x;
            const dy = e.clientY - this.rightClickStartPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const isClick = distance < 5; // 移动距离小于5像素视为点击

            if (this.isSelectingText) {
                // 结束文本选择
                this.isSelectingText = false;

                // 如果已经在 contextmenu 中处理过（例如点击了图片），不再显示文本菜单
                if (this.contextMenuHandled) {
                    this.contextMenuHandled = false;
                    this.rightClickStartPos = null;
                    this.rightClickNode = null;
                    return;
                }

                // 如果有选择区域或者是点击，显示右键菜单
                if (this.textSelectionStart && this.textSelectionEnd && this.textSelectionNode) {
                    this.showContextMenu(e.clientX, e.clientY, {
                        node: this.textSelectionNode,
                        allowCopyText: true
                    });
                }

                return;
            } else if (isClick && this.rightClickNode) {
                if (this.contextMenuHandled) {
                    this.contextMenuHandled = false;
                    this.rightClickStartPos = null;
                    this.rightClickNode = null;
                    return;
                }
                this.showContextMenu(e.clientX, e.clientY, { node: this.rightClickNode, allowCopyText: false });
                this.rightClickStartPos = null;
                this.rightClickNode = null;
                return;
            }
        }

        // 结束右键拖拽平移
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = 'crosshair';
            this.rightClickStartPos = null;
            this.rightClickNode = null;
            return;
        }

        if (this.resizingImage) {
            // 结束图片调整
        // 结束图片调整大小
        this.resizingImage = null;
        this.imageResizeHandle = null;
        this.imageResizeStartSize = null;
        } else if (this.resizingNode) {
            // 清除临时属性
            delete this.resizingNode._originalWidth;
            delete this.resizingNode._originalHeight;
            delete this.resizingNode._originalFontSize;

            // 清除该节点的文本缓存（因为尺寸改变了）
            this.clearNodeTextCache(this.resizingNode.id);

            this.resizingNode = null;
            this.resizeHandle = null;
            this.resizeStartPos = null;
            this.saveToLocalStorage();
        } else if (this.draggedConnectionEndpoint) {
            const { connection, side } = this.draggedConnectionEndpoint;
            const candidateNode = connection[`${side}CandidateNode`];
            const candidateAnchorX = connection[`${side}CandidateAnchorX`];
            const candidateAnchorY = connection[`${side}CandidateAnchorY`];

            if (candidateNode && candidateAnchorX !== null && candidateAnchorY !== null && candidateAnchorX !== undefined && candidateAnchorY !== undefined) {
                // 连接到新的节点
                if (side === 'from') {
                    connection.from = candidateNode;
                    connection.fromAnchorX = candidateAnchorX;
                    connection.fromAnchorY = candidateAnchorY;
                } else {
                    connection.to = candidateNode;
                    connection.toAnchorX = candidateAnchorX;
                    connection.toAnchorY = candidateAnchorY;
                }
            }

            // 清理临时状态
            connection[`${side}FloatingPos`] = null;
            connection[`${side}CandidateNode`] = null;
            connection[`${side}CandidateAnchorX`] = null;
            connection[`${side}CandidateAnchorY`] = null;

            this.draggedConnectionEndpoint = null;
            this.saveToLocalStorage();
        } else if (this.draggedConnection) {
            // 结束拖拽连接线
            this.draggedConnection = null;
            this.draggedConnectionOffset = null;
            this.saveToLocalStorage();
        } else if (this.isDraggingSelection) {
            this.isDraggingSelection = false;
            this.selectionDragStart = null;
            this.saveToLocalStorage();
        } else if (this.potentialSelectionDrag) {
            // 只是点击框选的节点，没有拖拽，清除状态
            this.potentialSelectionDrag = false;
            this.selectionDragStartPos = null;
        } else if (this.draggedNode) {
            this.draggedNode = null;
            this.dragOffsetX = null;
            this.dragOffsetY = null;
            this.saveToLocalStorage();
        } else if (this.potentialDragNode) {
            // 只是点击，没有拖拽，清除状态
            this.potentialDragNode = null;
            this.nodeClickPos = null;
            this.dragOffsetX = null;
            this.dragOffsetY = null;
        } else if (this.isSelecting) {
            this.isSelecting = false;
            this.showSelectionBox = false;
            // 框选完成，立即隐藏框选矩形
            this.selectionStart = null;
            this.selectionEnd = null;

            // 如果框选到了连接线，显示连接线属性面板（只要有连接线就显示）
            if (this.selectedConnections.length > 0) {
                // 如果只选中了连接线（没有选中节点），清空节点选择
                if (this.selectedNodes.length === 0) {
                    this.selectedNode = null;
                }
                // 使用undefined表示保持当前的selectedConnections数组，只更新UI
                this.selectConnection(undefined);
            } else if (this.selectedConnections.length === 0 && this.selectedNodes.length === 0) {
                // 如果什么都没选中，清空面板
                this.selectConnection(null);
                this.selectNode(null);
            }

            this.draw();
        } else if (this.isDrawingConnection) {
            this.isDrawingConnection = false;

            // 使用当前保存的悬停节点，如果有的话就连接
            const targetNode = this.connectionHoveredNode;

            // 如果释放在另一个节点上，创建连接
            if (targetNode) {
                const connectionExists = this.connections.some(
                    c => c.from === this.connectionStartNode && c.to === targetNode
                );

                if (!connectionExists) {
                    this.connections.push({
                        from: this.connectionStartNode,
                        to: targetNode,
                        controlOffsetY: 0,
                        lineStyle: this.defaultLineStyle || 'solid',
                        lineType: this.defaultLineType || 'curve',
                        lineWidth: this.defaultLineWidth || 2,
                        color: this.defaultLineColor || '#667eea',
                        arrowSize: this.defaultArrowSize || 20,
                        label: '',
                        labelFontSize: 12,
                        isIndependent: this.defaultLineIndependent
                    });
                    this.saveToLocalStorage();
                }
            }
            // 否则线条自动收回（不创建连接）

            this.connectionStartNode = null;
            this.connectionEndPos = null;
            this.connectionHoveredNode = null;
            this.draw();
        }
    }

    startNodeEditing(node) {
        if (this.editingNode) {
            this.finishNodeEditing();
        }

        this.editingNode = node;
        this.draw(); // Redraw to hide selection handles

        // 确保content数组存在
        if (!node.content) {
            node.content = [];
        }

        // 如果节点有图片但content中没有，添加进去
        if (node.image && node.imageWidth && node.imageHeight) {
            const hasImageInContent = node.content.some(item => item.type === 'image');
            if (!hasImageInContent) {
                // 将图片添加到content数组的开头
                node.content.unshift({
                    type: 'image',
                    value: node.image,
                    width: node.imageWidth,
                    height: node.imageHeight
                });
            }
        }

        const editableDiv = document.createElement('div');
        editableDiv.id = 'nodeEditText';
        editableDiv.contentEditable = true;
        editableDiv.setAttribute('autocorrect', 'off');
        editableDiv.setAttribute('autocapitalize', 'off');
        editableDiv.setAttribute('spellcheck', 'false');
        editableDiv.setAttribute('autocomplete', 'off');

        let html = '';
        if (node.content) {
            node.content.forEach(item => {
                if (item.type === 'text') {
                    // 先转义HTML特殊字符，再替换换行符
                    html += `<div>${escapeHTML(item.value).replace(/\n/g, '<br>')}</div>`;
                } else if (item.type === 'image') {
                    html += `<div><img src="${item.value}" style="max-width: 100%;" data-width="${item.width}" data-height="${item.height}"></div>`;
                } else if (item.type === 'link') {
                    // 编辑链接时显示URL（转义）
                    html += `<div>${escapeHTML(item.url)}</div>`;
                } else if (item.type === 'pending_link') {
                    // 待处理链接：编辑时至少显示URL/文本，避免编辑框为空
                    const pendingText = (item.value || item.url || '').toString();
                    html += `<div>${escapeHTML(pendingText).replace(/\n/g, '<br>')}</div>`;
                }
            });
        }
        editableDiv.innerHTML = html;

        this.canvasContainer.appendChild(editableDiv);
        this.editTextDiv = editableDiv;
        this.updateEditorPosition();

        editableDiv.focus();

        // 添加键盘事件监听器
        editableDiv.addEventListener('keydown', (e) => {
            // ESC键退出编辑
            if (e.key === 'Escape') {
                e.preventDefault();
                this.finishNodeEditing();
                return;
            }

            // Cmd+Enter (Mac) 或 Ctrl+Enter (Windows/Linux) 退出编辑
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                this.finishNodeEditing();
                return;
            }

            // End 键：跳转到当前行末尾
            if (e.key === 'End' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                const selection = window.getSelection();
                if (!selection) return;
                const range = document.createRange();

                // 获取当前光标所在节点和偏移
                const { anchorNode, anchorOffset } = selection;
                if (!anchorNode) return;

                // 找到当前行（使用包含的块级元素或文本节点的父div）
                let lineNode = anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
                while (lineNode && lineNode !== editableDiv && lineNode.tagName !== 'DIV') {
                    lineNode = lineNode.parentElement;
                }
                if (!lineNode || lineNode === editableDiv) {
                    // 如果找不到行，就移动到最后
                    const lastChild = editableDiv.lastChild;
                    if (!lastChild) return;
                    range.selectNodeContents(lastChild);
                    range.collapse(false);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    return;
                }

                // 将光标移到该行末尾
                range.selectNodeContents(lineNode);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        });

        editableDiv.addEventListener('blur', () => this.finishNodeEditing());

        // 粘贴：强制只粘纯文本，避免浏览器塞进 <meta>/带样式的 span/wrapper
        // 导致 DOM walker 漏处理
        editableDiv.addEventListener('paste', (e) => {
            if (!e.clipboardData) return;
            // 如果是图片，让全局粘贴 handler 处理
            const items = e.clipboardData.items;
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type && items[i].type.indexOf('image') !== -1) return;
                }
            }
            const text = e.clipboardData.getData('text/plain');
            if (text == null) return;
            e.preventDefault();
            e.stopPropagation();
            document.execCommand('insertText', false, text);
        });
    }

    finishNodeEditing() {
        if (!this.editingNode || !this.editTextDiv) return;

        const node = this.editingNode;
        const editDiv = this.editTextDiv;

        console.log('[编辑结束] 开始处理');
        console.log('[编辑结束] editTextDiv.innerHTML:', editDiv.innerHTML);
        console.log('[编辑结束] editTextDiv.childNodes.length:', editDiv.childNodes.length);

        const newContent = [];
        let firstImage = null; // 保存第一张图片信息

        // 关键修复：按URL分段解析文本，URL只替换对应片段为link，避免清空节点里已有的文字/图片
        const URL_IN_TEXT_REGEX = /(https?:\/\/[^\s<>"']+)/gi;

        const pushImageFromImg = (img) => {
            if (!img || !img.src) return;
            const width = parseInt(img.dataset && img.dataset.width) || img.naturalWidth || 100;
            const height = parseInt(img.dataset && img.dataset.height) || img.naturalHeight || 100;
            const imageInfo = { type: 'image', value: img.src, width, height };
            newContent.push(imageInfo);
            console.log('[编辑结束] 添加图片:', { width, height });
            if (!firstImage) {
                firstImage = imageInfo;
                console.log('[编辑结束] 设置为firstImage');
            }
        };

        const pushTextAndLinksFromText = (rawText) => {
            if (rawText === undefined || rawText === null) return;
            // \u4EC5\u5265\u79BB\u9996\u5C3E\u7684\u6362\u884C\uFF08DOM walker \u5728 <div>/<br> \u672B\u5C3E\u8FFD\u52A0\u7684\u6B8B\u7559\uFF09\uFF0C
            // \u4FDD\u7559\u6240\u6709 tab/\u7A7A\u683C\uFF08\u5305\u62EC\u884C\u9996\u7F29\u8FDB\u548C\u4E2D\u95F4\u7A7A\u767D\uFF09
            const text = String(rawText)
                .replace(/\u00A0/g, ' ')
                .replace(/^[\r\n]+|[\r\n]+$/g, '');
            const trimmed = text.trim();
            if (!trimmed) return;

            // 如果整段文本本身就是URL（包括缺少scheme的情况），直接作为待解析链接
            const wholeUrl = extractURLFromText(trimmed);
            if (wholeUrl && isURL(trimmed)) {
                newContent.push({ type: 'pending_link', value: wholeUrl, url: wholeUrl });
                console.log('[编辑结束] 添加待处理链接(整段URL):', wholeUrl);
                return;
            }

            URL_IN_TEXT_REGEX.lastIndex = 0;
            let lastIndex = 0;
            let match;
            let matchedAny = false;

            while ((match = URL_IN_TEXT_REGEX.exec(text)) !== null) {
                matchedAny = true;
                const before = text.slice(lastIndex, match.index);
                if (before && before.trim()) {
                    // 保留前后空白/tab，只在判空时 trim
                    newContent.push({ type: 'text', value: before });
                }

                const urlText = (match[1] || '').trim();
                if (urlText) {
                    newContent.push({ type: 'pending_link', value: urlText, url: urlText });
                    console.log('[编辑结束] 添加待处理链接(分段):', urlText);
                }

                lastIndex = match.index + (match[1] || '').length;
            }

            if (matchedAny) {
                const after = text.slice(lastIndex);
                if (after && after.trim()) {
                    newContent.push({ type: 'text', value: after });
                }
            } else {
                // 无http(s)链接，作为普通文本（保留内部 tab/空格）
                newContent.push({ type: 'text', value: text });
            }
        };

        const processDomTree = (root, index) => {
            console.log(`[编辑结束] 处理子节点 ${index}:`, root.nodeName, root.nodeType);

            if (root.nodeType === Node.TEXT_NODE) {
                pushTextAndLinksFromText(root.textContent || '');
                return;
            }
            if (root.nodeType !== Node.ELEMENT_NODE) return;

            let buffer = '';
            const flush = () => {
                if (buffer && buffer.trim()) {
                    pushTextAndLinksFromText(buffer);
                }
                buffer = '';
            };

            const walk = (n) => {
                if (!n) return;

                if (n.nodeType === Node.TEXT_NODE) {
                    buffer += n.textContent || '';
                    return;
                }
                if (n.nodeType !== Node.ELEMENT_NODE) return;

                const tag = n.tagName;

                if (tag === 'BR') {
                    buffer += '\n';
                    return;
                }

                if (tag === 'IMG') {
                    flush();
                    pushImageFromImg(n);
                    return;
                }

                if (tag === 'A') {
                    const href = (n.getAttribute('href') || '').trim();
                    const hrefUrl = href ? extractURLFromText(href) : null;
                    const anchorText = (n.innerText || n.textContent || '').trim();

                    if (hrefUrl) {
                        flush();
                        newContent.push({ type: 'pending_link', value: hrefUrl, url: hrefUrl });
                        console.log('[编辑结束] 添加待处理链接(a.href):', hrefUrl);
                        // 如果链接文本不是URL本身，保留为普通文本
                        if (anchorText && anchorText !== href && anchorText !== hrefUrl && !anchorText.includes(hrefUrl)) {
                            pushTextAndLinksFromText(anchorText);
                        }
                        return;
                    }

                    if (anchorText) buffer += anchorText;
                    return;
                }

                // 块级元素：保留换行边界，避免多段文本被粘成一段
                if (tag === 'DIV' || tag === 'P' || tag === 'LI') {
                    n.childNodes.forEach(walk);
                    buffer += '\n';
                    return;
                }

                n.childNodes.forEach(walk);
            };

            walk(root);
            flush();
        };

        // 按照DOM顺序遍历所有子节点
        editDiv.childNodes.forEach((child, index) => processDomTree(child, index));

        // 如果没有提取到任何内容，尝试直接获取整个编辑器的文本
        if (newContent.length === 0) {
            const fullText = editDiv.innerText || editDiv.textContent || '';
            if (fullText.trim()) {
                console.log('[编辑结束] 回退：使用完整文本:', fullText);
                pushTextAndLinksFromText(fullText);
            }
        }

        console.log('[编辑结束] newContent:', newContent);
        console.log('[编辑结束] firstImage:', firstImage);

        // 如果节点已有缩放后的图片尺寸，保留到新内容中，避免编辑后被还原
        const existingDisplayWidth = node.imageDisplayWidth;
        const existingDisplayHeight = node.imageDisplayHeight;
        if (existingDisplayWidth && existingDisplayHeight) {
            newContent.forEach(item => {
                if (item.type === 'image') {
                    if (!item.displayWidth) item.displayWidth = existingDisplayWidth;
                    if (!item.displayHeight) item.displayHeight = existingDisplayHeight;
                }
            });
        }

        node.content = newContent;

        // 如果有图片，更新节点的图片属性（用于绘制和调整大小）
        if (firstImage) {
            console.log('[编辑结束] 更新节点图片属性');
            node.image = firstImage.value;
            node.imageWidth = firstImage.width;
            node.imageHeight = firstImage.height;

            // 如果节点还没有imageDisplayWidth/Height，设置初始值
            if (!node.imageDisplayWidth || !node.imageDisplayHeight) {
                const maxWidth = 300;
                const maxHeight = 300;
                let displayWidth = firstImage.width;
                let displayHeight = firstImage.height;

                if (firstImage.width > maxWidth || firstImage.height > maxHeight) {
                    const ratio = Math.min(maxWidth / firstImage.width, maxHeight / firstImage.height);
                    displayWidth = firstImage.width * ratio;
                    displayHeight = firstImage.height * ratio;
                }

                node.imageDisplayWidth = displayWidth;
                node.imageDisplayHeight = displayHeight;
                console.log('[编辑结束] 设置显示尺寸:', displayWidth, 'x', displayHeight);
            }

            console.log('[编辑结束] 最终节点图片属性:', {
                image: node.image.substring(0, 50) + '...',
                imageWidth: node.imageWidth,
                imageHeight: node.imageHeight,
                imageDisplayWidth: node.imageDisplayWidth,
                imageDisplayHeight: node.imageDisplayHeight
            });
        } else {
            console.log('[编辑结束] 没有图片，清除属性');
            // 如果没有图片了，清除图片属性
            delete node.image;
            delete node.imageWidth;
            delete node.imageHeight;
            delete node.imageDisplayWidth;
            delete node.imageDisplayHeight;
        }

        // 处理待处理的链接：异步获取元数据
        const pendingLinks = node.content.filter(item => item.type === 'pending_link');
        if (pendingLinks.length > 0) {
            console.log('[编辑结束] 发现待处理链接，开始获取元数据');
            // 异步处理，不阻塞UI
            (async () => {
                for (const linkItem of pendingLinks) {
                    try {
                        // 首先验证URL格式 - 必须以 http:// 或 https:// 开头
                        if (!isURL(linkItem.url)) {
                            console.log('[编辑结束] 非有效URL，转为普通文本:', linkItem.url);
                            const index = node.content.indexOf(linkItem);
                            if (index !== -1) {
                                node.content[index] = {
                                    type: 'text',
                                    value: linkItem.value || linkItem.url
                                };
                            }
                            this.saveToLocalStorage();
                            this.draw();
                            continue;
                        }

                        const metadata = await fetchURLMetadata(linkItem.url);
                        if (metadata && metadata.title) {
                            // 找到并更新为link类型
                            const index = node.content.indexOf(linkItem);
                            if (index !== -1) {
                                node.content[index] = {
                                    type: 'link',
                                    url: metadata.url || linkItem.url,
                                    title: metadata.title,
                                    description: metadata.description || ''
                                };
                                console.log('[编辑结束] 链接元数据已更新:', metadata.title);
                            }
                        } else {
                            console.log('[编辑结束] 元数据获取失败或无标题，使用域名作为标题');
                            // 元数据获取失败，仍然创建link类型，用域名作为标题
                            const index = node.content.indexOf(linkItem);
                            if (index !== -1) {
                                let fallbackTitle = linkItem.url;
                                try {
                                    const urlObj = new URL(linkItem.url);
                                    fallbackTitle = urlObj.hostname;
                                } catch (e) {}
                                node.content[index] = {
                                    type: 'link',
                                    url: linkItem.url,
                                    title: fallbackTitle,
                                    description: ''
                                };
                            }
                        }
                    } catch (error) {
                        console.error('[编辑结束] 元数据获取错误:', error);
                        // 发生错误时仍然创建link类型，用域名作为标题
                        const index = node.content.indexOf(linkItem);
                        if (index !== -1) {
                            let fallbackTitle = linkItem.value || linkItem.url;
                            try {
                                const urlObj = new URL(linkItem.url);
                                fallbackTitle = urlObj.hostname;
                            } catch (e) {}
                            node.content[index] = {
                                type: 'link',
                                url: linkItem.url,
                                title: fallbackTitle,
                                description: ''
                            };
                        }
                    }
                }
                // 更新完成后重新绘制和保存
                this.autoFitNodeSize(node);
                this.saveToLocalStorage();
                this.draw();
            })();
        }

        this.autoFitNodeSize(node);
        this.saveToLocalStorage();

        if (editDiv) {
            this.canvasContainer.removeChild(editDiv);
        }
        this.editTextDiv = null;
        this.editingNode = null;
        this.draw();

        // 将焦点返回到canvas
        this.canvas.focus();
    }

    insertImage(dataUrl) {
        if (!this.editTextDiv) {
            console.log('[插入图片] editTextDiv不存在');
            return;
        }

        console.log('[插入图片] 开始加载图片...');
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            console.log('[插入图片] 图片加载成功，尺寸:', img.width, 'x', img.height);

            // 确保editTextDiv有焦点
            if (document.activeElement !== this.editTextDiv) {
                console.log('[插入图片] 重新聚焦到editTextDiv');
                this.editTextDiv.focus();
            }

            const selection = window.getSelection();
            let range;

            if (selection.rangeCount > 0) {
                range = selection.getRangeAt(0);
            } else {
                console.log('[插入图片] 没有选区，创建新选区');
                range = document.createRange();
                range.selectNodeContents(this.editTextDiv);
                range.collapse(false); // 移动到末尾
                selection.removeAllRanges();
                selection.addRange(range);
            }

            // 创建图片容器
            const container = document.createElement('div');
            const imageNode = document.createElement('img');
            imageNode.src = dataUrl;
            imageNode.style.maxWidth = '100%';
            imageNode.dataset.width = img.width;
            imageNode.dataset.height = img.height;
            container.appendChild(imageNode);

            console.log('[插入图片] 创建图片元素，dataset.width:', imageNode.dataset.width, 'dataset.height:', imageNode.dataset.height);

            // 插入图片
            try {
                range.deleteContents();
                range.insertNode(container);
                console.log('[插入图片] 图片已插入到编辑器');

                // Move cursor after the image
                range.setStartAfter(container);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);

                // 添加一个换行，方便后续输入
                const br = document.createElement('br');
                range.insertNode(br);
                range.setStartAfter(br);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);

                console.log('[插入图片] 光标已移动到图片后');
            } catch (error) {
                console.error('[插入图片] 插入失败:', error);
            }
        };
        img.onerror = () => {
            console.error('[插入图片] 图片加载失败');
        };
    }

    updateEditorPosition() {
        if (!this.editingNode || !this.editTextDiv) return;
        const node = this.editingNode;

        const left = node.x * this.zoom + this.panX;
        const top = node.y * this.zoom + this.panY;

        this.editTextDiv.style.left = `${left}px`;
        this.editTextDiv.style.top = `${top}px`;
        this.editTextDiv.style.width = `${node.width * this.zoom}px`;
        this.editTextDiv.style.height = `${node.height * this.zoom}px`;
    }


    // 自动适应节点大小以适应文本
    autoFitNodeSize(node) {
        if (!node || !node.content) return;
        
        // 如果节点被锁定，跳过自动调整大小
        if (node.locked) {
            console.log('[autoFitNodeSize] 节点已锁定，跳过自动调整');
            return;
        }

        const minNodeWidth = 100;
        const minNodeHeight = 40;
        let requiredWidth = minNodeWidth;
        let totalHeight = 0;

        const fontSize = node.fontSize || 13;
        const lineHeight = fontSize * (node.codeMode ? 1.35 : 1.3);
        this.ctx.font = `${fontSize}px ${node.codeMode ? this.codeFontStack : 'sans-serif'}`;

        let hasImage = false;
        let isFirstItem = true;

        // 遍历 content 数组，计算所有图片和文本的总高度
        node.content.forEach(item => {
            if (item.type === 'image') {
                hasImage = true;

                // 使用自定义显示尺寸（如有），否则使用原始尺寸
                const displayWidth = item.displayWidth || item.width || 100;
                const displayHeight = item.displayHeight || item.height || 100;

                // 确保节点宽度能容纳图片
                requiredWidth = Math.max(requiredWidth, displayWidth + this.NODE_HORIZONTAL_PADDING);

                // 累加图片高度
                if (!isFirstItem) {
                    totalHeight += this.IMAGE_TEXT_GAP; // 与前一项的间隙
                }
                totalHeight += displayHeight;
                isFirstItem = false;
            } else if (item.type === 'text') {
                this.ctx.font = `${fontSize}px ${node.codeMode ? this.codeFontStack : 'sans-serif'}`;
                // code 模式下使用相同的 token-aware 换行算法（不取 tokens，只要 text/区间），
                // 与 drawNode 保持一致：节点会扩展到容纳软换行后的最长视觉行
                let lines;
                if (node.codeMode) {
                    const normalized = String(item.value || '').replace(/\t/g, '    ');
                    lines = [];
                    normalized.split(/\r?\n/).forEach(p => {
                        this._wrapCodeLine(p, 400, this.ctx).forEach(v => lines.push(v.text));
                    });
                } else {
                    lines = this.wrapText(item.value, 400, this.ctx);
                }
                const textHeight = lines.length * lineHeight;
                const textWidth = lines.reduce((max, line) => Math.max(max, this.ctx.measureText(line).width), 0);

                requiredWidth = Math.max(requiredWidth, textWidth + this.NODE_HORIZONTAL_PADDING);

                // 累加文本高度
                if (!isFirstItem) {
                    totalHeight += this.IMAGE_TEXT_GAP; // 与前一项的间隙
                }
                totalHeight += textHeight;
                isFirstItem = false;
            } else if (item.type === 'link') {
                // 链接类型：标题行 + URL行
                const titleText = item.title || item.url;
                const titleLines = this.wrapText(titleText, 400, this.ctx);
                const titleHeight = titleLines.length * lineHeight;
                const titleWidth = titleLines.reduce((max, line) => Math.max(max, this.ctx.measureText(line).width), 0);

                // URL 使用较小的字体
                const urlFontSize = Math.max(fontSize * 0.75, 10);
                this.ctx.font = `${urlFontSize}px sans-serif`;
                const urlWidth = this.ctx.measureText(item.url.substring(0, 40)).width;
                this.ctx.font = `${fontSize}px sans-serif`; // 恢复字体

                requiredWidth = Math.max(requiredWidth, titleWidth + this.NODE_HORIZONTAL_PADDING, urlWidth + this.NODE_HORIZONTAL_PADDING);

                if (!isFirstItem) {
                    totalHeight += this.IMAGE_TEXT_GAP;
                }
                totalHeight += titleHeight + lineHeight * 0.8; // 标题 + URL行
                isFirstItem = false;
            } else if (item.type === 'pending_link') {
                // 待处理的链接，按文本计算
                const lines = this.wrapText(item.value || item.url, 400, this.ctx);
                const textHeight = lines.length * lineHeight;
                const textWidth = lines.reduce((max, line) => Math.max(max, this.ctx.measureText(line).width), 0);

                requiredWidth = Math.max(requiredWidth, textWidth + this.NODE_HORIZONTAL_PADDING);

                if (!isFirstItem) {
                    totalHeight += this.IMAGE_TEXT_GAP;
                }
                totalHeight += textHeight;
                isFirstItem = false;
            }
        });

        // 添加上下padding
        // 纯文本节点使用较小的padding（上下各8，总共16）
        // 有图片的节点使用原来的padding
        if (hasImage) {
            totalHeight += this.IMAGE_TOP_PADDING + this.TEXT_VERTICAL_PADDING;
        } else {
            totalHeight += this.TEXT_VERTICAL_PADDING; // 上下各20，总共40
        }

        node.width = Math.max(requiredWidth, minNodeWidth);
        node.height = Math.max(totalHeight, minNodeHeight);
        this.clearNodeTextCache(node.id);
    }

    // 内部方法：包装文本并测量行宽
    _wrapTextAndMeasure(node, ctx, maxWidth, fontSize, padding) {
        const paragraphs = node.text.split(/\r?\n/);
        let lines = [];
        let maxLineWidth = 0;

        // 辅助函数：按字符强制换行（用于超长单词）
        const wrapByCharacter = (str) => {
            const chars = Array.from(str); // 支持Unicode字符
            let line = '';
            const charLines = [];

            for (let char of chars) {
                const testLine = line + char;
                const testWidth = ctx.measureText(testLine).width;

                if (testWidth > maxWidth - padding && line) {
                    charLines.push(line);
                    const lineWidth = ctx.measureText(line).width;
                    maxLineWidth = Math.max(maxLineWidth, lineWidth);
                    line = char;
                } else {
                    line = testLine;
                }
            }

            if (line) {
                charLines.push(line);
                const lineWidth = ctx.measureText(line).width;
                maxLineWidth = Math.max(maxLineWidth, lineWidth);
            }
            return charLines;
        };

        paragraphs.forEach(paragraph => {
            if (paragraph === '') {
                lines.push('');
                return;
            }

            // 检测是否为代码类文本（包含括号、等号等编程语法）
            const isCodeLike = /[()[\]{}<>=]/.test(paragraph);

            // 对于代码类文本，只有在文本较短时才不换行
            // 如果文本过长，强制换行以避免超出锁定节点边界
            if (isCodeLike) {
                const fullLineWidth = ctx.measureText(paragraph).width;
                if (fullLineWidth <= (maxWidth - padding) * 1.5) {
                    // 短代码：不换行
                    lines.push(paragraph);
                    maxLineWidth = Math.max(maxLineWidth, fullLineWidth);
                    return;
                }
                // 长代码：继续执行换行逻辑
            }

            // CJK + Latin 混排：跟 wrapText 一致，把 CJK 字符当作可换行点，
            // 拉丁词保持原子性，避免 split(' ') 把 "（base model）" 撕成两行。
            const cjkRegex = /[　-〿぀-ゟ゠-ヿ一-鿿＀-￯]/;
            const effMax = maxWidth - padding;
            if (cjkRegex.test(paragraph)) {
                const tokens = [];
                let latinBuf = '';
                for (const c of Array.from(paragraph)) {
                    if (c === ' ') {
                        if (latinBuf) { tokens.push(latinBuf); latinBuf = ''; }
                        tokens.push(' ');
                    } else if (cjkRegex.test(c)) {
                        if (latinBuf) { tokens.push(latinBuf); latinBuf = ''; }
                        tokens.push(c);
                    } else {
                        latinBuf += c;
                    }
                }
                if (latinBuf) tokens.push(latinBuf);

                const openBrackets = new Set(['(', '（', '【', '『', '《', '[', '{']);
                const closeBrackets = new Set([')', '）', '】', '』', '》', ']', '}']);
                const pushLine = (l) => {
                    const t = l.replace(/ +$/, '');
                    lines.push(t);
                    maxLineWidth = Math.max(maxLineWidth, ctx.measureText(t).width);
                };
                let line = '';

                for (let i = 0; i < tokens.length; i++) {
                    const tok = tokens[i];
                    if (tok === ' ' && line === '') continue;

                    if (tok.length > 1 && ctx.measureText(tok).width > effMax) {
                        if (line) { pushLine(line); line = ''; }
                        const charLines = wrapByCharacter(tok);
                        // wrapByCharacter 内部已维护 maxLineWidth，这里只把"完整行"塞进 lines
                        for (let k = 0; k < charLines.length - 1; k++) lines.push(charLines[k]);
                        line = charLines[charLines.length - 1] || '';
                        continue;
                    }

                    const testLine = line + tok;
                    const testWidth = ctx.measureText(testLine).width;

                    if (testWidth > effMax && line) {
                        const lastChar = line.charAt(line.length - 1);

                        if (openBrackets.has(lastChar) && line.length > 1) {
                            const beforeBracket = line.slice(0, -1).replace(/ +$/, '');
                            if (beforeBracket) {
                                pushLine(beforeBracket);
                                line = lastChar + (tok === ' ' ? '' : tok);
                                continue;
                            }
                        }

                        if (tok.length === 1 && closeBrackets.has(tok)) {
                            const tolerance = Math.min(12, effMax * 0.05);
                            if ((testWidth - effMax) <= tolerance) {
                                line = testLine;
                                continue;
                            }
                        }

                        pushLine(line);
                        line = tok === ' ' ? '' : tok;
                    } else {
                        line = testLine;
                    }
                }

                if (line) pushLine(line);
                return;
            }

            // Split by spaces to preserve words
            const words = paragraph.split(' ');
            let currentLine = '';

            for (let i = 0; i < words.length; i++) {
                const word = words[i];

                // 检查单个词是否超过最大宽度
                const wordWidth = ctx.measureText(word).width;
                if (wordWidth > maxWidth - padding) {
                    // 单词太长，先保存当前行，然后按字符切分这个词
                    if (currentLine) {
                        lines.push(currentLine);
                        const lineWidth = ctx.measureText(currentLine).width;
                        maxLineWidth = Math.max(maxLineWidth, lineWidth);
                        currentLine = '';
                    }
                    // 按字符切分超长单词
                    const charLines = wrapByCharacter(word);
                    lines.push(...charLines.slice(0, -1)); // 添加完整的行
                    currentLine = charLines[charLines.length - 1]; // 最后一行可能还能加内容
                    continue;
                }

                const testLine = currentLine ? currentLine + ' ' + word : word;
                const metrics = ctx.measureText(testLine);
                const testWidth = metrics.width;

                if (testWidth > maxWidth - padding && currentLine.length > 0) {
                    // Current line is full, push it and start new line
                    lines.push(currentLine);
                    const lineWidth = ctx.measureText(currentLine).width;
                    maxLineWidth = Math.max(maxLineWidth, lineWidth);
                    currentLine = word;
                } else {
                    // Word fits on current line
                    currentLine = testLine;
                }
            }

            if (currentLine.length > 0) {
                lines.push(currentLine);
                const lineWidth = ctx.measureText(currentLine).width;
                maxLineWidth = Math.max(maxLineWidth, lineWidth);
            }
        });
        return { lines, maxLineWidth };
    }

    // 内部方法：计算节点尺寸以适应内容 (文本和图片)
    _calculateNodeDimensions(node, ctx) {
        const fontSize = node.fontSize || 13;
        const lineHeight = fontSize * 1.3;
        const minNodeWidth = 100;
        const minNodeHeight = 40;
        const defaultTextMaxWidth = 400;

        let requiredWidth = minNodeWidth;
        let finalHeight = 0;

        // 1. 确定宽度
        let imageWidth = 0;
        if (node.imageSrc && node.img && node.imageDisplayWidth > 0) {
            imageWidth = node.imageDisplayWidth + this.NODE_HORIZONTAL_PADDING;
        }

        let textWidth = 0;
        if (node.content) {
            const textContent = node.content.filter(item => item.type === 'text').map(item => item.value).join('\n');
            ctx.font = `${fontSize}px Arial`;
            const { maxLineWidth } = this._wrapTextAndMeasure({text: textContent}, ctx, defaultTextMaxWidth, fontSize, this.NODE_HORIZONTAL_PADDING / 2);
            textWidth = maxLineWidth + this.NODE_HORIZONTAL_PADDING;
        }
        
        requiredWidth = Math.max(imageWidth, textWidth, minNodeWidth);

        // 2. 根据最终宽度计算高度
        let textHeight = 0;
        if (node.text) {
            ctx.font = `${fontSize}px Arial`;
            const { lines } = this._wrapTextAndMeasure(node, ctx, requiredWidth, fontSize, this.NODE_HORIZONTAL_PADDING / 2);
            textHeight = (lines.length * lineHeight) + this.TEXT_VERTICAL_PADDING;
        }

        if (node.imageSrc && node.img && node.imageDisplayHeight > 0) {
            finalHeight = node.imageDisplayHeight + this.IMAGE_TOP_PADDING + this.IMAGE_TEXT_GAP + textHeight;
        } else {
            finalHeight = textHeight > 0 ? textHeight : minNodeHeight;
        }
        
        return {
            width: requiredWidth,
            height: Math.max(finalHeight, minNodeHeight)
        };
    }


    goToNode(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;

        // Center the node on the screen
        this.panX = -node.x * this.zoom + (this.canvas.width / 2) - (node.width * this.zoom / 2);
        this.panY = -node.y * this.zoom + (this.canvas.height / 2) - (node.height * this.zoom / 2);

        this.selectNode(node);
        this.draw();
    }

    cancelNodeEditing() {
        if (!this.editingNode || !this.editTextarea) {
            return;
        }

        // 移除 textarea 不保存更改
        document.body.removeChild(this.editTextarea);
        this.editTextarea = null;
        this.editingNode = null;
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - this.panX) / this.zoom,
            y: (e.clientY - rect.top - this.panY) / this.zoom
        };
    }

    getDistanceToNodeRect(pos, node) {
        const dx = Math.max(node.x - pos.x, 0, pos.x - (node.x + node.width));
        const dy = Math.max(node.y - pos.y, 0, pos.y - (node.y + node.height));
        return Math.sqrt(dx * dx + dy * dy);
    }

    getAnchorOnNearestEdge(node, pos) {
        const localX = (pos.x - node.x) / node.width;
        const localY = (pos.y - node.y) / node.height;
        const clampedX = Math.max(0, Math.min(1, localX));
        const clampedY = Math.max(0, Math.min(1, localY));

        const distances = [
            clampedX,           // 左边
            1 - clampedX,       // 右边
            clampedY,           // 上边
            1 - clampedY        // 下边
        ];
        const minDistance = Math.min(...distances);
        let anchorX = clampedX;
        let anchorY = clampedY;
        if (minDistance === distances[0]) {
            anchorX = 0;
        } else if (minDistance === distances[1]) {
            anchorX = 1;
        } else if (minDistance === distances[2]) {
            anchorY = 0;
        } else {
            anchorY = 1;
        }

        return { anchorX, anchorY };
    }

    updateCoordinates(e) {
        const pos = this.getMousePos(e);
        document.getElementById('coordX').textContent = Math.round(pos.x);
        document.getElementById('coordY').textContent = Math.round(pos.y);
    }

    getNodeAt(pos) {
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const node = this.nodes[i];
            if (pos.x >= node.x && pos.x <= node.x + node.width &&
                pos.y >= node.y && pos.y <= node.y + node.height) {
                return node;
            }
        }
        return null;
    }

    getNodeTagText(node, showPlaceholder = true) {
        const tagText = (node.tag || '').trim();
        if (tagText) return tagText;
        return showPlaceholder ? '+' : '';
    }

    getNodeTagRect(node, ctx = this.ctx, showPlaceholder = true) {
        const text = this.getNodeTagText(node, showPlaceholder);
        if (!text) return null;

        const fontSize = 10;
        const paddingX = 6;
        const paddingY = 3;
        ctx.save();
        ctx.font = `bold ${fontSize}px sans-serif`;
        const textWidth = ctx.measureText(text).width;
        ctx.restore();

        let width = Math.max(16, textWidth + paddingX * 2);
        const height = fontSize + paddingY * 2;
        const maxWidth = Math.max(12, node.width - 4);
        if (width > maxWidth) width = maxWidth;

        // 贴在节点外部右上角
        const x = node.x + node.width - width + 6;
        const y = node.y - height / 2 - 4;

        return { x, y, width, height, text, fontSize };
    }

    isTagHit(pos, node) {
        const rect = this.getNodeTagRect(node, this.ctx, false);
        if (!rect) return false;
        return (
            pos.x >= rect.x &&
            pos.x <= rect.x + rect.width &&
            pos.y >= rect.y &&
            pos.y <= rect.y + rect.height
        );
    }

    getNodeTagHit(pos) {
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const node = this.nodes[i];
            if (this.isTagHit(pos, node)) return node;
        }
        return null;
    }

    drawNodeTag(ctx, node, isNightMode, showPlaceholder = true) {
        const rect = this.getNodeTagRect(node, ctx, showPlaceholder);
        if (!rect) return;

        const hasTag = !!(node.tag && node.tag.trim());
        const tagBg = hasTag
            ? (isNightMode ? 'rgba(248,250,252,0.2)' : '#fff7ed')
            : (isNightMode ? 'rgba(148,163,184,0.2)' : '#f3f4f6');
        const tagBorder = hasTag
            ? (isNightMode ? 'rgba(248,250,252,0.5)' : '#f59e0b')
            : (isNightMode ? 'rgba(148,163,184,0.5)' : '#9ca3af');
        const tagTextColor = hasTag
            ? (isNightMode ? '#f8fafc' : '#92400e')
            : (isNightMode ? '#e2e8f0' : '#6b7280');

        ctx.save();
        ctx.fillStyle = tagBg;
        ctx.strokeStyle = tagBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 6);
        } else {
            ctx.rect(rect.x, rect.y, rect.width, rect.height);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = tagTextColor;
        ctx.font = `bold ${rect.fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rect.text, rect.x + rect.width / 2, rect.y + rect.height / 2);
        ctx.restore();
    }

    // 递归获取节点的所有子节点
    getAllChildNodes(parentNode, visited = new Set()) {
        if (visited.has(parentNode)) return [];
        visited.add(parentNode);

        const children = [];
        const directChildren = this.connections
            .filter(conn => conn.from === parentNode && !conn.isIndependent)
            .map(conn => conn.to);

        for (const child of directChildren) {
            children.push(child);
            // 递归获取子节点的子节点
            const grandChildren = this.getAllChildNodes(child, visited);
            children.push(...grandChildren);
        }

        return children;
    }

    getConnectionLineType(connection) {
        return connection.lineType || 'curve';
    }

    getElbowPoints(x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        if (dx >= dy) {
            return [
                { x: x1, y: y1 },
                { x: x2, y: y1 },
                { x: x2, y: y2 }
            ];
        }
        return [
            { x: x1, y: y1 },
            { x: x1, y: y2 },
            { x: x2, y: y2 }
        ];
    }

    getPolylineMidpoint(points) {
        if (!points || points.length < 2) return points && points[0] ? points[0] : { x: 0, y: 0 };
        let total = 0;
        for (let i = 0; i < points.length - 1; i++) {
            total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
        }
        let remaining = total / 2;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const seg = Math.hypot(b.x - a.x, b.y - a.y);
            if (seg === 0) continue;
            if (remaining <= seg) {
                const t = remaining / seg;
                return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            }
            remaining -= seg;
        }
        return points[points.length - 1];
    }

    distancePointToSegment(pos, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx === 0 && dy === 0) return Math.hypot(pos.x - a.x, pos.y - a.y);
        const t = ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / (dx * dx + dy * dy);
        const clamped = Math.max(0, Math.min(1, t));
        const projX = a.x + clamped * dx;
        const projY = a.y + clamped * dy;
        return Math.hypot(pos.x - projX, pos.y - projY);
    }

    getConnectionAt(pos) {
        const tolerance = 10; // 点击容差范围

        for (let i = this.connections.length - 1; i >= 0; i--) {
            const connection = this.connections[i];
            const { x1, y1, x2, y2 } = this.getConnectionEndpoints(connection);
            const lineType = this.getConnectionLineType(connection);

            if (lineType === 'curve') {
                // 使用controlOffsetY调整贝塞尔曲线的控制点
                const cp1y = y1 + (y2 - y1) / 2 + (connection.controlOffsetY || 0);
                const cp2y = y2 - (y2 - y1) / 2 + (connection.controlOffsetY || 0);

                // 检查点是否在贝塞尔曲线附近
                for (let t = 0; t <= 1; t += 0.05) {
                    const mt = 1 - t;
                    const curveX = mt * mt * mt * x1 +
                                  3 * mt * mt * t * x1 +
                                  3 * mt * t * t * x2 +
                                  t * t * t * x2;
                    const curveY = mt * mt * mt * y1 +
                                  3 * mt * mt * t * cp1y +
                                  3 * mt * t * t * cp2y +
                                  t * t * t * y2;

                    const distance = Math.sqrt((pos.x - curveX) ** 2 + (pos.y - curveY) ** 2);
                    if (distance < tolerance) {
                        return connection;
                    }
                }
            } else if (lineType === 'straight') {
                const distance = this.distancePointToSegment(pos, { x: x1, y: y1 }, { x: x2, y: y2 });
                if (distance < tolerance) return connection;
            } else if (lineType === 'elbow') {
                const points = this.getElbowPoints(x1, y1, x2, y2);
                for (let p = 0; p < points.length - 1; p++) {
                    const distance = this.distancePointToSegment(pos, points[p], points[p + 1]);
                    if (distance < tolerance) return connection;
                }
            }
        }
        return null;
    }

    // 检测鼠标是否在连接线的控制点上
    getConnectionControlAt(pos) {
        const controlRadius = 12; // 控制点的检测范围

        for (let i = this.connections.length - 1; i >= 0; i--) {
            const connection = this.connections[i];

            // 只有选中的连接线才显示控制点
            if (!this.selectedConnections.includes(connection)) {
                continue;
            }

            const { x1, y1, x2, y2 } = this.getConnectionEndpoints(connection);

            const offset = connection.controlOffsetY || 0;
            const cp1y = y1 + (y2 - y1) / 2 + offset;
            const cp2y = y2 - (y2 - y1) / 2 + offset;

            // 计算贝塞尔曲线中点（t=0.5）
            const t = 0.5;
            const mt = 1 - t;
            const controlX = mt * mt * mt * x1 +
                           3 * mt * mt * t * x1 +
                           3 * mt * t * t * x2 +
                           t * t * t * x2;
            const controlY = mt * mt * mt * y1 +
                           3 * mt * mt * t * cp1y +
                           3 * mt * t * t * cp2y +
                           t * t * t * y2;

            const distance = Math.sqrt((pos.x - controlX) ** 2 + (pos.y - controlY) ** 2);
            if (distance < controlRadius) {
                return { connection, controlX, controlY };
            }
        }
        return null;
    }

    // 检测鼠标是否在连接线端点拖拽手柄上
    getConnectionEndpointHandleAt(pos) {
        const handleRadius = 10;

        for (let i = this.connections.length - 1; i >= 0; i--) {
            const connection = this.connections[i];

            // 只有选中的连接线才显示端点手柄
            if (!this.selectedConnections.includes(connection)) {
                continue;
            }

            const { x1, y1, x2, y2 } = this.getConnectionEndpoints(connection);

            const distFrom = Math.sqrt((pos.x - x1) ** 2 + (pos.y - y1) ** 2);
            if (distFrom <= handleRadius) {
                return { connection, side: 'from' };
            }

            const distTo = Math.sqrt((pos.x - x2) ** 2 + (pos.y - y2) ** 2);
            if (distTo <= handleRadius) {
                return { connection, side: 'to' };
            }
        }

        return null;
    }

    getResizeHandleAt(pos, node) {
        const handleSize = 18; // 角的检测范围（增大到18像素，更容易点击）

        // 检查四个角（使用角本身的坐标）
        const tl = { x: node.x, y: node.y, name: 'tl' };
        const tr = { x: node.x + node.width, y: node.y, name: 'tr' };
        const bl = { x: node.x, y: node.y + node.height, name: 'bl' };
        const br = { x: node.x + node.width, y: node.y + node.height, name: 'br' };

        const corners = [tl, tr, bl, br];

        for (let corner of corners) {
            const dx = pos.x - corner.x;
            const dy = pos.y - corner.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < handleSize) {
                return corner.name;
            }
        }

        return null;
    }

    // 检测是否点击了图片的调整控制点
    getImageResizeHandleAt(pos, node) {
        if (!node.image || !node.imageDisplayWidth || !node.imageDisplayHeight) {
            return null;
        }

        const handleSize = 18; // 角的检测范围
        const imgX = node.x + (node.width - node.imageDisplayWidth) / 2;
        const imgY = node.y + this.IMAGE_TOP_PADDING;

        // 图片的四个角
        const tl = { x: imgX, y: imgY, name: 'tl' };
        const tr = { x: imgX + node.imageDisplayWidth, y: imgY, name: 'tr' };
        const bl = { x: imgX, y: imgY + node.imageDisplayHeight, name: 'bl' };
        const br = { x: imgX + node.imageDisplayWidth, y: imgY + node.imageDisplayHeight, name: 'br' };

        const corners = [tl, tr, bl, br];

        for (let corner of corners) {
            const dx = pos.x - corner.x;
            const dy = pos.y - corner.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < handleSize) {
                return corner.name;
            }
        }

        return null;
    }

    // 检测点击位置是否在节点的图片上，返回图片信息
    getImageAtPosition(pos) {
        // 遍历所有节点
        for (const node of this.nodes) {
            // 检查点击是否在节点范围内
            if (pos.x < node.x || pos.x > node.x + node.width ||
                pos.y < node.y || pos.y > node.y + node.height) {
                continue;
            }

            // 检查节点是否有 content 数组
            if (!node.content || node.content.length === 0) continue;

            // 计算内容的总高度（与 drawNode 中的逻辑保持一致）
            const fontSize = node.fontSize || 13;
            const lineHeight = fontSize * 1.3;
            this.ctx.font = `${fontSize}px sans-serif`;

            let totalContentHeight = 0;
            node.content.forEach((item, index) => {
                if (item.type === 'image') {
                    const displayWidth = item.displayWidth || item.width;
                    const displayHeight = item.displayHeight || item.height;
                    totalContentHeight += displayHeight;
                    if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
                } else if (item.type === 'text') {
                    const lines = this.wrapText(item.value, node.width - this.NODE_HORIZONTAL_PADDING, this.ctx);
                    totalContentHeight += lines.length * lineHeight;
                    if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
                } else if (item.type === 'link') {
                    // 链接类型：标题（粗体）+ URL
                    this.ctx.font = `bold ${fontSize}px sans-serif`;
                    const titleLines = this.wrapText(item.title || item.url, node.width - this.NODE_HORIZONTAL_PADDING, this.ctx);
                    this.ctx.font = `${fontSize}px sans-serif`; // 恢复常规字体
                    totalContentHeight += titleLines.length * lineHeight;
                    totalContentHeight += lineHeight * 0.8;
                    if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
                } else if (item.type === 'pending_link') {
                    const lines = this.wrapText(item.value || item.url, node.width - this.NODE_HORIZONTAL_PADDING, this.ctx);
                    totalContentHeight += lines.length * lineHeight;
                    if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
                }
            });

            // 计算起始Y位置
            let currentY = node.y + (node.height - totalContentHeight) / 2;

            // 遍历 content 数组，检查每个图片的位置
            for (let i = 0; i < node.content.length; i++) {
                const item = node.content[i];

                if (i > 0) {
                    currentY += this.IMAGE_TEXT_GAP;
                }

                if (item.type === 'image') {
                    // 计算图片显示尺寸（与 drawNode 保持一致）
                    const displayWidth = item.displayWidth || item.width;
                    const displayHeight = item.displayHeight || item.height;

                    const imgX = node.x + (node.width - displayWidth) / 2;

                    // 检查点击是否在图片范围内
                    if (pos.x >= imgX && pos.x <= imgX + displayWidth &&
                        pos.y >= currentY && pos.y <= currentY + displayHeight) {
                        return {
                            node: node,
                            imageIndex: i,
                            imageData: item.value,
                            imageWidth: item.width,
                            imageHeight: item.height
                        };
                    }

                    currentY += displayHeight;
                } else if (item.type === 'text') {
                    const lines = this.wrapText(item.value, node.width - this.NODE_HORIZONTAL_PADDING, this.ctx);
                    currentY += lines.length * lineHeight;
                }
            }
        }

        return null;
    }

    // 统一右键菜单
    showContextMenu(x, y, options = {}) {
        let menu = document.getElementById('unifiedContextMenu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'unifiedContextMenu';
            menu.className = 'context-menu';
            document.body.appendChild(menu);
        }

        const items = [];
        const node = options.node || null;
        const hasShortcut = node && shortcutManager && shortcutManager.hasShortcut(node.id, this.currentFileName);

        if (options.imageInfo) {
            items.push({
                id: 'ctxViewImage',
                label: '🔍 大图显示',
                action: () => {
                    this.showLargeImage(options.imageInfo.imageData);
                    this.hideContextMenu();
                }
            });
        } else if (node && shortcutManager) {
            // 只在非图片情况下显示快捷方式菜单
            if (!hasShortcut) {
                items.push({
                    id: 'ctxAddShortcut',
                    label: '添加到快捷方式',
                    action: () => {
                        this.addShortcutFromNode(node);
                        this.hideContextMenu();
                    }
                });
            } else {
                items.push({
                    id: 'ctxRemoveShortcut',
                    label: '从快捷方式移除',
                    action: () => {
                        this.removeShortcutById(node.id, this.currentFileName);
                        this.hideContextMenu();
                    }
                });
            }
        }

        if (node) {
            const currentTag = (node.tag || '').trim();
            items.push({
                id: 'ctxEditTag',
                label: currentTag ? '编辑标签' : '添加标签',
                action: () => {
                    const input = prompt('请输入标签（留空清除）：', currentTag);
                    if (input === null) return;
                    const trimmed = input.trim();
                    if (trimmed) {
                        node.tag = trimmed;
                    } else {
                        delete node.tag;
                    }
                    this.saveToLocalStorage();
                    this.draw();
                    this.hideContextMenu();
                }
            });
            if (currentTag) {
                items.push({
                    id: 'ctxClearTag',
                    label: '清除标签',
                    action: () => {
                        delete node.tag;
                        this.saveToLocalStorage();
                        this.draw();
                        this.hideContextMenu();
                    }
                });
            }
        }

        if (options.allowCopyText && !options.imageInfo) {
            items.push({
                id: 'ctxCopyText',
                label: '复制',
                action: () => {
                    this.copySelectedText();
                    this.hideContextMenu();
                }
            });
        }

        // 当有节点被选中时（单个或多个），显示"提取到新页面"选项
        if ((this.selectedNodes && this.selectedNodes.length > 0) || this.selectedNode) {
            items.push({
                id: 'ctxExtractToPage',
                label: '提取到新页面',
                action: () => {
                    this.showExtractToPageModal();
                    this.hideContextMenu();
                }
            });
        }

        menu.innerHTML = items.map((item, idx) => {
            const htmlId = `${item.id}_${idx}`;
            item._htmlId = htmlId;
            return `<div class="context-menu-item" id="${htmlId}">${item.label}</div>`;
        }).join('');

        items.forEach(item => {
            const el = document.getElementById(item._htmlId);
            if (el) {
                el.onclick = item.action;
            }
        });

        const menuWidth = menu.offsetWidth || 180;
        const menuHeight = menu.offsetHeight || items.length * 32;
        const left = Math.min(x, window.innerWidth - menuWidth - 4);
        const top = Math.min(y, window.innerHeight - menuHeight - 4);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.display = 'block';

        setTimeout(() => {
            document.addEventListener('click', this.hideContextMenuHandler = () => this.hideContextMenu(), { once: true });
        }, 0);
    }

    hideContextMenu() {
        const menu = document.getElementById('unifiedContextMenu');
        if (menu) menu.style.display = 'none';

        // 清除文本选择状态
        this.textSelectionStart = null;
        this.textSelectionEnd = null;
        this.textSelectionNode = null;
        this.rightClickStartPos = null;
        this.rightClickNode = null;

        this.draw();
    }

    // 节点快捷方式菜单
    showNodeContextMenu(x, y, node) {
        let menu = document.getElementById('nodeContextMenu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'nodeContextMenu';
            menu.className = 'context-menu';
            menu.innerHTML = `
                <div class="context-menu-item" id="ctxAddShortcut">添加到快捷方式</div>
                <div class="context-menu-item" id="ctxRemoveShortcut">从快捷方式移除</div>
            `;
            document.body.appendChild(menu);
        }

        const hasShortcut = shortcutManager && shortcutManager.hasShortcut(node.id, this.currentFileName);
        const addItem = document.getElementById('ctxAddShortcut');
        const removeItem = document.getElementById('ctxRemoveShortcut');
        if (addItem) addItem.style.display = hasShortcut ? 'none' : 'block';
        if (removeItem) removeItem.style.display = hasShortcut ? 'block' : 'none';

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.display = 'block';

        if (addItem) {
            addItem.onclick = () => {
                this.addShortcutFromNode(node);
                this.hideNodeContextMenu();
            };
        }
        if (removeItem) {
            removeItem.onclick = () => {
                this.removeShortcutById(node.id, this.currentFileName);
                this.hideNodeContextMenu();
            };
        }

        setTimeout(() => {
            document.addEventListener('click', this.hideNodeContextMenuHandler = () => this.hideNodeContextMenu(), { once: true });
        }, 0);
    }

    hideNodeContextMenu() {
        const menu = document.getElementById('nodeContextMenu');
        if (menu) menu.style.display = 'none';
    }

    addShortcutFromNode(node) {
        if (!shortcutManager || !node) return;
        if (this.screenId === AppState.activeScreen) {
            shortcutManager.setActiveFile(this.currentFileName);
        }
        const label = this.getNodeLabel(node);
        shortcutManager.addShortcut({
            nodeId: node.id,
            fileName: this.currentFileName,
            label,
            color: node.color
        });
    }

    removeShortcutById(nodeId, fileName) {
        if (!shortcutManager) return;
        shortcutManager.removeShortcut(nodeId, fileName || this.currentFileName);
    }

    // 递归获取节点的所有子节点
    getAllDescendants(node, visited = new Set()) {
        const descendants = [];
        if (!node || visited.has(node.id)) return descendants;
        visited.add(node.id);

        // 找到所有以该节点为起点的连接（子节点）
        this.connections.forEach(conn => {
            if (conn.from && conn.from.id === node.id && conn.to && !visited.has(conn.to.id)) {
                descendants.push(conn.to);
                // 递归获取子节点的子节点
                const subDescendants = this.getAllDescendants(conn.to, visited);
                descendants.push(...subDescendants);
            }
        });

        return descendants;
    }

    // 显示提取到新页面的模态框
    showExtractToPageModal() {
        const modal = document.getElementById('extractToPageModal');
        const input = document.getElementById('extractPageName');
        if (!modal || !input) return;

        // 生成默认名称
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        input.value = `extracted_${timestamp}`;

        modal.classList.add('active');
        input.focus();
        input.select();

        // 确定要提取的节点
        let nodesToExtract = [];

        if (this.selectedNodes && this.selectedNodes.length > 0) {
            // 多选模式：使用所有选中的节点
            nodesToExtract = [...this.selectedNodes];
        } else if (this.selectedNode) {
            // 单选模式：提取选中的节点及其所有子节点
            nodesToExtract = [this.selectedNode];
            const descendants = this.getAllDescendants(this.selectedNode);
            nodesToExtract.push(...descendants);
        }

        // 存储要提取的节点，以便确认时使用
        this._pendingExtractNodes = nodesToExtract;
    }

    // 执行提取节点到新页面的操作
    extractNodesToNewPage(pageName) {
        if (!pageName || !this._pendingExtractNodes || this._pendingExtractNodes.length === 0) {
            console.error('[提取到新页面] 无效的参数');
            return;
        }

        const selectedNodeIds = new Set(this._pendingExtractNodes.map(n => n.id));
        const nodesToExtract = [...this._pendingExtractNodes];

        // 找出需要提取的节点的所有父节点（不在选中列表中但有连接指向选中节点的节点）
        const parentConnections = this.connections.filter(conn => {
            const fromId = conn.from && conn.from.id;
            const toId = conn.to && conn.to.id;
            return !selectedNodeIds.has(fromId) && selectedNodeIds.has(toId);
        });

        // 提取节点之间的连接（from和to都在选中列表中）
        const internalConnections = this.connections.filter(conn => {
            const fromId = conn.from && conn.from.id;
            const toId = conn.to && conn.to.id;
            return selectedNodeIds.has(fromId) && selectedNodeIds.has(toId);
        });

        // 计算提取节点的边界框，用于在新页面中重新定位
        let minX = Infinity, minY = Infinity;
        nodesToExtract.forEach(node => {
            if (node.x < minX) minX = node.x;
            if (node.y < minY) minY = node.y;
        });

        // 复制节点并调整位置（使其从画布中心附近开始）
        const offsetX = 200 - minX;
        const offsetY = 200 - minY;

        const newNodes = nodesToExtract.map(node => {
            const newNode = JSON.parse(JSON.stringify(node));
            newNode.x += offsetX;
            newNode.y += offsetY;
            return newNode;
        });

        // 复制内部连接
        const newConnections = internalConnections.map(conn => ({
            from: { id: conn.from.id },
            to: { id: conn.to.id },
            controlOffsetY: conn.controlOffsetY || 0,
            lineStyle: conn.lineStyle || 'solid',
            lineType: conn.lineType || 'curve',
            lineWidth: conn.lineWidth || 2,
            color: conn.color || '#667eea',
            arrowSize: conn.arrowSize || 20,
            label: conn.label || '',
            labelFontSize: conn.labelFontSize || 12,
            isIndependent: !!conn.isIndependent,
            fromAnchorX: conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5,
            fromAnchorY: conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1,
            toAnchorX: conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5,
            toAnchorY: conn.toAnchorY !== undefined ? conn.toAnchorY : 0
        }));

        // 在新页面中为原来与父节点连接的子节点创建"返回原页面"的链接节点
        const originalFileName = this.currentFileName;
        if (parentConnections.length > 0) {
            // 找出所有原来与父节点连接的子节点（在新页面中的位置）
            const childNodeIds = new Set();
            parentConnections.forEach(conn => {
                childNodeIds.add(conn.to.id);
            });

            // 找到这些子节点在新页面中最左上角的位置
            let backLinkX = Infinity, backLinkY = Infinity;
            newNodes.forEach(node => {
                if (childNodeIds.has(node.id)) {
                    if (node.x < backLinkX) backLinkX = node.x;
                    if (node.y < backLinkY) backLinkY = node.y;
                }
            });

            // 创建返回原页面的链接节点，放在子节点的左上方
            const backLinkNode = {
                id: Date.now() + Math.random() + 0.001,
                content: [{
                    type: 'pageLink',
                    value: originalFileName,
                    label: `← ${originalFileName}`
                }],
                x: backLinkX - 150,
                y: backLinkY - 60,
                width: Math.max(100, originalFileName.length * 10 + 40),
                height: 40,
                color: '#fef3c7',  // 浅黄色背景表示返回链接
                textColor: '#92400e',
                fontSize: 13,
                textAlign: 'center',
                shape: 'rounded-rect',
                properties: '',
                codeMode: false,
                codeLanguage: 'auto',
                isPageLink: true
            };
            newNodes.push(backLinkNode);

            // 为每个原来与父节点连接的子节点创建从返回链接节点到它的连接
            childNodeIds.forEach(childId => {
                newConnections.push({
                    from: { id: backLinkNode.id },
                    to: { id: childId },
                    controlOffsetY: 0,
                    lineStyle: 'solid',
                    lineType: 'curve',
                    lineWidth: 2,
                    color: '#f59e0b',  // 橙色连接线
                    arrowSize: 20,
                    label: '',
                    labelFontSize: 12,
                    isIndependent: false,
                    fromAnchorX: 0.5,
                    fromAnchorY: 1,
                    toAnchorX: 0.5,
                    toAnchorY: 0
                });
            });
        }

        // 创建新页面的数据
        const newPageData = {
            nodes: newNodes,
            connections: newConnections,
            zoom: 1,
            panX: 0,
            panY: 0,
            timestamp: new Date().toISOString()
        };

        // 保存新页面到 localStorage
        const namespace = AppState.namespaceManager ? AppState.namespaceManager.getCurrentNamespace() : 'default';
        const newPageKey = `mindmap_${namespace}_${pageName}`;
        localStorage.setItem(newPageKey, JSON.stringify(newPageData));

        // 在原页面中，为每个父节点创建页面链接节点
        const linkNodesCreated = [];
        const processedParentIds = new Set();

        parentConnections.forEach(conn => {
            const parentNode = conn.from;
            const childNode = conn.to;

            // 避免为同一个父节点创建多个链接节点
            if (processedParentIds.has(parentNode.id)) return;
            processedParentIds.add(parentNode.id);

            // 创建页面链接节点，放在原来子节点的位置
            const linkNode = {
                id: Date.now() + Math.random(),
                content: [{
                    type: 'pageLink',
                    value: pageName,
                    label: `→ ${pageName}`
                }],
                x: childNode.x,
                y: childNode.y,
                width: Math.max(100, pageName.length * 10 + 40),
                height: 40,
                color: '#e0f2fe',  // 浅蓝色背景表示这是一个链接
                textColor: '#0369a1',
                fontSize: 13,
                textAlign: 'center',
                shape: 'rounded-rect',
                properties: '',
                codeMode: false,
                codeLanguage: 'auto',
                isPageLink: true  // 标记为页面链接节点
            };

            this.nodes.push(linkNode);
            linkNodesCreated.push({ linkNode, parentNode });
        });

        // 如果选中的节点没有父节点，在第一个选中节点的位置创建独立的页面链接节点
        if (linkNodesCreated.length === 0 && nodesToExtract.length > 0) {
            const firstNode = nodesToExtract[0];
            const linkNode = {
                id: Date.now() + Math.random(),
                content: [{
                    type: 'pageLink',
                    value: pageName,
                    label: `→ ${pageName}`
                }],
                x: firstNode.x,
                y: firstNode.y,
                width: Math.max(100, pageName.length * 10 + 40),
                height: 40,
                color: '#e0f2fe',
                textColor: '#0369a1',
                fontSize: 13,
                textAlign: 'center',
                shape: 'rounded-rect',
                properties: '',
                codeMode: false,
                codeLanguage: 'auto',
                isPageLink: true
            };
            this.nodes.push(linkNode);
            // 独立的页面链接节点不需要连接
        }

        // 为页面链接节点创建到父节点的连接
        linkNodesCreated.forEach(({ linkNode, parentNode }) => {
            this.connections.push({
                from: parentNode,
                to: linkNode,
                controlOffsetY: 0,
                lineStyle: this.defaultLineStyle || 'solid',
                lineType: this.defaultLineType || 'curve',
                lineWidth: this.defaultLineWidth || 2,
                color: '#0ea5e9',  // 蓝色连接线
                arrowSize: this.defaultArrowSize || 20,
                label: '',
                labelFontSize: 12,
                isIndependent: false,
                fromAnchorX: 0.5,
                fromAnchorY: 1,
                toAnchorX: 0.5,
                toAnchorY: 0
            });
        });

        // 从原页面删除选中的节点
        this.nodes = this.nodes.filter(n => !selectedNodeIds.has(n.id));

        // 删除与选中节点相关的连接
        this.connections = this.connections.filter(conn => {
            const fromId = conn.from && conn.from.id;
            const toId = conn.to && conn.to.id;
            return !selectedNodeIds.has(fromId) && !selectedNodeIds.has(toId);
        });

        // 清除选中状态
        this.selectedNodes = [];
        this.selectedNode = null;
        this._pendingExtractNodes = null;

        // 保存当前页面
        this.saveToLocalStorage();
        this.draw();

        // 更新侧边栏文件列表
        if (this.screenId === 'left' || this.screenId === AppState.activeScreen) {
            const searchInput = document.getElementById('fileSearchInput');
            const searchTerm = searchInput ? searchInput.value : '';
            this.updateSidebarFileList(searchTerm);
        }

        console.log(`[提取到新页面] 成功将 ${nodesToExtract.length} 个节点提取到新页面: ${pageName}`);
    }

    // 处理页面链接节点的点击，导航到目标页面
    navigateToPageLink(node) {
        if (!node || !node.isPageLink) return false;

        const pageLinkContent = node.content && node.content.find(item => item.type === 'pageLink');
        if (!pageLinkContent) return false;

        const targetPage = pageLinkContent.value;
        if (!targetPage) return false;

        // 检查目标页面是否存在
        const namespace = AppState.namespaceManager ? AppState.namespaceManager.getCurrentNamespace() : 'default';
        const pageKey = `mindmap_${namespace}_${targetPage}`;
        const pageData = localStorage.getItem(pageKey);

        if (!pageData) {
            alert(`页面 "${targetPage}" 不存在或已被删除`);
            return false;
        }

        // 加载目标页面
        this.loadFile(targetPage);
        return true;
    }

    // 复制选中的文本
    copySelectedText() {
        if (!this.textSelectionNode || !this.textSelectionStart || !this.textSelectionEnd) {
            return;
        }

        const node = this.textSelectionNode;

        // 提取节点中的所有文本内容
        let allText = '';
        if (node.content) {
            node.content.forEach(item => {
                if (item.type === 'text') {
                    allText += item.value + '\n';
                } else if (item.type === 'link') {
                    allText += (item.title || item.url) + '\n';
                } else if (item.type === 'pending_link') {
                    allText += (item.value || item.url || '') + '\n';
                }
            });
        }

        // 复制整个节点的文本内容
        if (allText) {
            navigator.clipboard.writeText(allText.trim()).then(() => {
                console.log('文本已复制到剪贴板');
            }).catch(err => {
                console.error('复制失败:', err);
            });
        }
    }

    // 显示大图
    showLargeImage(imageData) {
        const modal = document.getElementById('imageViewerModal');
        const img = document.getElementById('largeImageView');
        const content = document.getElementById('imageViewerContent');
        if (!modal || !img) return;

        // 重置缩放状态
        if (typeof imageViewerState !== 'undefined') {
            imageViewerState.zoom = 1;
            updateImageZoom();
        }

        // 重置窗口大小为默认值
        if (content) {
            content.style.width = '70vw';
            content.style.height = '70vh';
        }

        img.src = imageData;
        modal.classList.add('active');
    }

    selectItemsInArea() {
        if (!this.selectionStart || !this.selectionEnd) return;

        const minX = Math.min(this.selectionStart.x, this.selectionEnd.x);
        const maxX = Math.max(this.selectionStart.x, this.selectionEnd.x);
        const minY = Math.min(this.selectionStart.y, this.selectionEnd.y);
        const maxY = Math.max(this.selectionStart.y, this.selectionEnd.y);

        this.selectedNodes = [];
        this.selectedConnections = [];

        // 框选节点（只要部分重叠就选中）
        this.nodes.forEach(node => {
            // 检查矩形是否重叠
            const nodeRight = node.x + node.width;
            const nodeBottom = node.y + node.height;

            // 如果框选区域与节点有重叠，就选中该节点
            if (!(nodeRight < minX || node.x > maxX || nodeBottom < minY || node.y > maxY)) {
                this.selectedNodes.push(node);
            }
        });

        // 框选连线
        this.connections.forEach(connection => {
            // 获取连线的中点
            const { x1, y1, x2, y2 } = this.getConnectionEndpoints(connection);

            // 计算贝塞尔曲线上多个点来检测
            for (let t = 0; t <= 1; t += 0.1) {
                const offset = (connection && connection.controlOffsetY) || 0;
                const cp1y = y1 + (y2 - y1) / 2 + offset;
                const cp2y = y2 - (y2 - y1) / 2 + offset;

                const mt = 1 - t;
                const x = mt * mt * mt * x1 +
                         3 * mt * mt * t * x1 +
                         3 * mt * t * t * x2 +
                         t * t * t * x2;
                const y = mt * mt * mt * y1 +
                         3 * mt * mt * t * cp1y +
                         3 * mt * t * t * cp2y +
                         t * t * t * y2;

                if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                    this.selectedConnections.push(connection);
                    break;
                }
            }
        });
    }

    async addNode() {
        const text = document.getElementById('nodeText').value.trim();
        if (!text) {
            alert('请输入节点文本');
            return;
        }

        const textAlign = document.getElementById('nodeTextAlign').value || 'center';
        const nodeShape = document.getElementById('nodeShape').value || 'rounded-rect';

        // 获取默认节点大小
        const defaultWidth = parseInt(localStorage.getItem('mindmap_default_node_width')) || 100;
        const defaultHeight = parseInt(localStorage.getItem('mindmap_default_node_height')) || 40;

        const centerX = (-this.panX + this.canvas.width / 2) / this.zoom;
        const centerY = (-this.panY + this.canvas.height / 2) / this.zoom;

        // 先创建一个临时文本节点
        const newNode = {
            id: Date.now() + Math.random(),
            content: [{ type: 'text', value: text }],
            x: centerX - defaultWidth / 2,
            y: centerY - defaultHeight / 2,
            width: defaultWidth,
            height: defaultHeight,
            color: this.currentColor,
            textColor: this.currentTextColor,
            fontSize: this.currentFontSize,
            textAlign: textAlign,
            shape: nodeShape,
            properties: '',
            codeMode: false,
            codeLanguage: 'auto'
        };

        this.nodes.push(newNode);
        this.draw();

        // 检测是否为URL，异步获取元数据
        const url = extractURLFromText(text);
        if (url) {
            console.log('[添加节点] 检测到URL:', url);
            try {
                const metadata = await fetchURLMetadata(url);
                if (metadata && metadata.title) {
                    console.log('[添加节点] 获取到元数据:', metadata);
                    // 更新为链接类型
                    newNode.content = [{
                        type: 'link',
                        url: metadata.url,
                        title: metadata.title,
                        description: metadata.description || ''
                    }];
                    // 自动调整节点大小以适应链接内容
                    this.autoFitNodeSize(newNode);
                    this.saveToLocalStorage();
                    this.draw();
                } else {
                    console.log('[添加节点] 元数据获取失败或无标题，使用域名作为标题');
                    // 元数据获取失败，仍然创建link类型，用域名作为标题
                    let fallbackTitle = url;
                    try {
                        const urlObj = new URL(url);
                        fallbackTitle = urlObj.hostname;
                    } catch (e) {}
                    newNode.content = [{
                        type: 'link',
                        url: url,
                        title: fallbackTitle,
                        description: ''
                    }];
                    this.autoFitNodeSize(newNode);
                    this.saveToLocalStorage();
                    this.draw();
                }
            } catch (error) {
                console.error('[添加节点] 元数据获取错误:', error);
                // 发生错误时仍然创建link类型，用域名作为标题
                let fallbackTitle = url;
                try {
                    const urlObj = new URL(url);
                    fallbackTitle = urlObj.hostname;
                } catch (e) {}
                newNode.content = [{
                    type: 'link',
                    url: url,
                    title: fallbackTitle,
                    description: ''
                }];
                this.autoFitNodeSize(newNode);
                this.saveToLocalStorage();
                this.draw();
            }
        }

        document.getElementById('nodeText').value = '';
        this.saveToLocalStorage();
    }

    addNodeAt(pos, skipPrompt = false) {
        let text;

        if (skipPrompt) {
            // 双击创建时使用默认文本
            text = '新节点';
        } else {
            // Ctrl+Click 时仍然使用 prompt
            text = prompt('输入节点文本:');
            if (!text) return null;
        }

        // 获取默认节点大小
        const defaultWidth = parseInt(localStorage.getItem('mindmap_default_node_width')) || 100;
        const defaultHeight = parseInt(localStorage.getItem('mindmap_default_node_height')) || 40;

        const newNode = {
            id: Date.now() + Math.random(),
            content: [{ type: 'text', value: text }],
            x: pos.x - defaultWidth / 2,  // 居中显示
            y: pos.y - defaultHeight / 2,  // 居中显示
            width: defaultWidth,
            height: defaultHeight,
            color: this.currentColor,
            textColor: this.currentTextColor,
            fontSize: this.currentFontSize,
            textAlign: this.currentTextAlign || 'center',
            shape: this.currentShape || 'rounded-rect',
            properties: '', // 节点属性
            codeMode: false,
            codeLanguage: 'auto'
        };

        this.nodes.push(newNode);
        this.selectNode(newNode);  // 选中新创建的节点
        this.saveToLocalStorage();
        this.draw();

        return newNode;  // 返回新创建的节点
    }

    createChildNode(parentNode) {
        // 计算该父节点已有多少个子节点
        const existingChildren = this.connections.filter(c => c.from === parentNode && !c.isIndependent).length;

        // 计算子节点的位置（在父节点右侧）
        const baseOffsetX = 150;  // 基础水平偏移
        const horizontalSpacing = 15;  // 横向间距（节点宽度100的15%）
        const verticalSpacing = 25;  // 垂直间距（节点高度40的62.5%）

        // 根据已有子节点数量计算横向和垂直偏移
        // 第一个子节点：X+0, Y+0
        // 第二个子节点：X+15, Y+25
        // 第三个子节点：X+30, Y+50
        // 第四个子节点：X+45, Y+75
        const offsetX = baseOffsetX + (existingChildren * horizontalSpacing);
        const offsetY = existingChildren * verticalSpacing;

        const childX = parentNode.x + parentNode.width + offsetX;
        const childY = parentNode.y + offsetY;

        // 创建子节点
        // 获取默认节点大小
        const defaultWidth = parseInt(localStorage.getItem('mindmap_default_node_width')) || 100;
        const defaultHeight = parseInt(localStorage.getItem('mindmap_default_node_height')) || 40;

        const childNode = {
            id: Date.now() + Math.random(),
            content: [{ type: 'text', value: '新节点' }],
            x: childX,
            y: childY,
            width: defaultWidth,
            height: defaultHeight,
            color: this.currentColor,
            textColor: this.currentTextColor,
            fontSize: this.currentFontSize,
            textAlign: this.currentTextAlign || 'center', // 文本对齐方式
            shape: this.currentShape || 'rounded-rect',
            properties: '', // 节点属性
            codeMode: false,
            codeLanguage: 'auto'
        };

        this.nodes.push(childNode);

        // 创建从父节点到子节点的连接
        const connectionExists = this.connections.some(
            c => c.from === parentNode && c.to === childNode
        );

        if (!connectionExists) {
            this.connections.push({
                from: parentNode,
                to: childNode,
                controlOffsetY: 0,
                lineStyle: this.defaultLineStyle || 'solid',
                lineType: this.defaultLineType || 'curve',
                lineWidth: this.defaultLineWidth || 2,
                color: this.defaultLineColor || '#667eea',
                arrowSize: this.defaultArrowSize || 20,
                label: '',
                labelFontSize: 12,
                isIndependent: this.defaultLineIndependent,
                fromAnchorX: 0.5,
                fromAnchorY: 1,
                toAnchorX: 0.5,
                toAnchorY: 0
            });
        }

        // 选中新创建的子节点
        this.selectNode(childNode);
        this.saveToLocalStorage();
        this.draw();

        // 进入编辑模式
        setTimeout(() => {
            this.startNodeEditing(childNode);
        }, 0);

        return childNode;
    }

    selectNode(node) {
        this.selectedNode = node;

        // 只有activeScreen的app更新侧边栏
        if (this.screenId === AppState.activeScreen) {
            if (node) {
                this.updateSidebar('node');

                // 从content数组中提取文本内容
                let textValue = '';
                if (node.content && Array.isArray(node.content)) {
                    const textItem = node.content.find(item => item.type === 'text');
                    const linkItem = node.content.find(item => item.type === 'link');
                    if (linkItem) {
                        textValue = linkItem.url || '';
                    } else if (textItem) {
                        textValue = textItem.value || '';
                    }
                } else if (node.text) {
                    // 兼容旧格式
                    textValue = node.text;
                }
                document.getElementById('editText').value = textValue;
                document.getElementById('editText').disabled = false;
                document.getElementById('editFontSize').value = node.fontSize || 13;
                document.getElementById('editFontSize').disabled = false;
                const editFontSizeDec = document.getElementById('editFontSizeDec');
                const editFontSizeInc = document.getElementById('editFontSizeInc');
                if (editFontSizeDec) editFontSizeDec.disabled = false;
                if (editFontSizeInc) editFontSizeInc.disabled = false;
                ['editAlignLeft','editAlignCenter','editAlignRight'].forEach(id => {
                    const btn = document.getElementById(id);
                    if (btn) btn.disabled = false;
                });
                const editCodeMode = document.getElementById('editCodeMode');
                if (editCodeMode) {
                    editCodeMode.checked = !!node.codeMode;
                    editCodeMode.disabled = false;
                }
                const editCodeLanguage = document.getElementById('editCodeLanguage');
                if (editCodeLanguage) {
                    editCodeLanguage.value = node.codeLanguage || 'auto';
                    editCodeLanguage.disabled = false;
                }
                document.getElementById('editTextAlign').value = node.textAlign || 'center';
                document.getElementById('editTextAlign').disabled = false;
                document.getElementById('editNodeShape').value = node.shape || 'rounded-rect';
                document.getElementById('editNodeShape').disabled = false;
                const editNodeWidth = document.getElementById('editNodeWidth');
                if (editNodeWidth) {
                    editNodeWidth.value = Math.round(node.width || 100);
                    editNodeWidth.disabled = false;
                }
                const editNodeHeight = document.getElementById('editNodeHeight');
                if (editNodeHeight) {
                    editNodeHeight.value = Math.round(node.height || 40);
                    editNodeHeight.disabled = false;
                }
                document.getElementById('nodeLocked').checked = node.locked || false;
                document.getElementById('nodeLocked').disabled = false;
                document.getElementById('deleteNodeBtn').disabled = false;

                // 启用预设选择器和管理按钮
                const editNodePresetSelect = document.getElementById('editNodePresetSelect');
                if (editNodePresetSelect) editNodePresetSelect.disabled = false;
                const editCreateNodePresetBtn = document.getElementById('editCreateNodePresetBtn');
                if (editCreateNodePresetBtn) editCreateNodePresetBtn.disabled = false;
                const editSaveNodePresetBtn = document.getElementById('editSaveNodePresetBtn');
                if (editSaveNodePresetBtn) editSaveNodePresetBtn.disabled = false;

                // Check if the selected node matches any preset
                const presets = AppState.getNodePresets();
                let matchedPreset = "";
                for (const key in presets) {
                    const preset = presets[key];
                    if (
                        preset.color === node.color &&
                        preset.textColor === node.textColor &&
                        preset.fontSize === node.fontSize &&
                        preset.textAlign === node.textAlign &&
                        preset.shape === node.shape &&
                        Math.round(preset.width) === Math.round(node.width) &&
                        Math.round(preset.height) === Math.round(node.height) &&
                        !!preset.locked === !!node.locked
                    ) {
                        matchedPreset = key;
                        break;
                    }
                }
                if (editNodePresetSelect) editNodePresetSelect.value = matchedPreset;

                // 高亮显示当前节点的颜色
                const editColorPicker = document.getElementById('editColorPicker');
                if (editColorPicker) {
                    const colorOptions = editColorPicker.querySelectorAll('.color-option');
                    colorOptions.forEach(option => {
                        if (option.getAttribute('data-color') === node.color) {
                            option.classList.add('selected');
                        } else {
                            option.classList.remove('selected');
                        }
                    });
                }
                const editTextColorPicker = document.getElementById('editTextColorPicker');
                if (editTextColorPicker) {
                    const currentTextColor = node.textColor || this.currentTextColor || '#1f2937';
                    const textColorOptions = editTextColorPicker.querySelectorAll('.color-option');
                    textColorOptions.forEach(option => {
                        if (option.getAttribute('data-color') === currentTextColor) {
                            option.classList.add('selected');
                        } else {
                            option.classList.remove('selected');
                        }
                    });
                }

                // 显示节点属性面板
                document.getElementById('nodePropertiesSection').style.display = 'block';
                document.getElementById('nodeProperties').value = node.properties || '';
                document.getElementById('nodeProperties').disabled = false;
            } else {
                this.updateSidebar('default');
                document.getElementById('editText').value = '';
                document.getElementById('editText').disabled = true;
                document.getElementById('editFontSize').value = '';
                document.getElementById('editFontSize').disabled = true;
                const editFontSizeDec = document.getElementById('editFontSizeDec');
                const editFontSizeInc = document.getElementById('editFontSizeInc');
                if (editFontSizeDec) editFontSizeDec.disabled = true;
                if (editFontSizeInc) editFontSizeInc.disabled = true;
                ['editAlignLeft','editAlignCenter','editAlignRight'].forEach(id => {
                    const btn = document.getElementById(id);
                    if (btn) btn.disabled = true;
                });
                const editCodeMode = document.getElementById('editCodeMode');
                if (editCodeMode) {
                    editCodeMode.checked = false;
                    editCodeMode.disabled = true;
                }
                const editCodeLanguage = document.getElementById('editCodeLanguage');
                if (editCodeLanguage) {
                    editCodeLanguage.value = 'auto';
                    editCodeLanguage.disabled = true;
                }
                document.getElementById('editTextAlign').value = 'center';
                document.getElementById('editTextAlign').disabled = true;
                document.getElementById('editNodeShape').value = 'rounded-rect';
                document.getElementById('editNodeShape').disabled = true;
                const editNodeWidth = document.getElementById('editNodeWidth');
                if (editNodeWidth) {
                    editNodeWidth.value = '';
                    editNodeWidth.disabled = true;
                }
                const editNodeHeight = document.getElementById('editNodeHeight');
                if (editNodeHeight) {
                    editNodeHeight.value = '';
                    editNodeHeight.disabled = true;
                }
                document.getElementById('nodeLocked').checked = false;
                document.getElementById('nodeLocked').disabled = true;
                document.getElementById('deleteNodeBtn').disabled = true;

                // 禁用预设选择器和管理按钮
                const editNodePresetSelect = document.getElementById('editNodePresetSelect');
                if (editNodePresetSelect) {
                    editNodePresetSelect.disabled = true;
                    editNodePresetSelect.value = '';
                }
                const editCreateNodePresetBtn = document.getElementById('editCreateNodePresetBtn');
                if (editCreateNodePresetBtn) editCreateNodePresetBtn.disabled = true;
                const editSaveNodePresetBtn = document.getElementById('editSaveNodePresetBtn');
                if (editSaveNodePresetBtn) editSaveNodePresetBtn.disabled = true;

                // 清除颜色选择
                const editColorPicker = document.getElementById('editColorPicker');
                if (editColorPicker) {
                    editColorPicker.querySelectorAll('.color-option').forEach(option => {
                        option.classList.remove('selected');
                    });
                }
                const editTextColorPicker = document.getElementById('editTextColorPicker');
                if (editTextColorPicker) {
                    editTextColorPicker.querySelectorAll('.color-option').forEach(option => {
                        option.classList.remove('selected');
                    });
                }

                // 隐藏节点属性面板
                document.getElementById('nodePropertiesSection').style.display = 'none';
                document.getElementById('nodeProperties').value = '';
                document.getElementById('nodeProperties').disabled = true;
            }
        }

        this.draw();
    }

    // 选中所有节点

    updateSidebar(mode) {
        const addNodeSection = document.getElementById('editSelectedNodeSection');
        const editNodeSection = document.getElementById('editNodeSection');
        const connectionPropertiesSection = document.getElementById('connectionPropertiesSection');

        if (mode === 'node') {
            addNodeSection.style.display = 'none';
            editNodeSection.style.display = 'block';
            connectionPropertiesSection.style.display = 'none';
        } else if (mode === 'connection') {
            addNodeSection.style.display = 'none';
            editNodeSection.style.display = 'none';
            connectionPropertiesSection.style.display = 'block';
        } else { // default
            addNodeSection.style.display = 'block';
            editNodeSection.style.display = 'none';
            connectionPropertiesSection.style.display = 'none';
        }
    }

    selectAllNodes() {
        if (this.nodes.length === 0) return;

        // 清空单选
        this.selectedNode = null;
        this.selectedConnections = [];

        // 选中所有节点
        this.selectedNodes = [...this.nodes];

        // 更新侧边栏状态
        if (this.screenId === AppState.activeScreen) {
            this.updateSidebar('default');
            document.getElementById('editText').value = '';
            document.getElementById('editText').disabled = true;
            document.getElementById('editFontSize').value = '';
            document.getElementById('editFontSize').disabled = true;
            document.getElementById('editTextAlign').value = 'center';
            document.getElementById('editTextAlign').disabled = true;
            const editCodeMode = document.getElementById('editCodeMode');
            if (editCodeMode) {
                editCodeMode.checked = false;
                editCodeMode.disabled = true;
            }
            const editCodeLanguage = document.getElementById('editCodeLanguage');
            if (editCodeLanguage) {
                editCodeLanguage.value = 'auto';
                editCodeLanguage.disabled = true;
            }
            document.getElementById('nodeLocked').checked = false;
            document.getElementById('nodeLocked').disabled = true;
            document.getElementById('deleteNodeBtn').disabled = false; // 可以批量删除
            document.getElementById('nodePropertiesSection').style.display = 'none';
        }

        this.draw();
    }

    selectNodeById(nodeId, options = {}) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (node) {
            this.selectNode(node);
            if (options.center) {
                this.centerOnNode(node);
            } else {
                this.draw();
            }
            return node;
        }
        return null;
    }

    centerOnNode(node) {
        if (!node || !this.canvas) return;
        const centerX = node.x + node.width / 2;
        const centerY = node.y + node.height / 2;
        this.panX = this.canvas.width / 2 - centerX * this.zoom;
        this.panY = this.canvas.height / 2 - centerY * this.zoom;
        this.draw();
        this.showMinimap();
    }

    focusShortcut(shortcut) {
        if (!shortcut) return;
        if (this.currentFileName !== shortcut.fileName) {
            this.pendingShortcutSelect = shortcut;
            this.loadFile(shortcut.fileName);
            return;
        }
        const found = this.selectNodeById(shortcut.nodeId, { center: true });
        if (!found) {
            alert('未找到对应节点，可能在当前文件中已被删除');
        }
    }

    // 选中连接线并更新侧边栏
    selectConnection(connection) {
        // 只有在明确选择连接线时才清空节点选择
        // 如果connection是undefined（从框选调用），保持selectedNodes不变
        if (connection !== undefined) {
            this.selectedNode = null;
            this.selectedNodes = [];
        }

        // 设置选中的连接线（如果传入null，则清空选择；否则不修改selectedConnections）
        if (connection === null) {
            this.selectedConnections = [];
        } else if (connection !== undefined) {
            this.selectedConnections = [connection];
        }
        // 如果connection是undefined，说明是从框选调用的，保持现有的selectedConnections

        // 只有activeScreen的app更新侧边栏
        if (this.screenId === AppState.activeScreen) {

            if (this.selectedConnections.length > 0) {
                this.updateSidebar('connection');
                // 更新标题显示选中的连接线数量
                const title = document.getElementById('connectionPropertiesTitle');
                if (title) {
                    if (this.selectedConnections.length === 1) {
                        title.textContent = '🔗 编辑选中连接线';
                    } else {
                        title.textContent = `🔗 批量编辑连接线 (${this.selectedConnections.length}条)`;
                    }
                }

                // 设置连接线属性值（使用第一条连接线的值作为默认显示）
                const firstConnection = this.selectedConnections[0];
                document.getElementById('connectionLabel').value = firstConnection.label || '';
                document.getElementById('connectionLabelFontSize').value = firstConnection.labelFontSize || 12;
                document.getElementById('connectionLineStyle').value = firstConnection.lineStyle || 'solid';
                document.getElementById('connectionLineType').value = firstConnection.lineType || 'curve';
                document.getElementById('connectionLineWidth').value = firstConnection.lineWidth || this.defaultLineWidth || 2;
                document.getElementById('connectionArrowSize').value = firstConnection.arrowSize || this.defaultArrowSize || 20;
                const connectionIndependent = document.getElementById('connectionIndependent');
                if (connectionIndependent) {
                    const values = this.selectedConnections.map(conn => !!conn.isIndependent);
                    const allSame = values.every(value => value === values[0]);
                    connectionIndependent.indeterminate = !allSame;
                    connectionIndependent.checked = allSame ? values[0] : false;
                }

                // 高亮显示当前连接线的颜色
                const connectionColorPicker = document.getElementById('connectionColorPicker');
                if (connectionColorPicker) {
                    const colorOptions = connectionColorPicker.querySelectorAll('.color-option');
                    colorOptions.forEach(option => {
                        if (option.getAttribute('data-color') === (firstConnection.color || '#667eea')) {
                            option.classList.add('selected');
                        } else {
                            option.classList.remove('selected');
                        }
                    });
                }

                document.getElementById('deleteConnectionBtn').disabled = false;

                // 启用预设选择器和管理按钮
                const editConnectionPresetSelect = document.getElementById('editConnectionPresetSelect');
                if (editConnectionPresetSelect) editConnectionPresetSelect.disabled = false;
                const editCreateConnectionPresetBtn = document.getElementById('editCreateConnectionPresetBtn');
                if (editCreateConnectionPresetBtn) editCreateConnectionPresetBtn.disabled = false;
                const editSaveConnectionPresetBtn = document.getElementById('editSaveConnectionPresetBtn');
                if (editSaveConnectionPresetBtn) editSaveConnectionPresetBtn.disabled = false;

                // Check if the selected connection matches any preset
                const presets = AppState.getConnectionPresets();
                let matchedPreset = "";
                for (const key in presets) {
                    const preset = presets[key];
                    // Coalesce connection properties to their default values if undefined
                    const connectionLineStyle = firstConnection.lineStyle === undefined ? 'solid' : firstConnection.lineStyle;
                    const connectionLineType = firstConnection.lineType === undefined ? 'curve' : firstConnection.lineType;
                    const connectionLineWidth = firstConnection.lineWidth === undefined ? 2 : firstConnection.lineWidth;
                    const connectionColor = firstConnection.color === undefined ? '#667eea' : firstConnection.color;
                    const connectionIndependent = firstConnection.isIndependent === undefined ? false : firstConnection.isIndependent;

                    if (
                        preset.lineStyle === connectionLineStyle &&
                        (preset.lineType || 'curve') === connectionLineType &&
                        preset.lineWidth === connectionLineWidth &&
                        preset.color === connectionColor &&
                        !!preset.independent === !!connectionIndependent // Ensure both are booleans for comparison
                    ) {
                        matchedPreset = key;
                        break;
                    }
                }
                if (editConnectionPresetSelect) editConnectionPresetSelect.value = matchedPreset;
            } else {
                this.updateSidebar('default');
            }
        }

        this.draw();
    }

    deleteSelectedNode() {
        if (!this.selectedNode) return;

        // Tear down GIF overlay if it exists
        const overlay = this.imageOverlays.get(this.selectedNode.id);
        if (overlay) {
            overlay.remove();
            this.imageOverlays.delete(this.selectedNode.id);
        }

        const moveChildrenCheckbox = document.getElementById('moveChildrenWithParent');
        const includeChildren = moveChildrenCheckbox && moveChildrenCheckbox.checked;

        // 要删除的节点列表
        const nodesToDelete = [this.selectedNode];

        if (includeChildren) {
            // 获取所有子节点
            const childNodes = this.getAllChildNodes(this.selectedNode);
            nodesToDelete.push(...childNodes);
        }

        // 检查是否需要二次确认
        const quickDeleteCheckbox = document.getElementById('quickDelete');
        const isQuickDelete = quickDeleteCheckbox && quickDeleteCheckbox.checked;

        // 如果不是快速删除模式，且删除的节点数量超过5个，需要二次确认
        if (!isQuickDelete && nodesToDelete.length > 5) {
            const confirmMessage = `确定要删除 ${nodesToDelete.length} 个节点吗？此操作无法撤销。`;
            if (!confirm(confirmMessage)) {
                return; // 用户取消删除
            }
        }

        // 创建节点集合用于快速查找
        const nodeSet = new Set(nodesToDelete);

        // 删除节点
        this.nodes = this.nodes.filter(n => !nodeSet.has(n));

        // 删除所有相关的连接
        this.connections = this.connections.filter(
            c => !nodeSet.has(c.from) && !nodeSet.has(c.to)
        );

        this.selectNode(null);
        this.saveToLocalStorage();
        this.draw();
    }

    // 复制节点
    copyNode() {
        if (!this.selectedNode) return;

        const moveChildrenCheckbox = document.getElementById('moveChildrenWithParent');
        const includeChildren = moveChildrenCheckbox && moveChildrenCheckbox.checked;

        // 复制选中的节点
        const nodesToCopy = [this.selectedNode];
        const connectionsToCopy = [];

        if (includeChildren) {
            // 获取所有子节点
            const childNodes = this.getAllChildNodes(this.selectedNode);
            nodesToCopy.push(...childNodes);

            // 获取节点之间的连接
            const nodeSet = new Set(nodesToCopy);
            this.connections.forEach(conn => {
                if (nodeSet.has(conn.from) && nodeSet.has(conn.to)) {
                    connectionsToCopy.push(conn);
                }
            });
        }

        // 深拷贝节点和连接
        this.clipboard = {
            nodes: nodesToCopy.map(node => JSON.parse(JSON.stringify(node))),
            connections: connectionsToCopy.map(conn => ({ ...conn }))
        };
        this.clipboardMode = 'copy';

        // 显示提示
        const statusBar = document.querySelector('.status-bar .coordinates');
        const originalContent = statusBar.innerHTML;
        statusBar.textContent = `✓ 已复制节点${includeChildren && nodesToCopy.length > 1 ? ' 及其子节点' : ''}`;
        setTimeout(() => {
            statusBar.innerHTML = originalContent;
        }, 2000);
    }

    // 剪切节点
    cutNode() {
        if (!this.selectedNode) return;

        const moveChildrenCheckbox = document.getElementById('moveChildrenWithParent');
        const includeChildren = moveChildrenCheckbox && moveChildrenCheckbox.checked;

        // 要剪切的节点
        const nodesToCut = [this.selectedNode];
        const connectionsToCut = [];

        if (includeChildren) {
            // 获取所有子节点
            const childNodes = this.getAllChildNodes(this.selectedNode);
            nodesToCut.push(...childNodes);

            // 获取节点之间的连接
            const nodeSet = new Set(nodesToCut);
            this.connections.forEach(conn => {
                if (nodeSet.has(conn.from) && nodeSet.has(conn.to)) {
                    connectionsToCut.push(conn);
                }
            });
        }

        // 深拷贝节点和连接
        this.clipboard = {
            nodes: nodesToCut.map(node => ({ ...node })),
            connections: connectionsToCut.map(conn => ({ ...conn }))
        };
        this.clipboardMode = 'cut';

        // 删除节点和连接
        const nodeSet = new Set(nodesToCut);
        this.nodes = this.nodes.filter(n => !nodeSet.has(n));

        // 删除所有相关的连接（包括指向这些节点的连接）
        this.connections = this.connections.filter(
            c => !nodeSet.has(c.from) && !nodeSet.has(c.to)
        );

        this.selectNode(null);
        this.saveToLocalStorage();
        this.draw();

        // 显示提示
        const statusBar = document.querySelector('.status-bar .coordinates');
        const originalContent = statusBar.innerHTML;
        statusBar.textContent = `✓ 已剪切节点${includeChildren && nodesToCut.length > 1 ? ' 及其子节点' : ''}`;
        setTimeout(() => {
            statusBar.innerHTML = originalContent;
        }, 2000);
    }

    // 粘贴节点
    pasteNode() {
        if (!this.clipboard || !this.clipboard.nodes || this.clipboard.nodes.length === 0) return;

        // 创建节点ID映射，用于更新连接
        const nodeIdMap = new Map();

        // 检查是否在5秒内有点击
        const timeSinceClick = this.lastClickTime ? (Date.now() - this.lastClickTime) : Infinity;
        const useClickPosition = timeSinceClick <= 5000 && this.lastClickPos;

        // 计算粘贴位置
        let baseX, baseY;
        if (useClickPosition) {
            // 使用点击位置作为第一个节点的中心位置
            const firstNode = this.clipboard.nodes[0];
            baseX = this.lastClickPos.x - (firstNode.width || 100) / 2;
            baseY = this.lastClickPos.y - (firstNode.height || 40) / 2;

            // 计算偏移量（相对于原始第一个节点的位置）
            const offsetX = baseX - firstNode.x;
            const offsetY = baseY - firstNode.y;

            // 粘贴节点
            const pastedNodes = this.clipboard.nodes.map(node => {
                const newNode = {
                    ...node,
                    id: Date.now() + Math.random(), // 生成新ID
                    x: node.x + offsetX,
                    y: node.y + offsetY
                };
                nodeIdMap.set(node.id, newNode);
                this.nodes.push(newNode);
                return newNode;
            });

            // 粘贴连接
            this.clipboard.connections.forEach(conn => {
                const newFrom = nodeIdMap.get(conn.from.id);
                const newTo = nodeIdMap.get(conn.to.id);
                if (newFrom && newTo) {
                    this.connections.push({
                        from: newFrom,
                        to: newTo,
                        controlOffsetY: conn.controlOffsetY || 0,
                        lineStyle: conn.lineStyle || 'solid',
                        lineType: conn.lineType || 'curve',
                        lineWidth: conn.lineWidth || 2,
                        color: conn.color || '#667eea',
                        arrowSize: conn.arrowSize || 20,
                        label: conn.label || '',
                        labelFontSize: conn.labelFontSize || 12,
                        isIndependent: !!conn.isIndependent,
                        fromAnchorX: conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5,
                        fromAnchorY: conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1,
                        toAnchorX: conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5,
                        toAnchorY: conn.toAnchorY !== undefined ? conn.toAnchorY : 0
                    });
                }
            });

            // 选中第一个粘贴的节点
            if (pastedNodes.length > 0) {
                this.selectNode(pastedNodes[0]);
            }

            // 如果是剪切模式，清空剪贴板
            if (this.clipboardMode === 'cut') {
                this.clipboard = null;
                this.clipboardMode = null;
            }

            this.saveToLocalStorage();
            this.draw();

            // 显示提示
            const statusBar = document.querySelector('.status-bar .coordinates');
            const originalContent = statusBar.innerHTML;
            statusBar.textContent = `✓ 已粘贴节点${pastedNodes.length > 1 ? ' 及其子节点' : ''} (在点击位置)`;
            setTimeout(() => {
                statusBar.innerHTML = originalContent;
            }, 2000);

            return;
        }

        // 默认行为：使用固定偏移量
        const offsetX = 50;
        const offsetY = 50;

        // 粘贴节点
        const pastedNodes = this.clipboard.nodes.map(node => {
            const newNode = {
                ...node,
                id: Date.now() + Math.random(), // 生成新ID
                x: node.x + offsetX,
                y: node.y + offsetY
            };
            nodeIdMap.set(node.id, newNode);
            this.nodes.push(newNode);
            return newNode;
        });

        // 粘贴连接
        this.clipboard.connections.forEach(conn => {
            const newFrom = nodeIdMap.get(conn.from.id);
            const newTo = nodeIdMap.get(conn.to.id);
            if (newFrom && newTo) {
                this.connections.push({
                    from: newFrom,
                    to: newTo,
                    controlOffsetY: conn.controlOffsetY || 0,
                 lineStyle: conn.lineStyle || 'solid',
                 lineType: conn.lineType || 'curve',
                 lineWidth: conn.lineWidth || 2,
                 color: conn.color || '#667eea',
                 arrowSize: conn.arrowSize || 20,
                 label: conn.label || '',
                 labelFontSize: conn.labelFontSize || 12,
                 isIndependent: !!conn.isIndependent,
                 fromAnchorX: conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5,
                 fromAnchorY: conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1,
                 toAnchorX: conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5,
                    toAnchorY: conn.toAnchorY !== undefined ? conn.toAnchorY : 0
                });
            }
        });

        // 选中第一个粘贴的节点
        if (pastedNodes.length > 0) {
            this.selectNode(pastedNodes[0]);
        }

        // 如果是剪切模式，清空剪贴板
        if (this.clipboardMode === 'cut') {
            this.clipboard = null;
            this.clipboardMode = null;
        }

        this.saveToLocalStorage();
        this.draw();

        // 显示提示
        const statusBar = document.querySelector('.status-bar .coordinates');
        const originalContent = statusBar.innerHTML;
        statusBar.textContent = `✓ 已粘贴节点${pastedNodes.length > 1 ? ' 及其子节点' : ''}`;
        setTimeout(() => {
            statusBar.innerHTML = originalContent;
        }, 2000);
    }

    // 生成默认图片名称：日期+时间+UUID
    generateDefaultImageName() {
        const now = new Date();

        // 格式化日期：YYYYMMDD
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const date = `${year}${month}${day}`;

        // 格式化时间：HHMMSS
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const time = `${hours}${minutes}${seconds}`;

        // 生成简短UUID（8位）
        const uuid = Math.random().toString(36).substring(2, 10);

        return `${date}_${time}_${uuid}`;
    }

    // 处理图片粘贴
    handleImagePaste(file) {
        console.log('[图片粘贴] 开始处理图片:', file.name, file.type, (file.size / 1024).toFixed(2) + 'KB');

        // 检查文件大小（限制为5MB）
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            console.log('[图片粘贴] 图片太大:', (file.size / 1024 / 1024).toFixed(2) + 'MB');
            alert('图片太大！请使用小于5MB的图片。\n\n提示：可以先压缩图片再粘贴。');
            return;
        }

        console.log('[图片粘贴] 开始读取图片文件...');

        // 读取图片并转为base64
        const reader = new FileReader();
        reader.onload = (e) => {
            console.log('[图片粘贴] 图片读取成功，数据长度:', e.target.result.length);
            const imageData = e.target.result;

            // 创建临时图片以获取尺寸
            const img = new Image();
            img.onload = () => {
                console.log('[图片粘贴] 图片加载成功，尺寸:', img.width, 'x', img.height);

                // 生成默认图片名称
                const defaultName = this.generateDefaultImageName();
                console.log('[图片粘贴] 默认名称:', defaultName);

                // 先立即创建节点（使用默认名称）
                let targetNode;
                if (this.selectedNode) {
                    console.log('[图片粘贴] 添加到选中节点:', this.selectedNode.id);
                    this.addImageToNode(this.selectedNode, defaultName, imageData, img.width, img.height);
                    targetNode = this.selectedNode;
                } else {
                    console.log('[图片粘贴] 创建新图片节点');
                    targetNode = this.createNodeWithImage(defaultName, imageData, img.width, img.height);
                }

                // 节点创建后，延迟弹出对话框让用户重命名
                // 使用 requestAnimationFrame 确保至少渲染了一帧，然后再延迟200ms
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        const imageName = prompt('请输入图片名称（不含扩展名）：', defaultName);

                        // 如果用户输入了新名称且不为空
                        if (imageName !== null && imageName.trim() && imageName.trim() !== defaultName) {
                            const finalName = imageName.trim();
                            console.log('[图片粘贴] 重命名为:', finalName);

                            // 更新content数组中的文本
                            if (!targetNode.content) {
                                targetNode.content = [];
                            }
                            const textItems = targetNode.content.filter(item => item.type === 'text');
                            if (textItems.length > 0) {
                                textItems[0].value = finalName;
                            } else {
                                targetNode.content.push({ type: 'text', value: finalName });
                            }

                            this.saveToLocalStorage();
                            this.draw();
                        } else {
                            console.log('[图片粘贴] 保持默认名称:', defaultName);
                        }
                    }, 200); // 延迟200ms确保图片已显示
                });
            };
            img.onerror = () => {
                console.error('[图片粘贴] 图片加载失败');
                alert('图片加载失败，请重试');
            };
            img.src = imageData;
        };
        reader.onerror = () => {
            console.error('[图片粘贴] 文件读取失败');
            alert('图片读取失败，请重试');
        };
        reader.readAsDataURL(file);
    }

    // 为节点添加图片
    addImageToNode(node, imageName, imageData, imgWidth, imgHeight) {
        // 确保节点有content数组
        if (!node.content) {
            node.content = [];
        }

        // 插入图片项到content顶部，确保渲染在文本上方
        const imageItem = {
            type: 'image',
            value: imageData,
            width: imgWidth,
            height: imgHeight
        };
        // 移除旧的image条目，避免重复
        node.content = node.content.filter(item => item.type !== 'image');

        // 设置节点文本为图片名称（更新content数组）
        const textItems = node.content.filter(item => item.type === 'text');
        if (textItems.length === 0 || textItems[0].value === '新节点' || textItems[0].value === '图片') {
            // 更新或添加文本
            if (textItems.length > 0) {
                textItems[0].value = imageName;
            } else {
                node.content.unshift({ type: 'text', value: imageName });
            }
        }

        node.image = imageData;
        node.imageWidth = imgWidth;
        node.imageHeight = imgHeight;

        // 自动调整节点大小以适应图片
        let displayWidth = imgWidth;
        let displayHeight = imgHeight;

        node.imageDisplayWidth = displayWidth;
        node.imageDisplayHeight = displayHeight;

        // 将显示尺寸存储在内容项中，避免后续自动缩放
        imageItem.displayWidth = displayWidth;
        imageItem.displayHeight = displayHeight;
        node.content.unshift(imageItem);

        // 调整节点大小（如果图片比节点大）
        if (displayWidth + 20 > node.width) {
            node.width = displayWidth + 20;
        }
        if (displayHeight + 40 > node.height) { // 为文字留出空间
            node.height = displayHeight + 40;
        }

        this.saveToLocalStorage();
        this.preloadImages([imageData]).then(() => this.draw());
        console.log(`[图片] 已添加到节点: ${Math.round(displayWidth)}x${Math.round(displayHeight)}`);
    }

    // 创建带图片的新节点
    createNodeWithImage(imageName, imageData, imgWidth, imgHeight) {
        // 计算显示尺寸
        const maxWidth = 300;
        const maxHeight = 300;

        let displayWidth = imgWidth;
        let displayHeight = imgHeight;

        if (imgWidth > maxWidth || imgHeight > maxHeight) {
            const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
            displayWidth = imgWidth * ratio;
            displayHeight = imgHeight * ratio;
        }

        // 优先使用最后点击位置，否则使用画布中心
        let posX, posY;
        const timeSinceClick = Date.now() - (this.lastClickTime || 0);
        const useClickPosition = timeSinceClick <= 5000 && this.lastClickPos;

        if (useClickPosition) {
            // 使用最后点击位置
            posX = this.lastClickPos.x - displayWidth / 2;
            posY = this.lastClickPos.y - displayHeight / 2;
            console.log(`[图片] 在点击位置创建节点: (${Math.round(this.lastClickPos.x)}, ${Math.round(this.lastClickPos.y)})`);
        } else {
            // 使用画布中心
            const centerX = (this.canvas.width / (2 * this.zoom)) - this.panX / this.zoom;
            const centerY = (this.canvas.height / (2 * this.zoom)) - this.panY / this.zoom;
            posX = centerX - displayWidth / 2;
            posY = centerY - displayHeight / 2;
            console.log(`[图片] 在画布中心创建节点: (${Math.round(centerX)}, ${Math.round(centerY)})`);
        }

        const newNode = {
            id: Date.now() + Math.random(),
            content: [{ type: 'text', value: imageName }],
            x: posX,
            y: posY,
            width: displayWidth + 20,
            height: displayHeight + 60, // 为文字留出空间
            color: this.currentColor,
            textColor: this.currentTextColor,
            fontSize: this.currentFontSize,
            textAlign: 'center',
            shape: this.currentShape || 'rounded-rect',
            image: imageData,
            imageWidth: imgWidth,
            imageHeight: imgHeight,
            imageDisplayWidth: displayWidth,
            imageDisplayHeight: displayHeight,
            codeMode: false,
            codeLanguage: 'auto'
        };

        // 内容中加入图片，确保立即显示
        newNode.content.unshift({
            type: 'image',
            value: imageData,
            width: imgWidth,
            height: imgHeight,
            displayWidth,
            displayHeight
        });

        this.nodes.push(newNode);
        this.selectNode(newNode);
        this.saveToLocalStorage();
        this.draw();

        console.log(`[图片] 已创建新节点: ${Math.round(displayWidth)}x${Math.round(displayHeight)}`);

        return newNode;
    }

    deleteFrameSelectedItems() {
        // 计算要删除的节点总数
        const totalNodesToDelete = this.selectedNodes.length;

        // 检查是否需要二次确认
        const quickDeleteCheckbox = document.getElementById('quickDelete');
        const isQuickDelete = quickDeleteCheckbox && quickDeleteCheckbox.checked;

        // 如果不是快速删除模式，且删除的节点数量超过5个，需要二次确认
        if (!isQuickDelete && totalNodesToDelete > 5) {
            const confirmMessage = `确定要删除 ${totalNodesToDelete} 个节点吗？此操作无法撤销。`;
            if (!confirm(confirmMessage)) {
                return; // 用户取消删除
            }
        }

        // 删除框选的连线
        this.selectedConnections.forEach(conn => {
            this.connections = this.connections.filter(c => c !== conn);
        });

        // 删除框选的节点
        this.selectedNodes.forEach(node => {
            // Clean up GIF overlay if it exists
            const overlay = this.imageOverlays.get(node.id);
            if (overlay) {
                overlay.remove();
                this.imageOverlays.delete(node.id);
            }
            this.nodes = this.nodes.filter(n => n !== node);
            this.connections = this.connections.filter(
                c => c.from !== node && c.to !== node
            );
        });

        // 清空框选状态
        this.selectedNodes = [];
        this.selectedConnections = [];
        this.selectNode(null);
        this.saveToLocalStorage();
        this.draw();
    }

    changeZoom(factor) {
        this.zoom *= factor;
        // 支持更大范围的缩放：0.01 到 20
        this.zoom = Math.max(0.01, Math.min(20, this.zoom));
        this.draw();
    }

    // 保存当前状态到历史记录
    saveHistory() {
        // 如果正在执行撤销/重做，不保存历史
        if (this.isUndoRedoing) return;

        // 序列化当前状态
        const state = this.serializeState();

        // 如果当前不在历史记录的末尾，删除后面的记录
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        // 添加新状态
        this.history.push(state);

        // 限制历史记录大小
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
    }

    // 序列化当前状态
    serializeState() {
        // 深拷贝节点（排除临时属性）
        const nodes = this.nodes.map(node => {
            const copy = { ...node };
            delete copy._originalWidth;
            delete copy._originalHeight;
            delete copy._originalFontSize;
            return copy;
        });

        // 序列化连接（保存节点ID而不是引用）
        const connections = this.connections.map(conn => ({
            fromId: conn.from && conn.from.id,
            toId: conn.to && conn.to.id,
            controlOffsetY: conn.controlOffsetY || 0,
            lineStyle: conn.lineStyle || 'solid',
            lineType: conn.lineType || 'curve',
            lineWidth: conn.lineWidth || 2,
            color: conn.color || '#667eea',
            arrowSize: conn.arrowSize || 20,
            label: conn.label || '',
            labelFontSize: conn.labelFontSize || 12,
            isIndependent: !!conn.isIndependent,
            fromAnchorX: conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5,
            fromAnchorY: conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1,
            toAnchorX: conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5,
            toAnchorY: conn.toAnchorY !== undefined ? conn.toAnchorY : 0
        }));

        return {
            nodes: JSON.parse(JSON.stringify(nodes)),
            connections: connections
        };
    }

    // 恢复状态
    restoreState(state) {
        if (!state) return;

        this.isUndoRedoing = true;

        // 恢复节点
        this.nodes = JSON.parse(JSON.stringify(state.nodes));

        // 恢复连接（重建节点引用）
        this.connections = state.connections.map(conn => {
            const fromNode = this.nodes.find(n => n.id === conn.fromId);
            const toNode = this.nodes.find(n => n.id === conn.toId);
            return {
                from: fromNode,
                to: toNode,
                controlOffsetY: conn.controlOffsetY || 0,
                lineStyle: conn.lineStyle || 'solid',
                lineType: conn.lineType || 'curve',
                lineWidth: conn.lineWidth || 2,
                color: conn.color || '#667eea',
                arrowSize: conn.arrowSize || 20,
                label: conn.label || '',
                labelFontSize: conn.labelFontSize || 12,
                isIndependent: !!conn.isIndependent,
                fromAnchorX: conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5,
                fromAnchorY: conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1,
                toAnchorX: conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5,
                toAnchorY: conn.toAnchorY !== undefined ? conn.toAnchorY : 0
            };
        }).filter(conn => conn.from && conn.to);

        // 清空选择
        this.selectedNode = null;
        this.selectedNodes = [];
        this.selectedConnections = [];
        this.selectNode(null);
        this.selectConnection(null);

        // 保存到localStorage（但不保存到历史记录）
        this.saveToLocalStorageWithoutHistory();

        this.isUndoRedoing = false;

        this.draw();
    }

    // 撤销
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    // 重做
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    draw() {
        // 使用 requestAnimationFrame 节流重绘
        if (this.rafId) {
            return; // 已经有待处理的绘制请求
        }

        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            this._drawImpl();
        });
    }

    getConnectionEndpoints(connection) {
        const resolveEndpoint = (side) => {
            const node = side === 'from' ? connection.from : connection.to;
            const floatingPos = connection[`${side}FloatingPos`];
            const candidateNode = connection[`${side}CandidateNode`];
            const candidateAnchorX = connection[`${side}CandidateAnchorX`];
            const candidateAnchorY = connection[`${side}CandidateAnchorY`];
            const anchorX = connection[`${side}AnchorX`] !== undefined ? connection[`${side}AnchorX`] : (side === 'from' ? 0.5 : 0.5);
            const anchorY = connection[`${side}AnchorY`] !== undefined ? connection[`${side}AnchorY`] : (side === 'from' ? 1 : 0);

            if (candidateNode && candidateAnchorX !== undefined && candidateAnchorY !== undefined) {
                return {
                    x: candidateNode.x + (candidateNode.width || 0) * candidateAnchorX,
                    y: candidateNode.y + (candidateNode.height || 0) * candidateAnchorY
                };
            }

            if (floatingPos) {
                return { x: floatingPos.x, y: floatingPos.y };
            }

            return {
                x: node.x + (node.width || 0) * anchorX,
                y: node.y + (node.height || 0) * anchorY
            };
        };

        const { x: x1, y: y1 } = resolveEndpoint('from');
        const { x: x2, y: y2 } = resolveEndpoint('to');

        return { x1, y1, x2, y2 };
    }

    _drawImpl() {
        // 检查夜间模式
        const isNightMode = document.body.classList.contains('night-mode');

        // 预计算常用颜色（避免重复计算）
        const normalColor = isNightMode ? NIGHT_BORDER_DEFAULT : '#667eea';
        const textColor = isNightMode ? invertColor('#333') : '#333';

        // 清空画布
        this.ctx.fillStyle = isNightMode ? '#1a1a2e' : 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.zoom, this.zoom);

        // 绘制连接线
        this.connections.forEach(connection => {
            // 检查是否被选中
            const isSelected = this.selectedConnections.includes(connection);

            // 使用连接线的自定义颜色或默认颜色
            const connectionColor = connection.color || '#667eea';
            const displayColor = isNightMode ? invertColor(connectionColor) : connectionColor;

            this.ctx.strokeStyle = isSelected ? '#ff6b6b' : displayColor;
            this.ctx.lineWidth = isSelected ? (connection.lineWidth || 2) + 2 : (connection.lineWidth || 2);

            this.drawLine(connection.from, connection.to, connection, isNightMode);
        });

        // 绘制节点 —— 全局视图 (zoom < LOD 阈值) 时用缓存的缩略图位图：
        // 节点首次出现在缩略路径时离屏渲染一次，之后直接 drawImage 缩放，
        // 视觉与原始 drawNode 一致，只是被浏览器双线性插值缩小。
        // 编辑中的节点强制走完整路径，避免编辑覆盖层错位。
        const LOD_ZOOM_THRESHOLD = 0.4;
        const useLOD = this.zoom < LOD_ZOOM_THRESHOLD;

        // 视口剔除：把世界坐标视口算出来，完全在外面的节点直接跳过。
        // 给一格留白避免靠边节点突然消失带来视觉跳变。
        const vpLeft = -this.panX / this.zoom;
        const vpTop = -this.panY / this.zoom;
        const vpRight = vpLeft + this.canvas.width / this.zoom;
        const vpBottom = vpTop + this.canvas.height / this.zoom;
        const cullMargin = 8 / this.zoom;

        this.nodes.forEach(node => {
            if (node.x + node.width < vpLeft - cullMargin
                || node.x > vpRight + cullMargin
                || node.y + node.height < vpTop - cullMargin
                || node.y > vpBottom + cullMargin) {
                return;
            }
            if (useLOD && this.editingNode !== node) {
                const thumb = this._getNodeThumbnail(node, isNightMode, normalColor, textColor);
                this.ctx.drawImage(thumb, node.x, node.y, node.width, node.height);
            } else {
                this.drawNode(node, isNightMode, normalColor, textColor);
            }
        });

        // 绘制选中连接线的控制点
        this.selectedConnections.forEach(connection => {
            const { x1, y1, x2, y2 } = this.getConnectionEndpoints(connection);
            const lineType = this.getConnectionLineType(connection);

            const offset = connection.controlOffsetY || 0;
            const cp1y = y1 + (y2 - y1) / 2 + offset;
            const cp2y = y2 - (y2 - y1) / 2 + offset;

            if (lineType === 'curve') {
                // 计算贝塞尔曲线中点（t=0.5）
                const t = 0.5;
                const mt = 1 - t;
                const controlX = mt * mt * mt * x1 +
                               3 * mt * mt * t * x1 +
                               3 * mt * t * t * x2 +
                               t * t * t * x2;
                const controlY = mt * mt * mt * y1 +
                               3 * mt * mt * t * cp1y +
                               3 * mt * t * t * cp2y +
                               t * t * t * y2;

                // 绘制控制点（圆形）
                this.ctx.fillStyle = '#ff6b6b';
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(controlX, controlY, 6, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            }

            // 绘制端点拖拽手柄
            const handleRadius = 5;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.strokeStyle = '#ff6b6b';
            this.ctx.lineWidth = 2;

            this.ctx.beginPath();
            this.ctx.arc(x1, y1, handleRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.arc(x2, y2, handleRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
        });

        this.ctx.restore();

        // 绘制正在绘制的临时连接线
        if (this.isDrawingConnection && this.connectionStartNode && this.connectionEndPos) {
            this.ctx.save();
            this.ctx.translate(this.panX, this.panY);
            this.ctx.scale(this.zoom, this.zoom);

            const x1 = this.connectionStartNode.x + this.connectionStartNode.width / 2;
            const y1 = this.connectionStartNode.y + this.connectionStartNode.height;
            const x2 = this.connectionEndPos.x;
            const y2 = this.connectionEndPos.y;

            // 如果悬停在有效节点上，改变线条颜色为绿色
            const normalColor = isNightMode ? NIGHT_BORDER_DEFAULT : '#667eea';
            this.ctx.strokeStyle = this.connectionHoveredNode ? '#4caf50' : normalColor;
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);

            const previewLineType = this.defaultLineType || 'curve';
            if (previewLineType === 'curve') {
                const cp1y = y1 + (y2 - y1) / 2;
                const cp2y = y2 - (y2 - y1) / 2;
                this.ctx.bezierCurveTo(x1, cp1y, x2, cp2y, x2, y2);
            } else if (previewLineType === 'straight') {
                this.ctx.lineTo(x2, y2);
            } else {
                const points = this.getElbowPoints(x1, y1, x2, y2);
                points.slice(1).forEach(pt => this.ctx.lineTo(pt.x, pt.y));
            }
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            this.ctx.restore();
        }

        // 绘制框选矩形（不缩放）
        if ((this.isSelecting || this.showSelectionBox) && this.selectionStart && this.selectionEnd) {
            const startX = this.panX + this.selectionStart.x * this.zoom;
            const startY = this.panY + this.selectionStart.y * this.zoom;
            const endX = this.panX + this.selectionEnd.x * this.zoom;
            const endY = this.panY + this.selectionEnd.y * this.zoom;

            const width = endX - startX;
            const height = endY - startY;

            const normalColor = isNightMode ? NIGHT_BORDER_DEFAULT : '#667eea';
            // 从 normalColor 提取 RGB 值用于半透明填充
            const rgb = normalColor.match(/\w\w/g).map(x => parseInt(x, 16));
            const fillColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.1)`;
            this.ctx.fillStyle = fillColor;
            this.ctx.fillRect(startX, startY, width, height);

            this.ctx.strokeStyle = normalColor;
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeRect(startX, startY, width, height);
            this.ctx.setLineDash([]);
        }

        this._updateImageOverlays();
    }

    drawLine(fromNode, toNode, connection, isNightMode = null) {
        const { x1, y1, x2, y2 } = this.getConnectionEndpoints(connection);
        const lineType = this.getConnectionLineType(connection);

        // 设置线条样式
        const lineStyle = connection.lineStyle || 'solid';
        if (lineStyle === 'dashed') {
            this.ctx.setLineDash([10, 5]);
        } else if (lineStyle === 'dotted') {
            this.ctx.setLineDash([2, 3]);
        } else {
            this.ctx.setLineDash([]);
        }

        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);

        let arrowTip = null;
        let arrowRef = null;
        let labelPoint = null;
        let cp1y = null;
        let cp2y = null;

        if (lineType === 'curve') {
            // 贝塞尔曲线 - 使用controlOffsetY调整曲率
            const offset = (connection && connection.controlOffsetY) || 0;
            cp1y = y1 + (y2 - y1) / 2 + offset;
            cp2y = y2 - (y2 - y1) / 2 + offset;
            this.ctx.bezierCurveTo(x1, cp1y, x2, cp2y, x2, y2);
            this.ctx.stroke();

            const pointOnCurve = (t) => {
                const mt = 1 - t;
                const px = mt * mt * mt * x1 +
                           3 * mt * mt * t * x1 +
                           3 * mt * t * t * x2 +
                           t * t * t * x2;
                const py = mt * mt * mt * y1 +
                           3 * mt * mt * t * cp1y +
                           3 * mt * t * t * cp2y +
                           t * t * t * y2;
                return { x: px, y: py };
            };
            // 将箭头贴近节点但略提前，避免被节点完全遮挡
            arrowTip = pointOnCurve(0.995);
            arrowRef = pointOnCurve(0.985);
            labelPoint = pointOnCurve(0.5);
        } else if (lineType === 'straight') {
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            arrowTip = { x: x2, y: y2 };
            arrowRef = { x: x2 - ux * 10, y: y2 - uy * 10 };
            labelPoint = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
        } else if (lineType === 'elbow') {
            const points = this.getElbowPoints(x1, y1, x2, y2);
            points.slice(1).forEach(pt => this.ctx.lineTo(pt.x, pt.y));
            this.ctx.stroke();
            const last = points[points.length - 1];
            const prev = points[points.length - 2];
            const dx = last.x - prev.x;
            const dy = last.y - prev.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            arrowTip = { x: last.x, y: last.y };
            arrowRef = { x: last.x - ux * 10, y: last.y - uy * 10 };
            labelPoint = this.getPolylineMidpoint(points);
        }

        // 重置线条样式
        this.ctx.setLineDash([]);

        // 绘制箭头
        if (arrowTip && arrowRef) {
            this.drawArrow(arrowTip.x, arrowTip.y, arrowRef.x, arrowRef.y, isNightMode, connection);
        }

        // 绘制连接线文字（如果有）
        if (connection.label && connection.label.trim() && labelPoint) {
            const midX = labelPoint.x;
            const midY = labelPoint.y;

            // 使用连接线的字体大小，默认为12
            const fontSize = connection.labelFontSize || 12;
            const lineHeight = fontSize * 1.4;

            // 设置文字样式
            this.ctx.font = `${fontSize}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            // 测量文字宽度
            const textMetrics = this.ctx.measureText(connection.label);
            const textWidth = textMetrics.width;
            const padding = 4;

            // 绘制文字背景（白色矩形）
            const bgColor = isNightMode ? '#1a1a2e' : '#ffffff';
            this.ctx.fillStyle = bgColor;
            this.ctx.fillRect(midX - textWidth / 2 - padding, midY - lineHeight / 2, textWidth + padding * 2, lineHeight);

            // 绘制文字
            const textColor = isNightMode ? '#e0e0e0' : '#333333';
            this.ctx.fillStyle = textColor;
            this.ctx.fillText(connection.label, midX, midY);
        }
    }

    drawArrow(toX, toY, fromX, fromY, isNightMode = null, connection = null) {
        const angle = Math.atan2(toY - fromY, toX - fromX);
        // 使用连接线的箭头大小，默认为20
        const arrowSize = (connection && connection.arrowSize) || 20;

        if (isNightMode === null) {
            isNightMode = document.body.classList.contains('night-mode');
        }

        // 使用当前的strokeStyle作为箭头颜色（已经在_drawImpl中设置好了）
        this.ctx.fillStyle = this.ctx.strokeStyle;

        this.ctx.beginPath();
        this.ctx.moveTo(toX, toY);
        this.ctx.lineTo(toX - arrowSize * Math.cos(angle - Math.PI / 6), toY - arrowSize * Math.sin(angle - Math.PI / 6));
        this.ctx.lineTo(toX - arrowSize * Math.cos(angle + Math.PI / 6), toY - arrowSize * Math.sin(angle + Math.PI / 6));
        this.ctx.fill();

        // 描边让箭头在节点前更明显
        this.ctx.strokeStyle = isNightMode ? '#111111' : '#ffffff';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(toX, toY);
        this.ctx.lineTo(toX - arrowSize * Math.cos(angle - Math.PI / 6), toY - arrowSize * Math.sin(angle - Math.PI / 6));
        this.ctx.lineTo(toX - arrowSize * Math.cos(angle + Math.PI / 6), toY - arrowSize * Math.sin(angle + Math.PI / 6));
        this.ctx.closePath();
        this.ctx.stroke();
    }

    // 绘制不同形状的节点边框
    drawNodeShape(ctx, node, shape) {
        const x = node.x;
        const y = node.y;
        const width = node.width;
        const height = node.height;

        ctx.beginPath();

        switch (shape) {
            case 'circle':
                // 圆形 - 使用最小边作为直径
                const radius = Math.min(width, height) / 2;
                const centerX = x + width / 2;
                const centerY = y + height / 2;
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                break;

            case 'diamond':
                // 菱形
                const midX = x + width / 2;
                const midY = y + height / 2;
                ctx.moveTo(midX, y);
                ctx.lineTo(x + width, midY);
                ctx.lineTo(midX, y + height);
                ctx.lineTo(x, midY);
                ctx.closePath();
                break;

            case 'trapezoid':
                // 梯形 (上底较窄)
                const inset = width * 0.15;
                ctx.moveTo(x + inset, y);
                ctx.lineTo(x + width - inset, y);
                ctx.lineTo(x + width, y + height);
                ctx.lineTo(x, y + height);
                ctx.closePath();
                break;

            case 'rect':
                // 正方形/矩形
                ctx.rect(x, y, width, height);
                break;

            case 'rounded-rect':
            default:
                // 圆角矩形 (默认)
                ctx.roundRect(x, y, width, height, 8);
                break;
        }
    }

    // 低 zoom 时使用的节点缩略图：把节点完整渲染到一张离屏 canvas，缓存在 node._thumbnail，
    // 主画布上直接 drawImage 缩放即可。视觉上跟原始 drawNode 一致（只是被浏览器线性插值缩小）。
    //
    // 失效 key 涵盖所有影响视觉的字段：尺寸 / 颜色 / 形状 / 字体 / 模式 / 对齐 / 文字色 /
    // 夜间 / 选中 / 框选；以及 content 数组的"内容指纹"。指纹用扁平数组的 4 槽 / item：
    //   [0] item ref（替换 / 增删被捕获）
    //   [1] _wrapCache ref（文本/字体/宽度/code 参数变化即 ref 变化）
    //   [2] image loaded 状态（加载完成时让缩略图重画一次）
    //   [3] image displayWidth/Height 编码进单个数字
    // 所有 slot 都是 O(1) 比较（引用 / 数字 / bool）。早先把 it.value（往往是几百 KB 的
    // base64 data URL）拼进字符串再做 ===，会让每帧每个图节点跑一遍 megabyte 级 string
    // compare，直接拖垮整个 LOD 路径。
    _getNodeThumbnail(node, isNightMode, normalColor, textColor) {
        const isSelected = this.selectedNode === node;
        const isFrameSelected = this.selectedNodes.includes(node);

        const items = node.content || [];
        const sig = new Array(items.length * 4);
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            sig[i * 4] = it;
            sig[i * 4 + 1] = it._wrapCache;
            if (it.type === 'image') {
                const img = this.imageCache && this.imageCache.get(it.value);
                sig[i * 4 + 2] = !!(img && img.complete && img.naturalWidth > 0);
                sig[i * 4 + 3] = (it.displayWidth || 0) * 100000 + (it.displayHeight || 0);
            } else {
                sig[i * 4 + 2] = false;
                sig[i * 4 + 3] = 0;
            }
        }

        const cached = node._thumbnail;
        if (cached
            && cached.w === node.width
            && cached.h === node.height
            && cached.color === node.color
            && cached.shape === node.shape
            && cached.fontSize === (node.fontSize || 13)
            && cached.codeMode === !!node.codeMode
            && cached.textAlign === node.textAlign
            && cached.textColor === node.textColor
            && cached.nightMode === isNightMode
            && cached.selected === isSelected
            && cached.frameSelected === isFrameSelected
            && cached.sig.length === sig.length) {
            let match = true;
            for (let i = 0; i < sig.length; i++) {
                if (cached.sig[i] !== sig[i]) { match = false; break; }
            }
            if (match) return cached.canvas;
        }

        const w = Math.max(1, Math.ceil(node.width));
        const h = Math.max(1, Math.ceil(node.height));

        let canvas = cached && cached.canvas;
        if (!canvas || canvas.width !== w || canvas.height !== h) {
            canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
        }
        const tctx = canvas.getContext('2d');
        // 同一张离屏 canvas 可能被多次复用渲染（节点状态变化时重画）。
        // getContext('2d') 每次返回同一个 context 实例，translate 会在已有变换上累积，
        // 第二次渲染就会把节点画到画布外面去。务必先 setTransform 到单位矩阵再 translate。
        tctx.setTransform(1, 0, 0, 1, 0, 0);
        tctx.clearRect(0, 0, w, h);
        // drawNode 的坐标都是 world 坐标 (node.x, node.y)。
        // 平移 -(node.x, node.y) 把节点对齐到缩略图的 (0, 0)。
        tctx.translate(-node.x, -node.y);

        // 临时把 this.ctx 换成离屏 ctx：drawNode / drawNodeShape / drawNodeTag /
        // _getWrappedItem 都从 this.ctx 取上下文，这样无需复制一份 drawNode。
        const origCtx = this.ctx;
        this.ctx = tctx;
        try {
            this.drawNode(node, isNightMode, normalColor, textColor);
        } finally {
            this.ctx = origCtx;
        }

        node._thumbnail = {
            canvas,
            w: node.width,
            h: node.height,
            color: node.color,
            shape: node.shape,
            fontSize: node.fontSize || 13,
            codeMode: !!node.codeMode,
            textAlign: node.textAlign,
            textColor: node.textColor,
            nightMode: isNightMode,
            selected: isSelected,
            frameSelected: isFrameSelected,
            sig,
        };
        return canvas;
    }

    drawNode(node, isNightMode = null, normalColor = null, textColor = null) {
        if (isNightMode === null) isNightMode = document.body.classList.contains('night-mode');
        if (normalColor === null) normalColor = isNightMode ? NIGHT_BORDER_DEFAULT : '#667eea';
        if (textColor === null) textColor = isNightMode ? invertColor('#333') : '#333';
        const rawTextColor = node.textColor || '#333';
        const baseTextColor = isNightMode ? invertColor(rawTextColor) : rawTextColor;

        const isSelected = this.selectedNode === node;
        const isFrameSelected = this.selectedNodes.includes(node);
        const isEditing = this.editingNode === node;
        const codeMode = !!node.codeMode;
        const fontFamily = codeMode ? this.codeFontStack : 'sans-serif';
        const resolvedLanguage = this.resolveNodeLanguage(node);

        const nodeColor = isNightMode ? toNightFillColor(node.color) : node.color;
        // 在 code 模式下，节点整体背景与代码块一致，保证视觉统一；文字颜色随背景自动调整
        let codeBg = null;
        let codeTextColor = baseTextColor;
        if (codeMode) {
            // 如果节点颜色很深，则用深主题；否则用浅主题
            const darkBg = '#0f172a';
            const lightBg = '#f6f8fa';
            // 简单亮度判定
            const hex = nodeColor.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            const useDark = luminance < 0.4;
            codeBg = useDark ? darkBg : lightBg;
            if (!node.textColor) {
                codeTextColor = useDark ? '#e0e8ff' : '#1f2937';
            }
            this.ctx.fillStyle = codeBg;
            this.ctx.strokeStyle = codeBg;
        } else {
            this.ctx.fillStyle = nodeColor;
        }

        if (isEditing) {
            this.ctx.strokeStyle = normalColor;
            this.ctx.lineWidth = 2;
        } else {
            this.ctx.strokeStyle = isFrameSelected ? '#ff9800' : (isSelected ? '#ff6b6b' : normalColor);
            this.ctx.lineWidth = isFrameSelected ? 3 : (isSelected ? 3 : 2);
        }

        // 使用节点的shape属性，如果没有则默认为rounded-rect（向前兼容）
        const shape = node.shape || 'rounded-rect';
        this.drawNodeShape(this.ctx, node, shape);
        this.ctx.fill();
        this.ctx.stroke();

        // 绘制内容（支持多张图片和文本混合）
        // 确保节点有content数组
        if (!node.content) {
            node.content = [];
        }

        const fontSize = node.fontSize || 13;
        const codeFontStack = this.codeFontStack;
        const lineHeight = fontSize * (codeMode ? 1.35 : 1.3);
        const textAlignRaw = node.textAlign || 'center';
        // Code mode uses left alignment for predictable code layout
        const textAlign = codeMode ? 'left' : textAlignRaw;

        // 设置字体，确保wrapText函数能正确测量文本
        this.ctx.font = `${fontSize}px ${codeMode ? codeFontStack : fontFamily}`;

        // 检查图片缓存
        if (!this.imageCache) {
            this.imageCache = new Map();
        }

        // 先计算所有内容的总高度，以便垂直居中
        let totalContentHeight = 0;
        let hasImage = false;

        node.content.forEach((item, index) => {
            if (item.type === 'image') {
                hasImage = true;
                // 使用指定的显示尺寸（如有），否则使用原始尺寸
                const displayWidth = item.displayWidth || item.width;
                const displayHeight = item.displayHeight || item.height;
                // 为防止节点过窄导致溢出，稍后通过 requiredWidth 扩展节点宽度
                totalContentHeight += displayHeight;
                if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
            } else if (item.type === 'text') {
                const paddingX = codeMode && textAlign === 'left' ? this.NODE_HORIZONTAL_PADDING : this.NODE_HORIZONTAL_PADDING / 2;
                const wrapMaxWidth = node.width - paddingX * 2;
                const textFont = `${fontSize}px ${codeMode ? codeFontStack : fontFamily}`;
                const codeOpts = codeMode
                    ? { language: resolvedLanguage, color: codeTextColor, bg: codeBg, isNightMode }
                    : null;
                const { lines } = this._getWrappedItem(item, this.ctx, textFont, item.value, wrapMaxWidth, codeOpts);
                totalContentHeight += lines.length * lineHeight;
                if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
            } else if (item.type === 'link') {
                // 链接类型：标题（粗体）+ URL（小号，单行）
                const titleText = item.title || item.url;
                const titleFont = `bold ${fontSize}px sans-serif`;
                const { lines: titleLines } = this._getWrappedItem(item, this.ctx, titleFont, titleText, node.width - this.NODE_HORIZONTAL_PADDING, null);
                totalContentHeight += titleLines.length * lineHeight;
                totalContentHeight += lineHeight * 0.8;
                if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
            } else if (item.type === 'pending_link') {
                const pendingFont = `${fontSize}px sans-serif`;
                const { lines } = this._getWrappedItem(item, this.ctx, pendingFont, item.value || item.url, node.width - this.NODE_HORIZONTAL_PADDING, null);
                totalContentHeight += lines.length * lineHeight;
                if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
            } else if (item.type === 'pageLink') {
                const displayText = item.label || `→ ${item.value}`;
                const pageLinkFont = `bold ${fontSize}px sans-serif`;
                const { lines } = this._getWrappedItem(item, this.ctx, pageLinkFont, displayText, node.width - this.NODE_HORIZONTAL_PADDING, null);
                totalContentHeight += lines.length * lineHeight;
                if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
            }
        });

        // 计算起始Y位置，使内容垂直居中
        let currentY = node.y + (node.height - totalContentHeight) / 2;

        // 按顺序遍历content数组，绘制图片和文本
        node.content.forEach((item, index) => {
            // 在非第一项之前添加间隙
            if (index > 0) {
                currentY += this.IMAGE_TEXT_GAP;
            }

                            if (item.type === 'image') {
                                const isGif = item.value && item.value.startsWith('data:image/gif');
                                const displayHeight = item.displayHeight || item.height || 100;
            
                                if (isGif) {
                                    // GIF is handled by the overlay, just reserve the vertical space
                                    currentY += displayHeight;
                                } else {
                                    // 绘制图片（优化版：异步加载+占位符）
                                    try {
                                        let img = this.imageCache.get(item.value);
            
                                        if (!img) {
                                            // 创建新的Image对象
                                            img = new Image();
                                            this.imageCache.set(item.value, img);
                                            const p = new Promise(resolve => {
                                                const done = () => {
                                                    this.imageLoading.delete(item.value);
                                                    requestAnimationFrame(() => this.draw());
                                                    resolve();
                                                };
                                                img.onload = done;
                                                img.onerror = done;
                                            });
                                            this.imageLoading.set(item.value, p);
                                            img.src = item.value;
                                        }
            
                                        if (img.complete && img.naturalWidth > 0) {
                                            // 使用指定的显示尺寸（如有），否则使用原始尺寸
                                            const displayWidth = item.displayWidth || item.width;
                                            const imgX = node.x + (node.width - displayWidth) / 2;
                                            this.ctx.drawImage(img, imgX, currentY, displayWidth, displayHeight);
                                            currentY += displayHeight;
                                        } else {
                                            // 图片未加载完成，显示占位符
                                            const displayWidth = item.displayWidth || item.width || 100;
                                            const imgX = node.x + (node.width - displayWidth) / 2;
            
                                            // 绘制占位符背景
                                            this.ctx.fillStyle = 'rgba(240, 240, 240, 0.5)';
                                            this.ctx.fillRect(imgX, currentY, displayWidth, displayHeight);
                                            this.ctx.strokeStyle = '#ddd';
                                            this.ctx.lineWidth = 1;
                                            this.ctx.strokeRect(imgX, currentY, displayWidth, displayHeight);
            
                                            // 绘制加载文字
                                            this.ctx.fillStyle = '#999';
                                            this.ctx.font = '12px sans-serif';
                                            this.ctx.textAlign = 'center';
                                            this.ctx.textBaseline = 'middle';
                                            this.ctx.fillText('⏳', imgX + displayWidth / 2, currentY + displayHeight / 2);
            
                                            currentY += displayHeight;
                                        }
                                    } catch (error) {
                                        console.error('[绘制图片失败]', error);
                                        currentY += displayHeight;
                                    }
                                }            } else if (item.type === 'text') {
                // 绘制文本
                this.ctx.fillStyle = codeMode ? codeTextColor : baseTextColor;
                this.ctx.textAlign = textAlign;
                this.ctx.textBaseline = 'top';

                const paddingX = codeMode && textAlign === 'left' ? this.NODE_HORIZONTAL_PADDING : this.NODE_HORIZONTAL_PADDING / 2;
                const wrapMaxWidth = node.width - paddingX * 2;
                const textFont = `${fontSize}px ${codeMode ? codeFontStack : fontFamily}`;
                const codeOpts = codeMode
                    ? { language: resolvedLanguage, color: codeTextColor, bg: codeBg, isNightMode }
                    : null;
                // 缓存命中时 _getWrappedItem 会替我们 set ctx.font，无需手动再设
                const { lines, codeLines, maxLineWidth } = this._getWrappedItem(item, this.ctx, textFont, item.value, wrapMaxWidth, codeOpts);
                const bgPaddingX = 8;
                const bgPaddingY = 6;

                if (codeMode) {
                    const bgWidth = maxLineWidth + bgPaddingX * 2;
                    const bgHeight = lines.length * lineHeight + bgPaddingY * 2;
                    const textXBase = textAlign === 'left'
                        ? node.x + paddingX
                        : textAlign === 'right'
                            ? node.x + node.width - paddingX
                            : node.x + node.width / 2;
                    const bgX = textAlign === 'left'
                        ? textXBase - bgPaddingX
                        : textAlign === 'right'
                            ? textXBase - bgWidth + bgPaddingX
                            : textXBase - bgWidth / 2;
                    const bgY = currentY - bgPaddingY;
                    this.ctx.fillStyle = codeBg || (isNightMode ? '#0f172a' : '#f6f8fa');
                    this.ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
                    this.ctx.fillStyle = codeTextColor;
                }

                lines.forEach((line, lineIdx) => {
                    let textX;
                    if (textAlign === 'left') {
                        textX = node.x + paddingX;
                    } else if (textAlign === 'right') {
                        textX = node.x + node.width - paddingX;
                    } else {
                        textX = node.x + node.width / 2;
                    }

                    if (codeMode) {
                        const lineTokens = codeLines[lineIdx].tokens || [];
                        let cursorX = textX;
                        lineTokens.forEach(token => {
                            this.ctx.fillStyle = token.color || codeTextColor;
                            const textToDraw = token.text || '';
                            this.ctx.fillText(textToDraw, cursorX, currentY);
                            cursorX += this.ctx.measureText(textToDraw).width;
                        });
                    } else {
                        this.ctx.fillText(line, textX, currentY);
                    }

                    currentY += lineHeight;
                });
            } else if (item.type === 'link') {
                // 绘制链接：标题（粗体）+ URL（小号链接颜色）
                this.ctx.textAlign = textAlign;
                this.ctx.textBaseline = 'top';

                // 绘制标题（粗体）
                this.ctx.fillStyle = baseTextColor;
                const titleFont = `bold ${fontSize}px sans-serif`;
                const { lines: titleLines } = this._getWrappedItem(item, this.ctx, titleFont, item.title || item.url, node.width - this.NODE_HORIZONTAL_PADDING, null);
                titleLines.forEach(line => {
                    let textX;
                    if (textAlign === 'left') {
                        textX = node.x + 5;
                    } else if (textAlign === 'right') {
                        textX = node.x + node.width - 5;
                    } else {
                        textX = node.x + node.width / 2;
                    }
                    this.ctx.fillText(line, textX, currentY);
                    currentY += lineHeight;
                });

                // 绘制URL（小号，链接颜色）
                const linkColor = isNightMode ? NIGHT_BORDER_DEFAULT : '#667eea';
                this.ctx.fillStyle = linkColor;
                this.ctx.font = `${Math.max(fontSize * 0.75, 10)}px sans-serif`;

                // 截断URL以适应宽度
                let displayUrl = item.url;
                try {
                    const urlObj = new URL(item.url);
                    displayUrl = urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname.substring(0, 20) + '...' : '');
                } catch (e) {
                    // 如果解析失败，直接显示URL
                    if (displayUrl.length > 30) {
                        displayUrl = displayUrl.substring(0, 30) + '...';
                    }
                }

                let textX;
                if (textAlign === 'left') {
                    textX = node.x + 5;
                } else if (textAlign === 'right') {
                    textX = node.x + node.width - 5;
                } else {
                    textX = node.x + node.width / 2;
                }
                this.ctx.fillText(displayUrl, textX, currentY);
                currentY += lineHeight * 0.8;
            } else if (item.type === 'pending_link') {
                // 待处理的链接，暂时显示为普通文本
                this.ctx.fillStyle = baseTextColor;
                this.ctx.textAlign = textAlign;
                this.ctx.textBaseline = 'top';

                const pendingFont = `${fontSize}px sans-serif`;
                const { lines } = this._getWrappedItem(item, this.ctx, pendingFont, item.value || item.url, node.width - this.NODE_HORIZONTAL_PADDING, null);
                lines.forEach(line => {
                    let textX;
                    if (textAlign === 'left') {
                        textX = node.x + 5;
                    } else if (textAlign === 'right') {
                        textX = node.x + node.width - 5;
                    } else {
                        textX = node.x + node.width / 2;
                    }
                    this.ctx.fillText(line, textX, currentY);
                    currentY += lineHeight;
                });
            } else if (item.type === 'pageLink') {
                // 页面链接类型：显示链接图标和页面名称
                const pageLinkColor = isNightMode ? '#38bdf8' : '#0284c7';
                this.ctx.fillStyle = pageLinkColor;
                this.ctx.textAlign = textAlign;
                this.ctx.textBaseline = 'top';

                const displayText = item.label || `→ ${item.value}`;
                const pageLinkFont = `bold ${fontSize}px sans-serif`;
                const { lines } = this._getWrappedItem(item, this.ctx, pageLinkFont, displayText, node.width - this.NODE_HORIZONTAL_PADDING, null);
                lines.forEach(line => {
                    let textX;
                    if (textAlign === 'left') {
                        textX = node.x + 5;
                    } else if (textAlign === 'right') {
                        textX = node.x + node.width - 5;
                    } else {
                        textX = node.x + node.width / 2;
                    }
                    this.ctx.fillText(line, textX, currentY);
                    currentY += lineHeight;
                });
            }
        });

        // 绘制节点标签（右上角）
        this.drawNodeTag(this.ctx, node, isNightMode, false);

        // 绘制节点调整大小的控制点（仅在单选且不在编辑模式时显示）
        if (isSelected && this.editingNode !== node) {
            const handleSize = 12;
            const handleColor = normalColor;
            const whiteColor = isNightMode ? invertColor('white') : 'white';

            // 四个角的位置
            const corners = [
                { x: node.x, y: node.y },
                { x: node.x + node.width, y: node.y },
                { x: node.x, y: node.y + node.height },
                { x: node.x + node.width, y: node.y + node.height }
            ];

            corners.forEach(corner => {
                // 绘制圆形手柄
                this.ctx.fillStyle = handleColor;
                this.ctx.beginPath();
                this.ctx.arc(corner.x, corner.y, handleSize / 2, 0, Math.PI * 2);
                this.ctx.fill();

                // 边框
                this.ctx.strokeStyle = whiteColor;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(corner.x, corner.y, handleSize / 2, 0, Math.PI * 2);
                this.ctx.stroke();
            });
        }

        // 绘制图片调整控制点（如果节点有图片且被选中）
        if (node.image && node.imageDisplayWidth && node.imageDisplayHeight && (isSelected || isEditing)) {
            const handleSize = 10;
            const handleColor = '#ff9800';
            const whiteColor = isNightMode ? invertColor('white') : 'white';

            const imgX = node.x + (node.width - node.imageDisplayWidth) / 2;
            const imgY = node.y + this.IMAGE_TOP_PADDING;

            // 图片的四个角
            const imageCorners = [
                { x: imgX, y: imgY },
                { x: imgX + node.imageDisplayWidth, y: imgY },
                { x: imgX, y: imgY + node.imageDisplayHeight },
                { x: imgX + node.imageDisplayWidth, y: imgY + node.imageDisplayHeight }
            ];

            imageCorners.forEach(corner => {
                // 绘制圆形手柄
                this.ctx.fillStyle = handleColor;
                this.ctx.beginPath();
                this.ctx.arc(corner.x, corner.y, handleSize / 2, 0, Math.PI * 2);
                this.ctx.fill();

                // 边框
                this.ctx.strokeStyle = whiteColor;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(corner.x, corner.y, handleSize / 2, 0, Math.PI * 2);
                this.ctx.stroke();
            });
        }

        // 绘制文本选择高亮
        if (this.textSelectionNode === node && this.textSelectionStart && this.textSelectionEnd) {
            const minX = Math.min(this.textSelectionStart.x, this.textSelectionEnd.x);
            const maxX = Math.max(this.textSelectionStart.x, this.textSelectionEnd.x);
            const minY = Math.min(this.textSelectionStart.y, this.textSelectionEnd.y);
            const maxY = Math.max(this.textSelectionStart.y, this.textSelectionEnd.y);

            // 限制选择区域在节点内
            const selMinX = Math.max(minX, node.x);
            const selMaxX = Math.min(maxX, node.x + node.width);
            const selMinY = Math.max(minY, node.y);
            const selMaxY = Math.min(maxY, node.y + node.height);

            // 绘制半透明蓝色高亮
            this.ctx.fillStyle = 'rgba(102, 126, 234, 0.3)';
            this.ctx.fillRect(selMinX, selMinY, selMaxX - selMinX, selMaxY - selMinY);
        }
    }

    // 在 item 上缓存换行后的视觉行 / 最长行宽 / code 模式的 token 切片。
    // drawNode 每帧会先做"算高度"再做"实际绘制"两次遍历，原本每次都跑一遍 wrapText
    // + measureText(N 行)；缓存后同一帧内两次遍历只算一次，并且节点内容/字体/宽度
    // 不变时跨帧也能直接命中（pan / zoom 几乎为零成本）。
    _getWrappedItem(item, ctx, font, text, maxWidth, codeOpts) {
        const c = item._wrapCache;
        const codeKey = codeOpts
            ? `${codeOpts.language}|${codeOpts.color}|${codeOpts.bg}|${codeOpts.isNightMode ? 1 : 0}`
            : '';

        if (c
            && c.text === text
            && c.font === font
            && c.maxWidth === maxWidth
            && c.codeKey === codeKey) {
            // 命中：ctx.font 必须保证一致，让调用方紧接着用 fillText 时拿到正确字体
            ctx.font = font;
            return c.result;
        }

        ctx.font = font;
        let lines;
        let codeLines = null;
        if (codeOpts) {
            codeLines = this._buildCodeLines(text, maxWidth, ctx, codeOpts.language, codeOpts.color, codeOpts.bg, codeOpts.isNightMode);
            lines = codeLines.map(l => l.text);
        } else {
            lines = this.wrapText(text, maxWidth, ctx);
        }

        let maxLineWidth = 0;
        for (let i = 0; i < lines.length; i++) {
            const w = ctx.measureText(lines[i]).width;
            if (w > maxLineWidth) maxLineWidth = w;
        }

        const result = { lines, codeLines, maxLineWidth };
        item._wrapCache = { text, font, maxWidth, codeKey, result };
        return result;
    }

    wrapText(text, maxWidth, ctx) {
        // 把 tab 展开成 4 个空格，canvas 2D 不会渲染 \t
        const normalized = String(text == null ? '' : text).replace(/\t/g, '    ');
        const paragraphs = normalized.split(/\r?\n/);
        let lines = [];

        // 辅助函数：按字符强制换行（用于超长单词）
        const wrapByCharacter = (str) => {
            const chars = Array.from(str); // 支持Unicode字符
            let line = '';
            const charLines = [];
            const openBrackets = new Set(['(', '（', '【', '『', '《', '[', '{', '<']);
            const closeBrackets = new Set([')', '）', '】', '』', '》', ']', '}', '>']);

            for (let char of chars) {
                const testLine = line + char;
                const testWidth = ctx.measureText(testLine).width;

                if (testWidth > maxWidth && line) {
                    const lastChar = line.charAt(line.length - 1);

                    // 规则1：不要把开括号单独留在行尾
                    if (openBrackets.has(lastChar)) {
                        charLines.push(line.slice(0, -1));
                        line = lastChar + char;
                        continue;
                    }

                    // 规则2：尽量让闭括号跟前一个字符在同一行（允许轻微超宽）
                    const tolerance = Math.min(12, maxWidth * 0.05); // 最多允许 12px 或 5% 的超宽
                    if (closeBrackets.has(char) && (testWidth - maxWidth) <= tolerance) {
                        line = testLine;
                        continue;
                    }

                    // 默认换行
                    charLines.push(line);
                    line = char;
                } else {
                    line = testLine;
                }
            }

            if (line) charLines.push(line);
            return charLines;
        };

        paragraphs.forEach(paragraph => {
            if (paragraph === '') {
                lines.push('');
                return;
            }

            // 检测是否为代码类文本（包含括号、等号等编程语法）
            const isCodeLike = /[()[\]{}<>=]/.test(paragraph);

            // 对于代码类文本，只有在文本较短时才不换行
            // 如果文本过长（超过maxWidth的1.5倍），强制换行以避免超出锁定节点边界
            if (isCodeLike) {
                const paragraphWidth = ctx.measureText(paragraph).width;
                if (paragraphWidth <= maxWidth * 1.5) {
                    // 短代码：不换行
                    lines.push(paragraph);
                    return;
                }
                // 长代码：继续执行换行逻辑
            }

            // 保留行首空白（含展开自 tab 的空格），避免 split(' ') 把缩进吞掉
            const leadingMatch = paragraph.match(/^ +/);
            const leading = leadingMatch ? leadingMatch[0] : '';
            const body = leading ? paragraph.slice(leading.length) : paragraph;

            // CJK + Latin 混排：把每个 CJK 字符当作可换行点，连续的拉丁词当作不可分割单元。
            // 否则 split(' ') 会把 "一堆含金矿石（base model）" 当成两个原子词，
            // 第一段刚好放下、第二段超长触发字符级换行，结果就把"（base"撕在行尾。
            const cjkRegex = /[　-〿぀-ゟ゠-ヿ一-鿿＀-￯]/;
            if (cjkRegex.test(body)) {
                const tokens = [];
                let latinBuf = '';
                for (const c of Array.from(body)) {
                    if (c === ' ') {
                        if (latinBuf) { tokens.push(latinBuf); latinBuf = ''; }
                        tokens.push(' ');
                    } else if (cjkRegex.test(c)) {
                        if (latinBuf) { tokens.push(latinBuf); latinBuf = ''; }
                        tokens.push(c);
                    } else {
                        latinBuf += c;
                    }
                }
                if (latinBuf) tokens.push(latinBuf);

                const openBrackets = new Set(['(', '（', '【', '『', '《', '[', '{']);
                const closeBrackets = new Set([')', '）', '】', '』', '》', ']', '}']);
                let line = leading;

                for (let i = 0; i < tokens.length; i++) {
                    const tok = tokens[i];
                    if (tok === ' ' && (line === '' || line === leading)) continue;

                    // 如果拉丁词本身就超过 maxWidth，按字符强制切
                    if (tok.length > 1 && ctx.measureText(tok).width > maxWidth) {
                        if (line) { lines.push(line.replace(/ +$/, '')); line = ''; }
                        const charLines = wrapByCharacter(tok);
                        lines.push(...charLines.slice(0, -1));
                        line = charLines[charLines.length - 1] || '';
                        continue;
                    }

                    const testLine = line + tok;
                    const testWidth = ctx.measureText(testLine).width;

                    if (testWidth > maxWidth && line && line !== leading) {
                        const lastChar = line.charAt(line.length - 1);

                        // 不要把开括号单独留在行尾：把它挪到下一行陪伴下一个 token
                        if (openBrackets.has(lastChar) && line.length > 1) {
                            const beforeBracket = line.slice(0, -1).replace(/ +$/, '');
                            if (beforeBracket) {
                                lines.push(beforeBracket);
                                line = lastChar + (tok === ' ' ? '' : tok);
                                continue;
                            }
                        }

                        // 闭括号允许轻微超宽以跟前一个字符同行
                        if (tok.length === 1 && closeBrackets.has(tok)) {
                            const tolerance = Math.min(12, maxWidth * 0.05);
                            if ((testWidth - maxWidth) <= tolerance) {
                                line = testLine;
                                continue;
                            }
                        }

                        lines.push(line.replace(/ +$/, ''));
                        line = tok === ' ' ? '' : tok;
                    } else {
                        line = testLine;
                    }
                }

                if (line) lines.push(line.replace(/ +$/, ''));
                return;
            }

            // Split by spaces to preserve words
            const words = body.split(' ');
            let line = leading;
            let firstWord = true;

            for (let i = 0; i < words.length; i++) {
                const word = words[i];

                // 检查单个词是否超过最大宽度
                const wordWidth = ctx.measureText(word).width;
                if (wordWidth > maxWidth) {
                    // 单词太长，先保存当前行，然后按字符切分这个词
                    if (line) {
                        lines.push(line);
                        line = '';
                    }
                    // 按字符切分超长单词
                    const charLines = wrapByCharacter(word);
                    lines.push(...charLines.slice(0, -1)); // 添加完整的行
                    line = charLines[charLines.length - 1]; // 最后一行可能还能加内容
                    firstWord = false;
                    continue;
                }

                const testLine = firstWord ? line + word : line + ' ' + word;
                const testWidth = ctx.measureText(testLine).width;

                if (testWidth > maxWidth && line && !firstWord) {
                    // Current line is full, push it and start new line
                    lines.push(line);
                    line = word;
                } else {
                    // Word fits on current line
                    line = testLine;
                }
                firstWord = false;
            }

            if (line) lines.push(line);
        });
        return lines;
    }

    // 给 code 模式用的换行：按宽度软换行，但保留每段在原始行中的字符区间 [start, end)，
    // 这样调用方可以把"按整行 tokenize 出来的 tokens"按区间切到对应的视觉行上，
    // 高亮上下文（比如未闭合的字符串）就不会因为软换行而被打断。
    // 输入 line 不能包含换行符（调用方先按 \n split）。
    _wrapCodeLine(line, maxWidth, ctx) {
        if (line == null) return [{ text: '', start: 0, end: 0 }];
        if (line === '' || maxWidth <= 0) {
            return [{ text: line, start: 0, end: line.length }];
        }
        if (ctx.measureText(line).width <= maxWidth) {
            return [{ text: line, start: 0, end: line.length }];
        }

        const segments = [];
        let curStart = 0;
        let i = 0;
        let lastSpace = -1; // 当前段内最后一个空格的索引

        while (i < line.length) {
            if (line[i] === ' ') lastSpace = i;
            const segWidth = ctx.measureText(line.substring(curStart, i + 1)).width;

            if (segWidth > maxWidth && i > curStart) {
                let breakEnd, nextStart;
                if (lastSpace > curStart) {
                    // 在最近的空格处换行，丢弃这个空格本身
                    breakEnd = lastSpace;
                    nextStart = lastSpace + 1;
                } else {
                    // 整段没有空格，强制按字符断
                    breakEnd = i;
                    nextStart = i;
                }
                segments.push({
                    text: line.substring(curStart, breakEnd),
                    start: curStart,
                    end: breakEnd,
                });
                curStart = nextStart;
                i = curStart;
                lastSpace = -1;
            } else {
                i++;
            }
        }

        if (curStart < line.length) {
            segments.push({
                text: line.substring(curStart),
                start: curStart,
                end: line.length,
            });
        } else if (segments.length === 0) {
            segments.push({ text: '', start: 0, end: 0 });
        }

        return segments;
    }

    // 给 code 模式用的视觉行构造：把一段原始 item.value（可能含 \n 和 \t）切成视觉行，
    // 每个视觉行附带 token 列表（已按字符区间切片到该视觉行）。
    _buildCodeLines(rawValue, maxWidth, ctx, language, defaultColor, codeBg, isNightMode) {
        const normalized = String(rawValue == null ? '' : rawValue).replace(/\t/g, '    ');
        const paragraphs = normalized.split(/\r?\n/);
        const result = [];

        paragraphs.forEach(paragraph => {
            const tokens = this.highlightCode(paragraph, language, defaultColor, codeBg, isNightMode) || [];
            // 给 token 标上在 paragraph 中的字符区间
            let pos = 0;
            const tokenSpans = tokens.map(t => {
                const text = t.text || '';
                const start = pos;
                pos += text.length;
                return { color: t.color, start, end: pos };
            });

            const visuals = this._wrapCodeLine(paragraph, maxWidth, ctx);
            visuals.forEach(v => {
                const lineTokens = [];
                for (const tok of tokenSpans) {
                    const overlapStart = Math.max(tok.start, v.start);
                    const overlapEnd = Math.min(tok.end, v.end);
                    if (overlapStart < overlapEnd) {
                        lineTokens.push({
                            text: paragraph.substring(overlapStart, overlapEnd),
                            color: tok.color,
                        });
                    }
                }
                result.push({ text: v.text, tokens: lineTokens });
            });
        });

        return result;
    }

    getNodeLabel(node) {
        if (!node) return '节点';
        let text = '';
        if (node.content && Array.isArray(node.content)) {
            const textItem = node.content.find(item => item.type === 'text');
            const linkItem = node.content.find(item => item.type === 'link');
            if (textItem && textItem.value) text = textItem.value;
            else if (linkItem && linkItem.title) text = linkItem.title;
            else if (linkItem && linkItem.url) text = linkItem.url;
        } else if (node.text) {
            text = node.text;
        }
        const trimmed = (text || '').toString().trim();
        return trimmed ? (trimmed.length > 30 ? trimmed.slice(0, 30) + '…' : trimmed) : '节点';
    }

    preloadImages(srcList = []) {
        const tasks = srcList
            .filter(Boolean)
            .map(src => {
                if (this.imageCache.has(src)) {
                    const img = this.imageCache.get(src);
                    if (img && img.complete && img.naturalWidth > 0) return Promise.resolve();
                }
                if (this.imageLoading.has(src)) return this.imageLoading.get(src);

                const img = new Image();
                // Allow exporting canvases that contain remote images
                img.crossOrigin = 'anonymous';
                this.imageCache.set(src, img);
                const p = new Promise(resolve => {
                    const done = () => {
                        this.imageLoading.delete(src);
                        resolve();
                    };
                    img.onload = done;
                    img.onerror = done;
                });
                this.imageLoading.set(src, p);
                img.src = src;
                return p;
            });
        return Promise.all(tasks);
    }
    
    // ... update searchNodes, updateSearchResults, etc. to use node.content
    searchNodes(query) {
        const keywords = query.toLowerCase().split(' ').filter(k => k);
        if (keywords.length === 0) {
            return [];
        }

        return this.nodes.filter(node => {
            const nodeText = node.content.filter(item => item.type === 'text').map(item => item.value).join(' ').toLowerCase();
            return keywords.every(keyword => nodeText.includes(keyword));
        });
    }

    updateSearchResults(nodes) {
        const searchResultsContainer = document.getElementById('searchResults');
        searchResultsContainer.innerHTML = '';

        if (nodes.length === 0) {
            searchResultsContainer.classList.remove('active');
            return;
        }

        nodes.forEach(node => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            const nodeText = node.content.filter(item => item.type === 'text').map(item => item.value).join(' ');
            item.textContent = nodeText.length > 50 ? nodeText.substring(0, 50) + '...' : nodeText;
            item.title = nodeText;
            item.dataset.nodeId = node.id;

            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.goToNode(node.id);
                document.getElementById('nodeSearchInput').blur();
            });

            searchResultsContainer.appendChild(item);
        });

        searchResultsContainer.classList.add('active');
    }


    // 清除指定节点的文本缓存
    clearNodeTextCache(nodeId) {
        const keysToDelete = [];
        for (const key of this.textCache.keys()) {
            if (key.startsWith(`${nodeId}_`)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.textCache.delete(key));
    }

    newMindMap() {
        if (this.nodes.length > 0) {
            if (!confirm('确定要创建新脑图？当前内容将清空')) return;
        }
        this.clearAll();
    }

    clearAll() {
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.currentFileName = '未保存';
        this.imageOverlays.forEach(overlay => overlay.remove());
        this.imageOverlays.clear();
        const storageKey = this.getStorageKey();
        localStorage.removeItem(storageKey);
        localStorage.removeItem(`${storageKey}_filename`);
        this.selectNode(null);
        this.updateFileNameDisplay();
        this.draw();

        // 隐藏minimap（因为没有内容了）
        this.hideMinimap();
    }

    saveOrSaveAs() {
        if (this.currentFileName && this.currentFileName !== '未保存') {
            this.saveToLocalStorage();
            const statusBar = document.querySelector('.status-bar .coordinates');

            // 立即同步文件数据到服务器磁盘，等待写入完成后再显示结果
            const fileKey = this.getFileKey(this.currentFileName);
            const adapter = window.storageAdapter;
            if (adapter && adapter.useServerStorage) {
                statusBar.textContent = `⏳ 正在保存: ${this.currentFileName}...`;
                statusBar.style.color = '#ff9800';
                adapter.syncToServerNow(fileKey).then((ok) => {
                    if (ok) {
                        statusBar.textContent = `✓ 已保存: ${this.currentFileName}`;
                        statusBar.style.color = '#4caf50';
                    } else {
                        statusBar.textContent = `⚠️ 保存到服务器失败（数据暂存在内存中，请检查服务器）`;
                        statusBar.style.color = '#f44336';
                    }
                    setTimeout(() => {
                        statusBar.style.color = '';
                        statusBar.innerHTML = `坐标: <span id="coordX">0</span>, <span id="coordY">0</span>`;
                    }, 3000);
                });
            } else {
                // 无服务器模式，数据保存在 localStorage
                statusBar.textContent = `✓ 已保存(本地): ${this.currentFileName}`;
                statusBar.style.color = '#ff9800';
                setTimeout(() => {
                    statusBar.style.color = '';
                    statusBar.innerHTML = `坐标: <span id="coordX">0</span>, <span id="coordY">0</span>`;
                }, 2000);
            }
        } else {
            this.showSaveModal();
        }
    }

    renameFile() {
        if (this.currentFileName === '未保存') {
            alert('请先保存当前文件再重命名。');
            return;
        }

        const newName = prompt('输入新的文件名:', this.currentFileName);

        if (!newName || newName.trim() === '' || newName.trim() === this.currentFileName) {
            return; // Canceled or no change
        }

        const trimmedNewName = newName.trim();
        const existingFiles = this.listSavedFiles().map(f => f.name);

        if (existingFiles.includes(trimmedNewName)) {
            if (!confirm(`文件 "${trimmedNewName}" 已存在。要覆盖它吗？`)) {
                return;
            }
        }

        const oldKey = this.getFileKey(this.currentFileName);
        const newKey = this.getFileKey(trimmedNewName);
        const data = localStorage.getItem(oldKey);

        if (data) {
            localStorage.setItem(newKey, data);
            localStorage.removeItem(oldKey);

            this.currentFileName = trimmedNewName;
            this.updateFileNameDisplay();
            this.saveToLocalStorage(); // To update the workspace filename
            this.updateSidebarFileList();
            
            // Sync other screen if it had the old file open
            const otherApp = this.screenId === 'left' ? AppState.appRight : AppState.appLeft;
            if (otherApp && otherApp.currentFileName === this.currentFileName) {
                otherApp.loadFile(trimmedNewName);
            }
        }
    }

    showSaveModal(isSaveAs = false) {
        const modal = document.getElementById('saveModal');
        const modalTitle = modal.querySelector('h2');
        const modalDesc = modal.querySelector('p');
        const fileNameInput = document.getElementById('saveFileName');

        if (isSaveAs) {
            // 另存为
            modalTitle.textContent = '另存为';
            modalDesc.textContent = '输入一个新的文件名来创建副本。';
            fileNameInput.value = this.currentFileName && this.currentFileName !== '未保存' ? this.currentFileName + '_副本' : 'mindmap';
        } else {
            // 首次保存
            modalTitle.textContent = '保存脑图';
            modalDesc.textContent = '为文件命名后，编辑内容将自动保存。';
            fileNameInput.value = 'mindmap';
        }

        modal.classList.add('active');
        fileNameInput.focus();
        fileNameInput.select(); // 选中文本方便修改
    }

    updateFileManagerList(searchTerm = '') {
        const filesData = this.listSavedFiles();
        const fileManagerList = document.getElementById('fileManagerList');
        fileManagerList.innerHTML = '';

        // 过滤文件
        let filteredFiles = searchTerm
            ? filesData.filter(fileData => fileData.name.toLowerCase().includes(searchTerm.toLowerCase()))
            : filesData;

        if (filteredFiles.length === 0) {
            fileManagerList.innerHTML = '<p style="text-align: center; padding: 20px; color: #999;">没有找到文件</p>';
            return;
        }

        // 按当前排序设置排序
        filteredFiles.sort((a, b) => {
            let comparison = 0;
            if (this.fileSortBy === 'name') {
                comparison = a.name.localeCompare(b.name, 'zh-CN');
            } else if (this.fileSortBy === 'time') {
                comparison = (a.timestamp || 0) - (b.timestamp || 0);
            }
            return this.fileSortOrder === 'asc' ? comparison : -comparison;
        });

        var self = this;
        filteredFiles.forEach(function(fileData) {
            var file = fileData.name;
            var item = document.createElement('div');
            item.className = 'file-manager-item';
            item.style.cursor = 'pointer';

            // 点击整行加载文件
            item.onclick = function(e) {
                e.preventDefault();
                console.log('[文件管理器] 点击文件:', file);

                // 检查是否正在加载文件
                if (self.isLoadingFile) {
                    alert('⏳ 正在加载文件，请稍候...');
                    console.log('[文件管理器] 文件正在加载中，跳过本次点击');
                    return;
                }

                self.loadFile(file);
                closeFileManagerModal();
            };

            var nameContainer = document.createElement('div');
            nameContainer.style.flex = '1';

            var name = document.createElement('div');
            name.className = 'file-manager-item-name';
            name.textContent = file;
            nameContainer.appendChild(name);

            // 显示时间信息
            if (fileData.timestamp) {
                const timeSpan = document.createElement('div');
                const date = new Date(fileData.timestamp);
                timeSpan.textContent = date.toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                timeSpan.style.fontSize = '11px';
                timeSpan.style.color = '#999';
                timeSpan.style.marginTop = '4px';
                nameContainer.appendChild(timeSpan);
            }

            item.appendChild(nameContainer);

            const buttons = document.createElement('div');
            buttons.className = 'file-manager-item-buttons';

            var loadBtn = document.createElement('button');
            loadBtn.textContent = '加载';
            loadBtn.onclick = function(e) {
                e.stopPropagation(); // 阻止冒泡到父元素
                console.log('[文件管理器] 点击加载按钮:', file);

                // 检查是否正在加载文件
                if (self.isLoadingFile) {
                    alert('⏳ 正在加载文件，请稍候...');
                    console.log('[文件管理器] 文件正在加载中，跳过本次点击');
                    return;
                }

                self.loadFile(file);
                closeFileManagerModal();
            };
            buttons.appendChild(loadBtn);

            var deleteBtn = document.createElement('button');
            deleteBtn.textContent = '删除';
            deleteBtn.style.background = '#ff6b6b';
            deleteBtn.style.color = 'white';
            deleteBtn.onclick = function(e) {
                e.stopPropagation(); // 阻止冒泡到父元素
                var quickDeleteCheckbox = document.getElementById('quickDeleteCheckbox');
                var quickDelete = quickDeleteCheckbox && quickDeleteCheckbox.checked;
                if (quickDelete || confirm('确定要删除文件 "' + file + '"？')) {
                    self.deleteFile(file).then(function() {
                        console.log('[文件管理器] 文件已删除:', file);
                        // 刷新文件管理弹窗列表
                        var managerSearchInput = document.getElementById('fileManagerSearchInput');
                        var managerSearchTerm = managerSearchInput ? managerSearchInput.value : '';
                        self.updateFileManagerList(managerSearchTerm);
                        // 同时更新侧边栏文件列表
                        var searchInput = document.getElementById('fileSearchInput');
                        var searchTerm = searchInput ? searchInput.value : '';
                        self.updateSidebarFileList(searchTerm);
                    }).catch(function(error) {
                        console.error('[文件管理器] 删除文件失败:', error);
                        alert('删除文件失败: ' + error.message + '\n\n请检查:\n1. 服务器是否正在运行\n2. 网络连接是否正常');
                    });
                }
            };
            buttons.appendChild(deleteBtn);

            item.appendChild(buttons);
            fileManagerList.appendChild(item);
        });
    }

    showFileManager() {
        console.log('[showFileManager] 打开文件管理器');
        
        // 设置弹窗的排序控件初始状态
        var fileManagerSortSelect = document.getElementById('fileManagerSortSelect');
        var fileManagerSortOrderBtn = document.getElementById('fileManagerSortOrderBtn');
        var fileManagerSearchInput = document.getElementById('fileManagerSearchInput');
        var fileManagerRefreshBtn = document.getElementById('fileManagerRefreshBtn');

        if (fileManagerSortSelect) {
            fileManagerSortSelect.value = this.fileSortBy;
        }
        if (fileManagerSortOrderBtn) {
            fileManagerSortOrderBtn.textContent = this.fileSortOrder === 'asc' ? '↑' : '↓';
        }
        if (fileManagerSearchInput) {
            fileManagerSearchInput.value = '';
        }

        // 设置事件监听器（仅首次设置）
        if (!this._fileManagerListenersSet) {
            var self = this;
            
            // 搜索功能
            if (fileManagerSearchInput) {
                fileManagerSearchInput.oninput = function(e) {
                    self.updateFileManagerList(e.target.value);
                };
            }

            // 排序方式选择
            if (fileManagerSortSelect) {
                fileManagerSortSelect.onchange = function(e) {
                    self.fileSortBy = e.target.value;
                    var searchTerm = fileManagerSearchInput ? fileManagerSearchInput.value : '';
                    self.updateFileManagerList(searchTerm);
                    // 同时更新侧边栏
                    var sidebarSearchInput = document.getElementById('fileSearchInput');
                    var sidebarSearchTerm = sidebarSearchInput ? sidebarSearchInput.value : '';
                    self.updateSidebarFileList(sidebarSearchTerm);
                };
            }

            // 排序方向切换
            if (fileManagerSortOrderBtn) {
                fileManagerSortOrderBtn.onclick = function() {
                    self.fileSortOrder = self.fileSortOrder === 'asc' ? 'desc' : 'asc';
                    fileManagerSortOrderBtn.textContent = self.fileSortOrder === 'asc' ? '↑' : '↓';
                    var searchTerm = fileManagerSearchInput ? fileManagerSearchInput.value : '';
                    self.updateFileManagerList(searchTerm);
                    // 同时更新侧边栏的排序按钮
                    var sidebarSortOrderBtn = document.getElementById('fileSortOrderBtn');
                    if (sidebarSortOrderBtn) {
                        sidebarSortOrderBtn.textContent = self.fileSortOrder === 'asc' ? '↑' : '↓';
                    }
                    // 同时更新侧边栏列表
                    var sidebarSearchInput = document.getElementById('fileSearchInput');
                    var sidebarSearchTerm = sidebarSearchInput ? sidebarSearchInput.value : '';
                    self.updateSidebarFileList(sidebarSearchTerm);
                };
            }

            // 刷新文件列表
            if (fileManagerRefreshBtn) {
                fileManagerRefreshBtn.onclick = function() {
                    var originalText = fileManagerRefreshBtn.textContent;
                    fileManagerRefreshBtn.disabled = true;
                    fileManagerRefreshBtn.textContent = '刷新中...';

                    var updateLists = function() {
                        var searchTerm = fileManagerSearchInput ? fileManagerSearchInput.value : '';
                        self.updateFileManagerList(searchTerm);

                        var sidebarSearchInput = document.getElementById('fileSearchInput');
                        var sidebarSearchTerm = sidebarSearchInput ? sidebarSearchInput.value : '';
                        self.updateSidebarFileList(sidebarSearchTerm);
                    };

                    if (window.storageAdapter && typeof window.storageAdapter.refreshFromServer === 'function') {
                        window.storageAdapter.refreshFromServer({ allowDeleteLocal: true })
                            .then(updateLists)
                            .catch(updateLists)
                            .finally(function() {
                                fileManagerRefreshBtn.disabled = false;
                                fileManagerRefreshBtn.textContent = originalText;
                            });
                    } else {
                        updateLists();
                        fileManagerRefreshBtn.disabled = false;
                        fileManagerRefreshBtn.textContent = originalText;
                    }
                };
            }

            this._fileManagerListenersSet = true;
        }

        // 初始加载文件列表
        console.log('[showFileManager] 加载文件列表');
        this.updateFileManagerList();

        // 显示弹窗
        var modal = document.getElementById('fileManagerModal');
        if (modal) {
            modal.classList.add('active');
            console.log('[showFileManager] 弹窗已显示');
        } else {
            console.error('[showFileManager] 找不到 fileManagerModal 元素');
        }
    }

    async deleteFile(filename) {
        const key = this.getFileKey(filename);
        
        try {
            console.log('[文件] 删除:', filename);
            if (window.storageAdapter && typeof window.storageAdapter.deleteKey === 'function') {
                await window.storageAdapter.deleteKey(key);
            } else {
                localStorage.removeItem(key);
            }
        } catch (error) {
            console.error('[文件] 删除失败:', filename, error);
            throw error;
        }

        // 清理当前屏幕或另一屏幕的文件绑定
        const clearFileBinding = (appInstance) => {
            if (!appInstance) return;
            if (appInstance.currentFileName === filename) {
                appInstance.currentFileName = '未保存';
                appInstance.updateFileNameDisplay();
            }
        };

        clearFileBinding(this);
        const otherApp = this.screenId === 'left' ? AppState.appRight : AppState.appLeft;
        clearFileBinding(otherApp);
    }

    listFiles() {
        this.showFileManager();
    }

    saveToLocalStorage() {
        // 保存到历史记录（用于撤销/重做）
        this.saveHistory();

        this.saveToLocalStorageWithoutHistory();
    }

    saveToLocalStorageWithoutHistory() {
        try {
            // 序列化connections，只保存节点ID而不是对象引用
            const serializedConnections = this.connections.map(conn => ({
                from: conn.from ? { id: conn.from.id } : null,
                to: conn.to ? { id: conn.to.id } : null,
                controlOffsetY: conn.controlOffsetY || 0,
                lineStyle: conn.lineStyle || 'solid',
                lineType: conn.lineType || 'curve',
                lineWidth: conn.lineWidth || 2,
                color: conn.color || '#667eea',
                arrowSize: conn.arrowSize || 20,
                label: conn.label || '',
                labelFontSize: conn.labelFontSize || 12,
                isIndependent: !!conn.isIndependent,
                fromAnchorX: conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5,
                fromAnchorY: conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1,
                toAnchorX: conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5,
                toAnchorY: conn.toAnchorY !== undefined ? conn.toAnchorY : 0
            })).filter(conn => conn.from && conn.to);

            const data = {
                nodes: this.nodes,
                connections: serializedConnections,
                zoom: this.zoom,
                panX: this.panX,
                panY: this.panY,
                paddingMode: this.paddingMode,
                timestamp: new Date().toISOString()
            };
            const storageKey = this.getStorageKey();

            console.log('[saveToLocalStorage] 准备保存到工作区，键:', storageKey);
            localStorage.setItem(storageKey, JSON.stringify(data));
            console.log('[saveToLocalStorage] 工作区保存成功');

            // 保存当前文件名
            localStorage.setItem(`${storageKey}_filename`, this.currentFileName);

            // 自动保存到当前打开的文件（如果有的话）
            if (this.currentFileName && this.currentFileName !== '未保存') {
                const fileKey = this.getFileKey(this.currentFileName);
                console.log('=== [保存文件] 保存到文件 ===');
                console.log('文件名:', this.currentFileName);
                console.log('键:', fileKey);
                console.log('节点数:', this.nodes.length);
                console.log('数据大小:', JSON.stringify(data).length, '字符');

                localStorage.setItem(fileKey, JSON.stringify(data));

                // 立即验证
                const verification = localStorage.getItem(fileKey);
                console.log('localStorage已设置，验证:', verification ? '成功' : '失败');
                if (verification) {
                    console.log('验证数据大小:', verification.length, '字符');
                }

                // 同步另一个屏幕（如果打开了相同文件）
                this.syncOtherScreenIfSameFile(this.currentFileName);
            } else {
                console.log('[保存文件] 跳过文件保存，currentFileName:', this.currentFileName);
            }
        } catch (error) {
            console.error('[saveToLocalStorage] 保存失败:', error);
            console.error('[saveToLocalStorage] 错误详情:', error.message, error.stack);
            
            // 检查是否是 quota 错误，如果服务器存储可用则不提示
            var isQuotaError = error.name === 'QuotaExceededError' || 
                              (error.message && error.message.indexOf('quota') !== -1) ||
                              (error.message && error.message.indexOf('exceeded') !== -1);
            
            if (isQuotaError && window.storageAdapter && window.storageAdapter.useServerStorage) {
                // 数据已保存到服务器，不需要显示错误
                console.log('[saveToLocalStorage] localStorage 已满，但数据已保存到服务器');
            } else {
                alert('保存失败: ' + error.message + '\n\n可能原因:\n1. localStorage已满\n2. 浏览器隐私模式\n3. localStorage被禁用');
            }
        }
    }

    // 从URL hash中解析文件名
    static getFileFromURLHash() {
        const hash = window.location.hash;
        if (!hash || hash.length <= 1) return null;
        const params = new URLSearchParams(hash.substring(1));
        return params.get('file') ? decodeURIComponent(params.get('file')) : null;
    }

    // 从URL hash中解析命名空间
    static getNamespaceFromURLHash() {
        const hash = window.location.hash;
        if (!hash || hash.length <= 1) return null;
        const params = new URLSearchParams(hash.substring(1));
        return params.get('ns') ? decodeURIComponent(params.get('ns')) : null;
    }

    loadFromLocalStorage() {
        try {
            const storageKey = this.getStorageKey();
            var savedFileName = null;

            // 优先从URL hash获取文件名（支持URL直链访问）
            const hashFileName = MindMapApp.getFileFromURLHash();
            if (hashFileName) {
                console.log('[loadFromLocalStorage] 从URL获取文件名:', hashFileName);
                try {
                    const fileKey = this.getFileKey(hashFileName);
                    const fileData = localStorage.getItem(fileKey);
                    if (fileData) {
                        console.log('[URL直链] 加载URL指定的文件:', hashFileName);
                        this.loadFile(hashFileName, true);
                        return;
                    } else {
                        console.log('[URL直链] URL指定的文件不存在:', hashFileName);
                    }
                } catch (e) {
                    console.error('[loadFromLocalStorage] URL直链加载失败:', e);
                }
            }

            try {
                savedFileName = localStorage.getItem(storageKey + '_filename');
            } catch (e) {
                console.error('[loadFromLocalStorage] 获取文件名失败:', e);
            }

            console.log('[loadFromLocalStorage] storageKey:', storageKey, 'savedFileName:', savedFileName);

            // 如果有保存的文件名且不是"未保存"，先尝试直接加载该文件
            if (savedFileName && savedFileName !== '未保存') {
                try {
                    const fileKey = this.getFileKey(savedFileName);
                    const fileData = localStorage.getItem(fileKey);
                    if (fileData) {
                        console.log('[自动加载] 加载上次打开的文件:', savedFileName);
                        this.loadFile(savedFileName, true);  // 标记为初始化加载
                        return;
                    } else {
                        console.log('[自动加载] 上次打开的文件不存在，尝试加载第一个可用文件');
                    }
                } catch (e) {
                    console.error('[loadFromLocalStorage] 加载上次文件失败:', e);
                }
            }

            // 如果没有保存的文件名，或者文件名是"未保存"，或者对应文件不存在
            // 尝试加载第一个已保存的文件
            try {
                const filesData = this.listSavedFiles();
                console.log('[loadFromLocalStorage] 可用文件数:', filesData.length);
                if (filesData.length > 0) {
                    // 按时间排序（降序，最新的在前）
                    filesData.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
                    const firstFile = filesData[0].name;
                    console.log('[自动加载] 自动加载第一个文件:', firstFile);
                    this.loadFile(firstFile, true);  // 标记为初始化加载
                    return;
                }
            } catch (e) {
                console.error('[loadFromLocalStorage] 列出文件失败:', e);
            }

            // 没有任何文件可加载，尝试加载工作区临时数据
            try {
                const data = localStorage.getItem(storageKey);
                if (data) {
                    const parsed = JSON.parse(data);
                    this.nodes = parsed.nodes || [];
                    this.zoom = parsed.zoom || 1;
                    this.panX = parsed.panX || 0;
                    this.panY = parsed.panY || 0;

                    // 恢复边距模式
                    if (parsed.paddingMode) {
                        this.paddingMode = parsed.paddingMode;
                        this.updatePaddingConstants();

                        // 更新UI选择器
                        const paddingModeSelect = document.getElementById('paddingMode');
                        if (paddingModeSelect) {
                            paddingModeSelect.value = this.paddingMode;
                        }
                    }

                    // Migration from old format
                    if (this.nodes.length > 0) {
                        var self = this;
                        this.nodes.forEach(function(node) {
                            // 确保每个节点都有content数组
                            if (!node.content) {
                                node.content = [];
                            }

                            // 如果有text属性但content中没有text，迁移text到content
                            if (node.text) {
                                var hasTextInContent = node.content.some(function(item) { return item.type === 'text'; });
                                if (!hasTextInContent) {
                                    node.content.push({ type: 'text', value: node.text });
                                }
                            }
                        });
                    }

                    const rawConnections = parsed.connections || [];

                    // 重新建立连接关系
                    var self = this;
                    this.connections = rawConnections.map(function(conn) {
                        var fromId = conn.from && conn.from.id;
                        var toId = conn.to && conn.to.id;
                        var fromNode = self.nodes.find(function(n) { return n.id === fromId; });
                        var toNode = self.nodes.find(function(n) { return n.id === toId; });
                        return {
                            from: fromNode,
                            to: toNode,
                            controlOffsetY: conn.controlOffsetY || 0,
                            lineStyle: conn.lineStyle || 'solid',
                            lineType: conn.lineType || 'curve',
                            lineWidth: conn.lineWidth || 2,
                            color: conn.color || '#667eea',
                            arrowSize: conn.arrowSize || 20,
                            label: conn.label || '',
                            labelFontSize: conn.labelFontSize || 12,
                            isIndependent: !!conn.isIndependent,
                            fromAnchorX: conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5,
                            fromAnchorY: conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1,
                            toAnchorX: conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5,
                            toAnchorY: conn.toAnchorY !== undefined ? conn.toAnchorY : 0
                        };
                    }).filter(function(conn) { return conn.from && conn.to; });
                }
            } catch (e) {
                console.error('[loadFromLocalStorage] 解析工作区数据失败:', e);
            }

            // 恢复文件名（仅当没有成功加载任何文件时）
            if (savedFileName && savedFileName !== '未保存') {
                this.currentFileName = savedFileName;
                this.updateFileNameDisplay();
            }
            
            console.log('[loadFromLocalStorage] 完成，当前文件名:', this.currentFileName);
        } catch (e) {
            console.error('[loadFromLocalStorage] 严重错误:', e);
        }
    }

    saveFile(filename) {
        console.log('=== [saveFile] 开始 ===');
        console.log('文件名:', filename);
        console.log('screenId:', this.screenId);
        console.log('activeScreen:', AppState.activeScreen);

        // 设置当前文件名
        this.currentFileName = filename;
        this.updateFileNameDisplay();
        if (shortcutManager && this.screenId === AppState.activeScreen) {
            shortcutManager.setActiveFile(filename);
        }

        // 调用 saveToLocalStorage，它会自动保存到文件和工作区，并同步另一个屏幕
        this.saveToLocalStorage();

        console.log('=== [saveFile] 保存后准备更新文件列表 ===');

        // 更新侧边栏文件列表（如果是左屏或活跃屏幕）
        if (this.screenId === 'left' || this.screenId === AppState.activeScreen) {
            const searchInput = document.getElementById('fileSearchInput');
            const searchTerm = searchInput ? searchInput.value : '';
            console.log('调用 updateSidebarFileList，searchTerm:', searchTerm);
            this.updateSidebarFileList(searchTerm);
            console.log('=== [saveFile] updateSidebarFileList 调用完成 ===');
        } else {
            console.log('跳过 updateSidebarFileList，条件不满足');
        }
    }

    syncOtherScreenIfSameFile(filename) {
        // 获取另一个屏幕的app实例
        const otherApp = this.screenId === 'left' ? AppState.appRight : AppState.appLeft;

        // 如果另一个屏幕打开了相同的文件，自动重新加载
        if (otherApp && otherApp.currentFileName === filename) {
            const key = otherApp.getFileKey(filename);
            const data = localStorage.getItem(key);
            if (data) {
                const parsed = JSON.parse(data);
                otherApp.nodes = parsed.nodes || [];
                const rawConnections = parsed.connections || [];

                // 重新建立连接关系
                otherApp.connections = rawConnections.map(conn => {
                    const fromId = conn.from && conn.from.id;
                    const toId = conn.to && conn.to.id;
                    const fromNode = otherApp.nodes.find(n => n.id === fromId);
                    const toNode = otherApp.nodes.find(n => n.id === toId);
                    return {
                        from: fromNode,
                        to: toNode,
                        controlOffsetY: conn.controlOffsetY || 0,
                        lineStyle: conn.lineStyle || 'solid',
                        lineType: conn.lineType || 'curve',
                        lineWidth: conn.lineWidth || 2,
                        color: conn.color || '#667eea',
                        arrowSize: conn.arrowSize || 20,
                        label: conn.label || '',
                        labelFontSize: conn.labelFontSize || 12,
                        isIndependent: !!conn.isIndependent,
                        fromAnchorX: conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5,
                        fromAnchorY: conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1,
                        toAnchorX: conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5,
                        toAnchorY: conn.toAnchorY !== undefined ? conn.toAnchorY : 0
                    };
                }).filter(conn => conn.from && conn.to);

                otherApp.selectNode(null);
                otherApp.draw();
            }
        }
    }

    exportFileAsJSON() {
        // 导出文件为JSON
        const serializedConnections = this.connections.map(conn => ({
            from: conn.from ? { id: conn.from.id } : null,
            to: conn.to ? { id: conn.to.id } : null,
            controlOffsetY: conn.controlOffsetY || 0,
            lineStyle: conn.lineStyle || 'solid',
            lineType: conn.lineType || 'curve',
            lineWidth: conn.lineWidth || 2,
            color: conn.color || '#667eea',
            arrowSize: conn.arrowSize || 20,
            label: conn.label || '',
            labelFontSize: conn.labelFontSize || 12,
            isIndependent: !!conn.isIndependent,
            fromAnchorX: conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5,
            fromAnchorY: conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1,
            toAnchorX: conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5,
            toAnchorY: conn.toAnchorY !== undefined ? conn.toAnchorY : 0
        })).filter(conn => conn.from && conn.to);

        const data = {
            nodes: this.nodes,
            connections: serializedConnections,
            timestamp: new Date().toISOString()
        };

        const filename = this.currentFileName !== '未保存' ? this.currentFileName : 'mindmap';
        this.downloadFile(data, filename);
    }

    downloadFile(data, filename) {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    resolveNodeLanguage(node) {
        const preferred = this.normalizeLanguage(node && node.codeLanguage ? node.codeLanguage : 'auto');
        if (preferred && preferred !== 'auto') {
            return preferred;
        }
        const textContent = this.getNodeTextContent(node);
        const detected = this.detectLanguageFromText(textContent);
        return detected || 'plaintext';
    }

    getNodeTextContent(node) {
        if (!node) return '';
        if (node.content && Array.isArray(node.content)) {
            return node.content
                .filter(item => item.type === 'text')
                .map(item => item.value || '')
                .join('\n');
        }
        if (node.text) return node.text;
        return '';
    }

    normalizeLanguage(lang) {
        const normalized = (lang || 'auto').toString().trim().toLowerCase();
        switch (normalized) {
            case 'js':
            case 'javascript':
            case 'ts':
            case 'typescript':
                return 'javascript';
            case 'py':
            case 'python':
                return 'python';
            case 'golang':
            case 'go':
                return 'go';
            case 'c':
            case 'cpp':
            case 'c++':
                return 'cpp';
            case 'md':
            case 'markdown':
                return 'markdown';
            case 'html':
            case 'xml':
                return 'html';
            case 'css':
                return 'css';
            case 'json':
                return 'json';
            case 'java':
                return 'java';
            default:
                return normalized || 'auto';
        }
    }

    detectLanguageFromText(text) {
        if (!text || !text.trim()) return 'plaintext';
        const fenceMatch = text.match(/```\s*(\w+)/);
        if (fenceMatch && fenceMatch[1]) {
            return this.normalizeLanguage(fenceMatch[1]);
        }

        const scores = {
            javascript: 0,
            python: 0,
            go: 0,
            java: 0,
            cpp: 0,
            json: 0,
            html: 0,
            css: 0,
            markdown: 0
        };

        const lower = text.toLowerCase();

        if (/<\/?[a-z]/i.test(text)) scores.html += 2;
        if (/^\s*[\{\[].*[\}\]]\s*$/s.test(text) && /":/.test(text)) scores.json += 3;
        if (/^\s*#{1,6}\s/m.test(text) || /^\s*[-*+]\s/m.test(text) || />\s/.test(text)) scores.markdown += 2;

        if (/\basync\b|\bawait\b|\bconsole\.log\b/.test(lower)) scores.javascript += 2;
        if (/\bfunction\b|\bconst\b|\blet\b/.test(lower)) scores.javascript += 1;

        if (/\bdef\s+\w+/.test(text) || /\bself\b/.test(text)) scores.python += 2;
        if (/^\s*@\w+/m.test(text)) scores.python += 1;

        if (/\bpackage\s+main\b/.test(lower) || /\bfunc\s+\w+\s*\(/.test(text)) scores.go += 3;
        if (/\bdefer\b|\bchan\b/.test(lower)) scores.go += 1;

        if (/\bpublic\s+class\b/.test(lower) || /System\.out/.test(text)) scores.java += 3;
        if (/\bimplements\b|\bextends\b/.test(lower)) scores.java += 1;

        if (/#include\b/.test(text) || /std::/.test(text) || /->/.test(text)) scores.cpp += 2;

        if (/\bdisplay:\s*\w+/i.test(text) || /\bvar\(--\w+\)/.test(text)) scores.css += 2;

        let bestLang = 'plaintext';
        let bestScore = 0;
        Object.entries(scores).forEach(([lang, score]) => {
            if (score > bestScore) {
                bestLang = lang;
                bestScore = score;
            }
        });

        return bestLang;
    }

    getSyntaxPalette(isNightMode) {
        if (isNightMode) {
            return {
                keyword: '#9cdcfe',
                string: '#ce9178',
                comment: '#6b7280',
                number: '#b5cea8',
                literal: '#c792ea',
                type: '#7dd3fc',
                property: '#f59e0b',
                tag: '#7dd3fc',
                attr: '#93c5fd',
                attrValue: '#fbbf24',
                heading: '#f472b6',
                bullet: '#22d3ee',
                default: '#e0e8ff'
            };
        }
        return {
            keyword: '#0f4f99',
            string: '#c41a16',
            comment: '#6b7280',
            number: '#0b6b6b',
            literal: '#7c3aed',
            type: '#0f766e',
            property: '#b45309',
            tag: '#0f4f99',
            attr: '#2563eb',
            attrValue: '#b45309',
            heading: '#be123c',
            bullet: '#0284c7',
            default: '#1f2937'
        };
    }

    getLanguageSpec(lang) {
        const specs = {
            plaintext: {
                keywords: new Set(),
                literals: new Set(),
                types: new Set(),
                commentLine: null,
                blockCommentStart: null,
                blockCommentEnd: null,
                stringDelimiters: []
            },
            javascript: {
                keywords: new Set(['function', 'return', 'if', 'else', 'for', 'while', 'break', 'continue', 'class', 'import', 'from', 'export', 'const', 'let', 'var', 'try', 'catch', 'finally', 'await', 'async', 'switch', 'case', 'default', 'new', 'this', 'super']),
                literals: new Set(['true', 'false', 'null', 'undefined', 'NaN']),
                types: new Set(['string', 'number', 'boolean', 'any', 'void', 'unknown']),
                commentLine: '//',
                blockCommentStart: '/*',
                blockCommentEnd: '*/',
                stringDelimiters: ['"', "'", '`']
            },
            python: {
                keywords: new Set(['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'class', 'import', 'from', 'as', 'with', 'try', 'except', 'finally', 'lambda', 'yield', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'pass', 'raise', 'global', 'nonlocal', 'async', 'await']),
                literals: new Set(['True', 'False', 'None']),
                types: new Set(),
                commentLine: '#',
                stringDelimiters: ['"', "'"]
            },
            go: {
                keywords: new Set(['func', 'return', 'if', 'else', 'for', 'range', 'break', 'continue', 'struct', 'interface', 'import', 'package', 'type', 'var', 'const', 'go', 'defer', 'select', 'case', 'switch']),
                literals: new Set(['true', 'false', 'iota', 'nil']),
                types: new Set(['int', 'string', 'error', 'bool', 'byte', 'rune']),
                commentLine: '//',
                blockCommentStart: '/*',
                blockCommentEnd: '*/',
                stringDelimiters: ['"', '`', "'"]
            },
            java: {
                keywords: new Set(['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'return', 'if', 'else', 'for', 'while', 'break', 'continue', 'static', 'void', 'final', 'try', 'catch', 'finally', 'new', 'this', 'super']),
                literals: new Set(['true', 'false', 'null']),
                types: new Set(['String', 'Integer', 'Long', 'Boolean', 'Double', 'List', 'Map']),
                commentLine: '//',
                blockCommentStart: '/*',
                blockCommentEnd: '*/',
                stringDelimiters: ['"', "'"]
            },
            cpp: {
                keywords: new Set(['if', 'else', 'for', 'while', 'return', 'class', 'struct', 'public', 'private', 'protected', 'virtual', 'using', 'namespace', 'include', 'template', 'typename', 'auto', 'constexpr']),
                literals: new Set(['true', 'false', 'NULL', 'nullptr']),
                types: new Set(['int', 'long', 'float', 'double', 'char', 'std']),
                commentLine: '//',
                blockCommentStart: '/*',
                blockCommentEnd: '*/',
                stringDelimiters: ['"', "'"]
            },
            css: {
                keywords: new Set(['color', 'background', 'display', 'flex', 'grid', 'padding', 'margin', 'border', 'font', 'position', 'absolute', 'relative', 'var']),
                literals: new Set(),
                types: new Set(),
                commentLine: null,
                blockCommentStart: '/*',
                blockCommentEnd: '*/',
                stringDelimiters: ['"', "'"]
            },
            json: {
                keywords: new Set(),
                literals: new Set(['true', 'false', 'null']),
                types: new Set(),
                commentLine: null,
                blockCommentStart: null,
                blockCommentEnd: null,
                stringDelimiters: ['"'],
                treatStringsAsKeys: true
            }
        };

        return specs[lang] || specs.plaintext;
    }

    tokenizeLine(line, spec, palette, defaultColor) {
        const tokens = [];
        let i = 0;
        while (i < line.length) {
            if (spec.blockCommentStart && line.startsWith(spec.blockCommentStart, i)) {
                const endIdx = spec.blockCommentEnd ? line.indexOf(spec.blockCommentEnd, i + spec.blockCommentStart.length) : -1;
                if (endIdx !== -1) {
                    const text = line.slice(i, endIdx + spec.blockCommentEnd.length);
                    tokens.push({ text, color: palette.comment });
                    i = endIdx + spec.blockCommentEnd.length;
                    continue;
                } else {
                    tokens.push({ text: line.slice(i), color: palette.comment });
                    break;
                }
            }

            if (spec.commentLine && line.startsWith(spec.commentLine, i)) {
                tokens.push({ text: line.slice(i), color: palette.comment });
                break;
            }

            const ch = line[i];

            if (spec.stringDelimiters && spec.stringDelimiters.includes(ch)) {
                let j = i + 1;
                while (j < line.length) {
                    if (line[j] === '\\\\') {
                        j += 2;
                        continue;
                    }
                    if (line[j] === ch) {
                        j++;
                        break;
                    }
                    j++;
                }
                const tokenText = line.slice(i, j);
                let color = palette.string;
                if (spec.treatStringsAsKeys) {
                    let k = j;
                    while (k < line.length && /\s/.test(line[k])) k++;
                    if (line[k] === ':') {
                        color = palette.property;
                    }
                }
                tokens.push({ text: tokenText, color });
                i = j;
                continue;
            }

            if (/\d/.test(ch)) {
                let j = i + 1;
                while (j < line.length && /[\d._xXA-F]/.test(line[j])) j++;
                tokens.push({ text: line.slice(i, j), color: palette.number });
                i = j;
                continue;
            }

            if (/[A-Za-z_$]/.test(ch)) {
                let j = i + 1;
                while (j < line.length && /[A-Za-z0-9_$]/.test(line[j])) j++;
                const word = line.slice(i, j);
                if (spec.keywords.has(word)) {
                    tokens.push({ text: word, color: palette.keyword });
                } else if (spec.literals.has(word)) {
                    tokens.push({ text: word, color: palette.literal });
                } else if (spec.types && spec.types.has(word)) {
                    tokens.push({ text: word, color: palette.type });
                } else {
                    tokens.push({ text: word, color: defaultColor });
                }
                i = j;
                continue;
            }

            tokens.push({ text: ch, color: defaultColor });
            i++;
        }

        return tokens;
    }

    highlightHtmlLine(line, palette, defaultColor) {
        const tokens = [];
        const tagRegex = /(<!--.*?-->)|(<\/?[\w-]+)|([\w:-]+(?==))|("[^"]*"|'[^']*')|(\/?>)/g;
        let lastIndex = 0;
        let match;
        while ((match = tagRegex.exec(line)) !== null) {
            if (match.index > lastIndex) {
                tokens.push({ text: line.slice(lastIndex, match.index), color: defaultColor });
            }
            const value = match[0];
            if (value.startsWith('<!--')) {
                tokens.push({ text: value, color: palette.comment });
            } else if (value.startsWith('</') || value.startsWith('<')) {
                tokens.push({ text: value, color: palette.tag });
            } else if (value === '/>' || value === '>') {
                tokens.push({ text: value, color: palette.tag });
            } else if (/^[\w:-]+$/.test(value)) {
                tokens.push({ text: value, color: palette.attr });
            } else if ((value.startsWith('"') || value.startsWith("'"))) {
                tokens.push({ text: value, color: palette.attrValue });
            } else {
                tokens.push({ text: value, color: defaultColor });
            }
            lastIndex = tagRegex.lastIndex;
        }
        if (lastIndex < line.length) {
            tokens.push({ text: line.slice(lastIndex), color: defaultColor });
        }
        return tokens;
    }

    highlightMarkdownLine(line, palette, defaultColor) {
        if (/^```/.test(line)) {
            return [{ text: line, color: palette.comment }];
        }
        if (/^#{1,6}\s/.test(line)) {
            return [{ text: line, color: palette.heading }];
        }
        if (/^\s*[-*+]\s+/.test(line)) {
            const bullet = line.match(/^\s*[-*+]\s+/)[0];
            return [
                { text: bullet, color: palette.bullet },
                { text: line.slice(bullet.length), color: defaultColor }
            ];
        }
        if (/^>\s?/.test(line)) {
            const marker = line.match(/^>\s?/)[0];
            return [
                { text: marker, color: palette.comment },
                { text: line.slice(marker.length), color: defaultColor }
            ];
        }

        const tokens = [];
        const regex = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
        let lastIndex = 0;
        let match;
        while ((match = regex.exec(line)) !== null) {
            if (match.index > lastIndex) {
                tokens.push({ text: line.slice(lastIndex, match.index), color: defaultColor });
            }
            const value = match[0];
            if (value.startsWith('`')) {
                tokens.push({ text: value, color: palette.string });
            } else if (value.startsWith('[')) {
                tokens.push({ text: value, color: palette.tag });
            } else {
                tokens.push({ text: value, color: palette.literal });
            }
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < line.length) {
            tokens.push({ text: line.slice(lastIndex), color: defaultColor });
        }
        return tokens;
    }

    highlightCode(line, language, defaultColor, codeBg, isNightMode) {
        const palette = this.getSyntaxPalette(isNightMode);
        const lang = this.normalizeLanguage(language);
        if (lang === 'markdown') {
            return this.highlightMarkdownLine(line, palette, defaultColor);
        }
        if (lang === 'html') {
            return this.highlightHtmlLine(line, palette, defaultColor);
        }

        const spec = this.getLanguageSpec(lang);
        return this.tokenizeLine(line, spec, palette, defaultColor);
    }

    loadFile(filename, isInitialLoad = false) {
        // 检查是否正在加载文件（初始化加载除外）
        if (this.isLoadingFile && !isInitialLoad) {
            console.log('[loadFile] 正在加载文件，跳过本次请求:', filename);
            return;
        }

        try {
            // 设置加载状态（仅在非初始化加载时）
            if (!isInitialLoad) {
                this.isLoadingFile = true;
            }
            console.log('[loadFile] 开始加载文件:', filename, 'isInitialLoad:', isInitialLoad);

            // 显示加载提示（仅在非初始化加载时）
            if (!isInitialLoad) {
                const fileNameDisplay = document.getElementById(`fileName${this.screenId === 'left' ? 'Left' : 'Right'}`);
                const originalFileName = fileNameDisplay ? fileNameDisplay.textContent : '';
                if (fileNameDisplay) {
                    fileNameDisplay.textContent = '⏳ 正在加载...';
                    fileNameDisplay.style.color = '#ff9800';
                }
            }

            var key = this.getFileKey(filename);
            console.log('[loadFile] 文件键:', key);
            var data = localStorage.getItem(key);

            // 检查是否获取到占位符而不是真实数据
            if (data && typeof data === 'string' && data.indexOf('__server__:') === 0) {
                console.error('[loadFile] 获取到占位符而不是真实数据:', data.substring(0, 50));
                // 尝试直接从 serverCache 获取
                if (window.storageAdapter && window.storageAdapter.serverCache) {
                    data = window.storageAdapter.serverCache[key] || null;
                    console.log('[loadFile] 从 serverCache 获取:', data ? ('长度: ' + data.length) : 'null');
                }
            }

            console.log('[loadFile] 获取到数据:', data ? ('长度: ' + data.length) : 'null');

            if (data) {
                var parsed = JSON.parse(data);
                console.log('[loadFile] 解析成功，节点数:', (parsed.nodes && parsed.nodes.length) || 0);
                this.loadFileData(parsed, filename);
                console.log('[loadFile] 加载完成');
            } else {
                console.warn('[loadFile] 文件数据为空:', filename, '键:', key);
                alert('无法加载文件: ' + filename + '\n\n文件数据不存在或已被删除。');
            }
        } catch (e) {
            console.error('[loadFile] 加载文件失败:', filename, e);
            alert('加载文件失败: ' + e.message);
        } finally {
            // 无论成功或失败，都清除加载状态（仅在非初始化加载时）
            if (!isInitialLoad) {
                this.isLoadingFile = false;

                // 恢复文件名显示样式
                const fileNameDisplay = document.getElementById(`fileName${this.screenId === 'left' ? 'Left' : 'Right'}`);
                if (fileNameDisplay) {
                    fileNameDisplay.style.color = '';
                }
            }
        }
    }

    loadFileData(data, filename) {
        // 验证数据有效性
        if (!data || (!data.nodes && !data.connections)) {
            console.error('[加载文件] 文件数据无效:', filename);
            alert('文件数据无效，无法加载');
            return;
        }

        console.log('[加载文件] 开始加载:', filename, '节点数:', (data.nodes && data.nodes.length) || 0);

        this.nodes = data.nodes || [];
        this.currentFileName = filename;
        this.updateFileNameDisplay();
        this.zoom = data.zoom || 1;
        this.panX = data.panX || 0;
        this.panY = data.panY || 0;
        // 预加载本文件的图片资源，加速渲染
        const imageSources = [];
        this.nodes.forEach(n => {
            if (n && n.content) {
                n.content.forEach(item => {
                    if (item.type === 'image' && item.value) {
                        imageSources.push(item.value);
                    }
                });
            }
        });
        this.preloadImages(imageSources).then(() => this.draw());
        if (shortcutManager && this.screenId === AppState.activeScreen) {
            shortcutManager.setActiveFile(this.currentFileName);
        }

        // 恢复边距模式
        if (data.paddingMode) {
            this.paddingMode = data.paddingMode;
            this.updatePaddingConstants();

            // 更新UI选择器
            const paddingModeSelect = document.getElementById('paddingMode');
            if (paddingModeSelect) {
                paddingModeSelect.value = this.paddingMode;
            }
        }

        // Migration from old format
        if (this.nodes.length > 0 && !this.nodes[0].content) {
            this.nodes.forEach(node => {
                node.content = [];
                if (node.image) {
                    node.content.push({ type: 'image', value: node.image, width: node.imageWidth, height: node.imageHeight });
                    delete node.image;
                    delete node.imageWidth;
                    delete node.imageHeight;
                }
                if (node.text) {
                    node.content.push({ type: 'text', value: node.text });
                    delete node.text;
                }
            });
        }

        // Migration: 将纯URL文本节点转换为link类型
        const urlNodesToFetch = [];
        this.nodes.forEach(node => {
            if (!node.content) return;
            node.content.forEach((item, index) => {
                // 处理纯URL文本节点
                if (item.type === 'text' && item.value && isURL(item.value.trim())) {
                    const url = item.value.trim();
                    let fallbackTitle = url;
                    try {
                        const urlObj = new URL(url);
                        fallbackTitle = urlObj.hostname;
                    } catch (e) {}
                    node.content[index] = {
                        type: 'link',
                        url: url,
                        title: fallbackTitle,
                        description: ''
                    };
                    urlNodesToFetch.push({ node, index, url });
                }
                // 处理卡在pending_link状态的节点（上次保存时元数据获取未完成）
                if (item.type === 'pending_link' && item.url) {
                    const url = item.url;
                    let fallbackTitle = url;
                    try {
                        const urlObj = new URL(url);
                        fallbackTitle = urlObj.hostname;
                    } catch (e) {}
                    node.content[index] = {
                        type: 'link',
                        url: url,
                        title: fallbackTitle,
                        description: ''
                    };
                    urlNodesToFetch.push({ node, index, url });
                }
            });
        });
        // 异步获取元数据更新链接标题
        if (urlNodesToFetch.length > 0) {
            (async () => {
                for (const { node, index, url } of urlNodesToFetch) {
                    try {
                        const metadata = await fetchURLMetadata(url);
                        if (metadata && metadata.title && node.content[index]) {
                            node.content[index].title = metadata.title;
                            node.content[index].description = metadata.description || '';
                            if (metadata.url) node.content[index].url = metadata.url;
                        }
                    } catch (e) {
                        // 保持域名作为标题
                    }
                    this.autoFitNodeSize(node);
                }
                this.saveToLocalStorage();
                this.draw();
            })();
        }

        const rawConnections = data.connections || [];

        // Rebuild connection references - JSON serialization breaks object refs
        this.connections = rawConnections.map(conn => {
            const fromId = conn.from && conn.from.id;
            const toId = conn.to && conn.to.id;
            const fromNode = this.nodes.find(n => n.id === fromId);
            const toNode = this.nodes.find(n => n.id === toId);
            return {
                from: fromNode,
                to: toNode,
                controlOffsetY: conn.controlOffsetY || 0,
                lineStyle: conn.lineStyle || 'solid',
                lineType: conn.lineType || 'curve',
                lineWidth: conn.lineWidth || 2,
                color: conn.color || '#667eea',
                arrowSize: conn.arrowSize || 20,
                label: conn.label || '',
                labelFontSize: conn.labelFontSize || 12,
                isIndependent: !!conn.isIndependent,
                fromAnchorX: conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5,
                fromAnchorY: conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1,
                toAnchorX: conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5,
                toAnchorY: conn.toAnchorY !== undefined ? conn.toAnchorY : 0
            };
        }).filter(conn => conn.from && conn.to);

        this.selectNode(null);

        // 初始化历史记录（加载文件后重置历史）
        this.history = [];
        this.historyIndex = -1;

        // 保存当前状态为第一个历史记录
        this.saveToLocalStorage();
        console.log('[加载文件] 保存完成:', filename, '节点数:', this.nodes.length);

        this.draw();

        // 更新小地图（立即显示新加载的地图内容）
        if (this.nodes.length > 0) {
            this.renderMinimap();
            // 短暂显示minimap让用户看到更新
            this.showMinimap();
        }

        if (this.pendingShortcutSelect && this.pendingShortcutSelect.fileName === this.currentFileName) {
            const ref = this.pendingShortcutSelect;
            this.pendingShortcutSelect = null;
            const node = this.selectNodeById(ref.nodeId, { center: true });
            if (!node) {
                alert('未找到快捷方式对应的节点，可能已被删除');
            }
        }

        // 更新侧边栏文件列表（如果是左屏或活跃屏幕）
        if (this.screenId === 'left' || this.screenId === AppState.activeScreen) {
            const searchInput = document.getElementById('fileSearchInput');
            const searchTerm = searchInput ? searchInput.value : '';
            this.updateSidebarFileList(searchTerm);
        }
    }

    listSavedFiles() {
        const files = [];
        const namespace = AppState.namespaceManager ? AppState.namespaceManager.getCurrentNamespace() : 'default';
        const prefix = `mindmap_${namespace}_`;

        console.log('[文件列表] 开始扫描，前缀:', prefix);
        // 收集所有可能的键：localStorage + serverCache
        const allKeysArray = [];
        const seenKeys = {};

        // 从 localStorage 收集键（Safari 隐私模式可能抛错）
        try {
            console.log('[文件列表] localStorage.length:', localStorage.length);
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && !seenKeys[key]) {
                    seenKeys[key] = true;
                    allKeysArray.push(key);
                }
            }
        } catch (e) {
            console.warn('[文件列表] localStorage 不可用，跳过本地键扫描:', e);
        }
        
        // 从 serverCache 收集键（解决新浏览器中 localStorage 为空但服务器有数据的问题）
        if (window.storageAdapter && window.storageAdapter.serverCache) {
            var serverKeys = Object.keys(window.storageAdapter.serverCache);
            for (var i = 0; i < serverKeys.length; i++) {
                var key = serverKeys[i];
                if (!seenKeys[key]) {
                    seenKeys[key] = true;
                    allKeysArray.push(key);
                }
            }
        }
        
        console.log('[文件列表] 所有可用键数量:', allKeysArray.length);

        for (var j = 0; j < allKeysArray.length; j++) {
            var key = allKeysArray[j];
            // 只列出当前命名空间的文件
            if (key && key.startsWith(prefix)) {
                // 过滤掉系统键和以 _filename 结尾的键
                var hasCurrent = key.includes('_current_');
                var endsWithFilename = key.endsWith('_filename');

                if (!hasCurrent && !endsWithFilename) {
                    // 提取文件名（去掉命名空间前缀）
                    var filename = key.replace(prefix, '');

                    // 获取文件数据以读取时间戳
                    var timestamp = null;
                    var data = null;
                    try {
                        data = localStorage.getItem(key);
                    } catch (e) {
                        console.error('[文件列表] 读取错误:', filename, e);
                    }

                    // Safari 可能不允许劫持 localStorage.getItem，手动处理占位符
                    if (data && window.storageAdapter) {
                        var isPlaceholder = false;
                        if (typeof window.storageAdapter.isPlaceholder === 'function') {
                            isPlaceholder = window.storageAdapter.isPlaceholder(data);
                        } else {
                            isPlaceholder = typeof data === 'string' && data.indexOf('__server__:') === 0;
                        }
                        if (isPlaceholder) {
                            var cached = window.storageAdapter.serverCache ? window.storageAdapter.serverCache[key] : null;
                            if (cached) {
                                data = cached;
                            } else {
                                data = null;
                            }
                        }
                    }

                    if (!data) {
                        console.warn('[文件列表] 键存在但数据为空:', key);
                        continue;
                    }

                    try {
                        var parsed = JSON.parse(data);
                        timestamp = parsed.timestamp ? new Date(parsed.timestamp).getTime() : null;
                        var nodeCount = parsed.nodes ? parsed.nodes.length : 0;
                        console.log('[文件列表] 找到文件:', filename, '节点数:', nodeCount);
                    } catch (e) {
                        console.error('[文件列表] 解析错误:', filename, e);
                        continue;
                    }

                    files.push({
                        name: filename,
                        timestamp: timestamp
                    });
                }
            }
        }

        console.log('[文件列表] 找到文件总数:', files.length);
        return files;
    }

    exportAsImage() {
        // 计算需要的画布大小
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        this.nodes.forEach(node => {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + node.width);
            maxY = Math.max(maxY, node.y + node.height);
        });

        if (this.nodes.length === 0) {
            alert('脑图为空，无法导出');
            return;
        }

        const padding = 50;
        const width = maxX - minX + padding * 2;
        const height = maxY - minY + padding * 2;

        // 尝试分块渲染以突破内存限制
        const shouldUseTiling = width > 5000 || height > 5000;

        if (shouldUseTiling) {
            console.log('[导出] 图片较大，使用分块渲染技术...');
            this.exportAsImageTiled(minX, minY, width, height, padding);
            return;
        }

        // 渐进式降级策略：从高分辨率开始尝试，失败后自动降低
        const scaleOptions = [2, 1.5, 1, 0.75, 0.5]; // 不同的分辨率选项
        let currentScaleIndex = 0;

        const tryExport = () => {
            if (currentScaleIndex >= scaleOptions.length) {
                alert('导出失败\n\n已尝试所有分辨率选项仍无法导出。\n\n建议：\n1. 将脑图拆分为多个小文件\n2. 删除部分节点后重试\n3. 尝试导出JSON格式');
                return;
            }

            const scale = scaleOptions[currentScaleIndex];
            const maxCanvasSize = 16384;

            // 检查尺寸限制
            if (width * scale > maxCanvasSize || height * scale > maxCanvasSize) {
                console.log(`[导出] ${scale}x分辨率超出canvas限制，尝试更低分辨率...`);
                currentScaleIndex++;
                tryExport();
                return;
            }

            const finalWidth = Math.round(width * scale);
            const finalHeight = Math.round(height * scale);

            console.log(`[导出尝试 ${currentScaleIndex + 1}/${scaleOptions.length}] 分辨率: ${scale}x, 尺寸: ${finalWidth}x${finalHeight}`);

            try {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = finalWidth;
                tempCanvas.height = finalHeight;

                const tempCtx = tempCanvas.getContext('2d', {
                    alpha: false,
                    willReadFrequently: false
                });

                if (!tempCtx) {
                    throw new Error('无法创建canvas context');
                }

                // 对于低分辨率，启用平滑以改善视觉效果
                if (scale < 1) {
                    tempCtx.imageSmoothingEnabled = true;
                    tempCtx.imageSmoothingQuality = 'high';
                } else {
                    tempCtx.imageSmoothingEnabled = false;
                }

                // 缩放context
                tempCtx.scale(scale, scale);

                // 根据夜间模式设置背景
                const isNightMode = document.body.classList.contains('night-mode');
                tempCtx.fillStyle = isNightMode ? '#1a1a2e' : 'white';
                tempCtx.fillRect(0, 0, width, height);

                // 平移坐标系
                tempCtx.translate(-minX + padding, -minY + padding);

                // 绘制连接线
                this.connections.forEach(connection => {
                    this.drawConnectionOnContext(tempCtx, connection, scale);
                });

                // 绘制节点
                this.nodes.forEach(node => {
                    this.drawNodeOnContext(tempCtx, node, scale);
                });

                // 使用toBlob导出
                tempCanvas.toBlob((blob) => {
                    if (!blob) {
                        console.log(`[导出失败] ${scale}x分辨率Blob生成失败，尝试更低分辨率...`);
                        currentScaleIndex++;
                        setTimeout(tryExport, 100); // 延迟一下再尝试，让浏览器有时间释放内存
                        return;
                    }

                    // 导出成功
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    // 使用当前文件名作为前缀，如果是"未保存"则使用mindmap
                    const prefix = this.currentFileName === '未保存' ? 'mindmap' : this.currentFileName;
                    link.download = `${prefix}_${Date.now()}.png`;

                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    setTimeout(() => URL.revokeObjectURL(url), 100);

                    // 成功提示
                    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
                    console.log(`[导出成功] 尺寸: ${finalWidth}x${finalHeight}, 文件: ${sizeMB}MB, 分辨率: ${scale}x`);

                    if (scale < 1) {
                        alert(`导出成功！\n\n由于图片较大，使用了${scale}x分辨率\n尺寸: ${finalWidth}x${finalHeight}\n文件大小: ${sizeMB}MB\n\n提示：如需更高清晰度，建议缩小脑图范围后重新导出`);
                    } else if (scale < 2) {
                        console.log(`提示：使用了${scale}x分辨率以适应大图`);
                    }
                }, 'image/png', 0.95); // 稍微降低质量以减小文件大小

            } catch (error) {
                console.error(`[导出错误] ${scale}x分辨率:`, error);
                currentScaleIndex++;
                setTimeout(tryExport, 100);
            }
        };

        // 开始尝试导出
        tryExport();
    }

    // 分块渲染导出 - 突破内存限制
    exportAsImageTiled(minX, minY, width, height, padding, options = {}) {
        const tileSize = 2048; // 每个tile的大小（像素）
        const maxCanvasSize = 16384; // 浏览器限制
        const { onComplete, onError } = options;

        // 动态计算scale以确保最终canvas不超限
        let scale = 1.5;
        while ((width * scale > maxCanvasSize || height * scale > maxCanvasSize) && scale > 0.5) {
            scale -= 0.25;
        }
        scale = Math.max(0.5, scale); // 最低0.5x

        const finalWidth = Math.round(width * scale);
        const finalHeight = Math.round(height * scale);

        console.log(`[分块导出] 原始: ${Math.round(width)}x${Math.round(height)}, 缩放: ${scale}x, 最终: ${finalWidth}x${finalHeight}, Tile: ${tileSize}x${tileSize}`);

        // 计算需要多少个tile
        const tilesX = Math.ceil(finalWidth / tileSize);
        const tilesY = Math.ceil(finalHeight / tileSize);
        const totalTiles = tilesX * tilesY;

        console.log(`[分块导出] 需要 ${tilesX}x${tilesY} = ${totalTiles} 个块`);

        // 创建最终画布
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = finalWidth;
        finalCanvas.height = finalHeight;
        const finalCtx = finalCanvas.getContext('2d', {
            alpha: false,
            willReadFrequently: false
        });

        if (!finalCtx) {
            const err = new Error('无法创建画布，导出失败');
            if (onError) {
                onError(err);
            } else {
                alert(err.message);
            }
            return;
        }

        const isNightMode = document.body.classList.contains('night-mode');
        finalCtx.fillStyle = isNightMode ? '#1a1a2e' : 'white';
        finalCtx.fillRect(0, 0, finalWidth, finalHeight);

        // 逐块渲染
        let currentTile = 0;

        const renderNextTile = () => {
            if (currentTile >= totalTiles) {
                // 所有tile渲染完成，导出最终图片
                console.log('[分块导出] 所有块渲染完成，正在生成图片...');

                finalCanvas.toBlob((blob) => {
                    if (!blob) {
                        const err = new Error('图片生成失败，可能是尺寸过大');
                        if (onError) {
                            onError(err);
                        } else {
                            alert('图片生成失败，可能是尺寸过大\n\n建议：使用更小的分辨率或导出JSON格式');
                        }
                        return;
                    }

                    if (onComplete) {
                        onComplete({
                            blob,
                            width: finalWidth,
                            height: finalHeight,
                            scale
                        });
                        return;
                    }

                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    // 使用当前文件名作为前缀，如果是"未保存"则使用mindmap
                    const prefix = this.currentFileName === '未保存' ? 'mindmap' : this.currentFileName;
                    link.download = `${prefix}_tiled_${Date.now()}.png`;

                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    setTimeout(() => URL.revokeObjectURL(url), 100);

                    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
                    console.log(`[导出成功] 分块渲染完成！尺寸: ${finalWidth}x${finalHeight}, 文件: ${sizeMB}MB`);
                    alert(`导出成功！\n\n使用分块渲染技术\n尺寸: ${finalWidth}x${finalHeight}\n文件: ${sizeMB}MB\n分辨率: ${scale}x`);
                }, 'image/png', 0.92);

                return;
            }

            const tileX = currentTile % tilesX;
            const tileY = Math.floor(currentTile / tilesX);

            const tileCanvas = document.createElement('canvas');
            const tileWidth = Math.min(tileSize, finalWidth - tileX * tileSize);
            const tileHeight = Math.min(tileSize, finalHeight - tileY * tileSize);

            tileCanvas.width = tileWidth;
            tileCanvas.height = tileHeight;

            const tileCtx = tileCanvas.getContext('2d', {
                alpha: false,
                willReadFrequently: false
            });

            if (!tileCtx) {
                console.error(`Tile ${currentTile} 创建失败`);
                currentTile++;
                setTimeout(renderNextTile, 0);
                return;
            }

            // 计算tile在原始坐标系中的位置
            const offsetX = (tileX * tileSize) / scale;
            const offsetY = (tileY * tileSize) / scale;

            tileCtx.imageSmoothingEnabled = false;
            tileCtx.scale(scale, scale);
            tileCtx.fillStyle = isNightMode ? '#1a1a2e' : 'white';
            tileCtx.fillRect(0, 0, tileWidth / scale, tileHeight / scale);

            tileCtx.translate(-minX + padding - offsetX, -minY + padding - offsetY);

            // 只绘制可能在这个tile范围内的节点和连接
            const tileMinX = minX - padding + offsetX;
            const tileMinY = minY - padding + offsetY;
            const tileMaxX = tileMinX + tileWidth / scale;
            const tileMaxY = tileMinY + tileHeight / scale;

            // 绘制在tile范围内的连接线
            this.connections.forEach(connection => {
                const fromNode = connection.from;
                const toNode = connection.to;

                // 简单检查：连接线的端点是否在tile范围附近
                const connMinX = Math.min(fromNode.x, toNode.x) - 50;
                const connMaxX = Math.max(fromNode.x + fromNode.width, toNode.x + toNode.width) + 50;
                const connMinY = Math.min(fromNode.y, toNode.y) - 50;
                const connMaxY = Math.max(fromNode.y + fromNode.height, toNode.y + toNode.height) + 50;

                if (connMaxX >= tileMinX && connMinX <= tileMaxX &&
                    connMaxY >= tileMinY && connMinY <= tileMaxY) {
                    this.drawConnectionOnContext(tileCtx, connection, scale);
                }
            });

            // 绘制在tile范围内的节点
            this.nodes.forEach(node => {
                if (node.x + node.width >= tileMinX && node.x <= tileMaxX &&
                    node.y + node.height >= tileMinY && node.y <= tileMaxY) {
                    this.drawNodeOnContext(tileCtx, node, scale);
                }
            });

            // 将tile绘制到最终画布上
            finalCtx.drawImage(tileCanvas, tileX * tileSize, tileY * tileSize);

            // 进度提示
            if (currentTile % 10 === 0 || currentTile === totalTiles - 1) {
                const progress = Math.round((currentTile / totalTiles) * 100);
                console.log(`[分块导出] 进度: ${currentTile + 1}/${totalTiles} (${progress}%)`);
            }

            currentTile++;

            // 使用setTimeout避免阻塞UI，让浏览器有机会GC
            setTimeout(renderNextTile, 0);
        };

        // 开始渲染
        renderNextTile();
    }

    async generateExportImageBlob() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        this.nodes.forEach(node => {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + node.width);
            maxY = Math.max(maxY, node.y + node.height);
        });

        if (this.nodes.length === 0) {
            throw new Error('脑图为空，无法导出');
        }

        const padding = 50;
        const width = maxX - minX + padding * 2;
        const height = maxY - minY + padding * 2;
        const isNightMode = document.body.classList.contains('night-mode');

        // 对于特别大的图，直接走分块渲染
        const shouldUseTiling = width > 5000 || height > 5000;
        const maxCanvasSize = 16384;
        const scaleOptions = [2, 1.5, 1, 0.75, 0.5];

        const tryScaleRender = async (scale) => {
            const finalWidth = Math.round(width * scale);
            const finalHeight = Math.round(height * scale);

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = finalWidth;
            tempCanvas.height = finalHeight;

            const tempCtx = tempCanvas.getContext('2d', {
                alpha: false,
                willReadFrequently: false
            });

            if (!tempCtx) {
                return null;
            }

            if (scale < 1) {
                tempCtx.imageSmoothingEnabled = true;
                tempCtx.imageSmoothingQuality = 'high';
            } else {
                tempCtx.imageSmoothingEnabled = false;
            }

            tempCtx.scale(scale, scale);
            tempCtx.fillStyle = isNightMode ? '#1a1a2e' : 'white';
            tempCtx.fillRect(0, 0, width, height);
            tempCtx.translate(-minX + padding, -minY + padding);

            this.connections.forEach(connection => {
                this.drawConnectionOnContext(tempCtx, connection, scale);
            });

            this.nodes.forEach(node => {
                this.drawNodeOnContext(tempCtx, node, scale);
            });

            const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png', 0.95));
            if (!blob) return null;
            return { blob, width: finalWidth, height: finalHeight, scale };
        };

        // 先尝试非分块方案
        if (!shouldUseTiling) {
            for (const scale of scaleOptions) {
                if (width * scale > maxCanvasSize || height * scale > maxCanvasSize) {
                    continue;
                }
                try {
                    const result = await tryScaleRender(scale);
                    if (result) {
                        return result;
                    }
                } catch (err) {
                    console.warn(`[导出] ${scale}x 渲染失败，尝试下一档:`, err);
                }
            }
        }

        // 回退到分块渲染
        return await new Promise((resolve, reject) => {
            this.exportAsImageTiled(minX, minY, width, height, padding, {
                onComplete: ({ blob, width: finalWidth, height: finalHeight, scale }) => {
                    if (!blob) {
                        reject(new Error('图片生成失败，可能是尺寸过大'));
                        return;
                    }
                    resolve({ blob, width: finalWidth, height: finalHeight, scale });
                },
                onError: (err) => reject(err || new Error('分块导出失败'))
            });
        });
    }

    blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = (err) => reject(err || new Error('无法读取导出的图片数据'));
            reader.readAsDataURL(blob);
        });
    }

    importExternalData(data, filenameHint = '导入HTML') {
        if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.connections)) {
            throw new Error('导入数据格式不正确');
        }

        const nodes = data.nodes;
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const connections = (data.connections || []).map(conn => {
            const fromId = conn.fromId || (conn.from && conn.from.id);
            const toId = conn.toId || (conn.to && conn.to.id);
            const fromNode = nodeMap.get(fromId);
            const toNode = nodeMap.get(toId);
            if (!fromNode || !toNode) return null;
            return {
                from: fromNode,
                to: toNode,
                controlOffsetY: conn.controlOffsetY || 0,
                lineStyle: conn.lineStyle || 'solid',
                lineType: conn.lineType || 'curve',
                lineWidth: conn.lineWidth || 2,
                color: conn.color || '#667eea',
                arrowSize: conn.arrowSize || 20,
                label: conn.label || '',
                labelFontSize: conn.labelFontSize || 12,
                isIndependent: !!conn.isIndependent,
                fromAnchorX: conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5,
                fromAnchorY: conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1,
                toAnchorX: conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5,
                toAnchorY: conn.toAnchorY !== undefined ? conn.toAnchorY : 0
            };
        }).filter(Boolean);

        this.nodes = nodes;
        this.connections = connections;
        this.zoom = data.zoom || data.meta?.zoom || 1;
        this.panX = data.panX || data.meta?.panX || 0;
        this.panY = data.panY || data.meta?.panY || 0;
        this.currentFileName = filenameHint;
        this.updateFileNameDisplay();

        const imageSources = [];
        this.nodes.forEach(n => {
            if (n && n.content) {
                n.content.forEach(item => {
                    if (item.type === 'image' && item.value) {
                        imageSources.push(item.value);
                    }
                });
            }
        });
        this.preloadImages(imageSources).then(() => this.draw());

        if (shortcutManager && this.screenId === AppState.activeScreen) {
            shortcutManager.setActiveFile(this.currentFileName);
        }
    }

    exportAsEditableHTML() {
        const statusBar = document.querySelector('.status-bar .coordinates');
        const originalContent = statusBar ? statusBar.innerHTML : '';
        if (statusBar) {
            statusBar.textContent = '⏳ 正在准备可编辑HTML...';
        }

        try {
            const exportConnections = this.connections.map(conn => ({
                from: { id: conn.from && conn.from.id },
                to: { id: conn.to && conn.to.id },
                controlOffsetY: conn.controlOffsetY || 0,
                lineStyle: conn.lineStyle || 'solid',
                lineType: conn.lineType || 'curve',
                lineWidth: conn.lineWidth || 2,
                color: conn.color || '#667eea',
                arrowSize: conn.arrowSize || 20,
                label: conn.label || '',
                labelFontSize: conn.labelFontSize || 12,
                isIndependent: !!conn.isIndependent,
                fromAnchorX: conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5,
                fromAnchorY: conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1,
                toAnchorX: conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5,
                toAnchorY: conn.toAnchorY !== undefined ? conn.toAnchorY : 0
            })).filter(c => c.from && c.to && c.from.id && c.to.id);

            const exportData = {
                nodes: this.nodes,
                connections: exportConnections,
                meta: {
                    fileName: this.currentFileName === '未保存' ? 'mindmap' : this.currentFileName,
                    zoom: this.zoom || 1,
                    panX: this.panX || 0,
                    panY: this.panY || 0,
                    nightMode: document.body.classList.contains('night-mode')
                }
            };

            const payload = JSON.stringify(exportData).replace(/</g, '\\u003c');

            const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${exportData.meta.fileName}-editable</title>
    <style>
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        body { margin:0; background: radial-gradient(circle at 20% 20%, #f5f7fb, #e5e7eb); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; height:100vh; overflow:hidden; color:#1f2937; }
        .toolbar { position:fixed; top:12px; left:12px; right:12px; display:flex; gap:10px; padding:10px 12px; border-radius:14px; background:rgba(255,255,255,0.9); backdrop-filter:blur(12px); box-shadow:0 12px 30px rgba(0,0,0,0.12); z-index:10; align-items:center; }
        .toolbar button { border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:8px 12px; cursor:pointer; font-size:12px; color:#374151; transition:all 0.2s ease; }
        .toolbar button:hover { border-color:#cbd5e1; box-shadow:0 4px 12px rgba(0,0,0,0.12); transform:translateY(-1px); }
        .toolbar button.is-active { background:#111827; color:#fff; border-color:#111827; }
        .toolbar button:disabled { opacity:0.45; cursor:not-allowed; box-shadow:none; transform:none; }
        .viewer { position:absolute; inset:0; overflow:hidden; }
        .stage { position:absolute; top:0; left:0; transform-origin:0 0; }
        .canvas-layer { position:absolute; top:0; left:0; pointer-events:none; }
        .nodes-layer { position:absolute; top:0; left:0; }
        .node { position:absolute; border:2px solid #667eea; border-radius:12px; padding:10px 12px; background:white; box-shadow:0 4px 16px rgba(0,0,0,0.12); color:#1f2937; line-height:1.3; font-size:13px; text-align:center; user-select:text; cursor:grab; display:flex; flex-direction:column; justify-content:center; gap:10px; }
        .node p { margin:0; white-space:pre-wrap; word-break:break-word; }
        .node img { display:block; margin:0 auto; }
        .node a { color:#2563eb; text-decoration:none; }
        .node a:hover { text-decoration:underline; }
        .shape-rounded-rect { border-radius:12px; }
        .shape-rect { border-radius:4px; }
        .shape-circle { border-radius:999px; }
        .shape-diamond { clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
        .shape-trapezoid { clip-path: polygon(15% 0, 85% 0, 100% 100%, 0 100%); }
        .night body { background: radial-gradient(circle at 20% 20%, #1f2937, #0f172a); color:#e5e7eb; }
        .night .toolbar { background:rgba(30,41,59,0.7); color:#e5e7eb; border-color:#1f2937; }
        .night .toolbar button { background:#111827; color:#e5e7eb; border-color:#1f2937; }
        .night .node { background:#111827; border-color:#a5b4fc; color:#e5e7eb; box-shadow:0 8px 24px rgba(0,0,0,0.4); }
        .selection-box { position:absolute; border:1px dashed #22c55e; background:rgba(34,197,94,0.1); pointer-events:none; z-index:5; }
        .select-mode .viewer { cursor: default; }
        .select-mode .node { cursor: text; }
        .minimap { position: fixed; top: 74px; right: 16px; width: 200px; height: 150px; background: rgba(255,255,255,0.95); border: 2px solid #667eea; border-radius: 8px; box-shadow: 0 6px 16px rgba(0,0,0,0.2); z-index: 20; opacity: 0; pointer-events: none; transition: opacity 0.2s ease; cursor: pointer; }
        .minimap.visible { opacity: 1; pointer-events: auto; }
        .minimap canvas { width: 100%; height: 100%; border-radius: 6px; display: block; }
        .night .minimap { background: rgba(26, 26, 46, 0.95); border-color: #4a5568; }
    </style>
</head>
<body>
    <div class="toolbar">
        <div style="font-weight:700;">💡 可编辑脑图</div>
        <button id="addNodeBtn">添加节点</button>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;">
            颜色
            <input id="nodeColorPicker" type="color" value="#e8f0fe" style="width:28px;height:28px;border:none;background:transparent;cursor:pointer;padding:0;">
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;">
            字色
            <input id="nodeTextColorPicker" type="color" value="#1f2937" style="width:28px;height:28px;border:none;background:transparent;cursor:pointer;padding:0;">
        </label>
        <button id="downloadJsonBtn">下载JSON</button>
        <button id="downloadHtmlBtn">保存HTML</button>
        <button id="deleteNodeBtn" style="background:#fee2e2;color:#b91c1c;border-color:#fecaca;">删除选中节点</button>
        <button id="undoBtn" disabled>撤销</button>
        <button id="redoBtn" disabled>重做</button>
        <button id="toggleSelect">选择文本</button>
        <button id="resetView">重置视图</button>
        <button id="fitView">适配窗口</button>
        <span style="margin-left:auto;font-size:12px;color:#6b7280;" id="hint">拖动节点移动；双击节点编辑；拖拽空白平移，滚轮缩放</span>
    </div>
    <div class="viewer">
        <div class="stage" id="stage">
            <svg class="canvas-layer" id="connSvg"></svg>
            <div class="nodes-layer" id="nodesLayer"></div>
        </div>
    </div>
    <div class="minimap" id="minimap">
        <canvas id="minimapCanvas" width="200" height="150"></canvas>
    </div>
    <script id="export-data" type="application/json">${payload}</script>
    <script>
    (function(){
        const data = JSON.parse(document.getElementById('export-data').textContent);
        const nodes = data.nodes || [];
        const connections = data.connections || [];
        const meta = data.meta || {};
        if (meta.nightMode) document.body.classList.add('night');

        const stage = document.getElementById('stage');
        const svg = document.getElementById('connSvg');
        const nodesLayer = document.getElementById('nodesLayer');
        const viewer = document.querySelector('.viewer');
        const selectionBox = document.createElement('div');
        selectionBox.className = 'selection-box';
        selectionBox.style.display = 'none';
        nodesLayer.appendChild(selectionBox);
        const minimap = document.getElementById('minimap');
        const minimapCanvas = document.getElementById('minimapCanvas');
        const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
        let minimapTimer = null;
        let minimapVisible = false;
        let minimapTransform = null;

        // 简易节点内联编辑器
        const nodeEditor = document.createElement('div');
        nodeEditor.style.position = 'fixed';
        nodeEditor.style.zIndex = '1000000';
        nodeEditor.style.padding = '8px';
        nodeEditor.style.border = '1px solid #e5e7eb';
        nodeEditor.style.borderRadius = '10px';
        nodeEditor.style.background = 'white';
        nodeEditor.style.boxShadow = '0 10px 30px rgba(0,0,0,0.18)';
        nodeEditor.style.display = 'none';
        nodeEditor.style.width = '220px';
        const editorTextarea = document.createElement('textarea');
        editorTextarea.style.width = '100%';
        editorTextarea.style.height = '80px';
        editorTextarea.style.boxSizing = 'border-box';
        editorTextarea.style.padding = '6px 8px';
        editorTextarea.style.borderRadius = '8px';
        editorTextarea.style.border = '1px solid #ddd';
        editorTextarea.style.fontSize = '13px';
        editorTextarea.style.fontFamily = 'inherit';
        editorTextarea.style.resize = 'vertical';
        const editorBtnRow = document.createElement('div');
        editorBtnRow.style.marginTop = '8px';
        editorBtnRow.style.display = 'flex';
        editorBtnRow.style.gap = '6px';
        const editorSave = document.createElement('button');
        editorSave.textContent = '保存';
        editorSave.style.flex = '1';
        editorSave.style.padding = '8px';
        editorSave.style.border = '1px solid #e5e7eb';
        editorSave.style.borderRadius = '8px';
        editorSave.style.background = '#111827';
        editorSave.style.color = 'white';
        editorSave.style.cursor = 'pointer';
        const editorCancel = document.createElement('button');
        editorCancel.textContent = '取消';
        editorCancel.style.flex = '1';
        editorCancel.style.padding = '8px';
        editorCancel.style.border = '1px solid #e5e7eb';
        editorCancel.style.borderRadius = '8px';
        editorCancel.style.background = '#fff';
        editorCancel.style.cursor = 'pointer';
        editorBtnRow.appendChild(editorSave);
        editorBtnRow.appendChild(editorCancel);
        nodeEditor.appendChild(editorTextarea);
        nodeEditor.appendChild(editorBtnRow);
        document.body.appendChild(nodeEditor);

        function hideNodeEditor() {
            nodeEditor.style.display = 'none';
            nodeEditor.dataset.id = '';
        }

        function showNodeEditor(node, targetEl) {
            const rect = targetEl.getBoundingClientRect();
            nodeEditor.style.visibility = 'hidden';
            nodeEditor.style.display = 'block';
            nodeEditor.style.left = '-9999px';
            nodeEditor.style.top = '-9999px';
            // 强制一次布局获取尺寸
            const popupRect = nodeEditor.getBoundingClientRect();
            const popupWidth = popupRect.width || 220;
            const popupHeight = popupRect.height || 120;
            // 将弹窗居中于节点
            let left = rect.left + (rect.width / 2) - (popupWidth / 2);
            let top = rect.top + (rect.height / 2) - (popupHeight / 2);

            // 边界检查，确保弹窗在视口内
            if (left < 10) left = 10;
            if (top < 10) top = 10;
            if (left + popupWidth > window.innerWidth - 10) {
                left = window.innerWidth - popupWidth - 10;
            }
            if (top + popupHeight > window.innerHeight - 10) {
                top = window.innerHeight - popupHeight - 10;
            }

            nodeEditor.style.left = left + 'px';
            nodeEditor.style.top = top + 'px';
            const textVal = (node.content && node.content.find(c => c.type === 'text')?.value) || node.text || '';
            editorTextarea.value = textVal;
            nodeEditor.dataset.id = node.id;
            nodeEditor.style.visibility = 'visible';
            editorTextarea.focus();
            editorTextarea.select();
        }

        editorSave.onclick = () => {
            const id = nodeEditor.dataset.id;
            if (!id) return hideNodeEditor();
            const node = nodes.find(n => n.id == id);
            if (node) {
                const val = editorTextarea.value;
                if (node.content && node.content.length > 0) {
                    const firstText = node.content.find(c => c.type === 'text');
                    if (firstText) firstText.value = val;
                    else node.content.unshift({ type: 'text', value: val });
                } else {
                    node.content = [{ type: 'text', value: val }];
                }
                node.text = val;
                render();
                pushHistory();
            }
            hideNodeEditor();
        };
        editorCancel.onclick = hideNodeEditor;
        editorTextarea.onkeydown = (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                editorSave.onclick();
            } else if (e.key === 'Escape') {
                hideNodeEditor();
            }
        };

        const state = {
            scale: meta.zoom || 0.75,
            offsetX: meta.panX || 40,
            offsetY: meta.panY || 80,
            draggingStage: false,
            lastX: 0,
            lastY: 0,
            draggingNodeId: null,
            dragStart: {x:0,y:0},
            nodeStart: {x:0,y:0},
            nodeDragMoved: false,
            stageDragMoved: false,
            dragGroupIds: [],
            dragGroupStart: new Map(),
            selectedNodeId: null,
            selectedNodeIds: [],
            pendingConnectFromId: null,
            selection: { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 },
            selectMode: false,
            lastClickWorld: null,
            lastPointerDown: null,
            viewHistoryTimer: null
        };

        const history = {
            stack: [],
            index: -1,
            limit: 50
        };

        const padding = 120;

        function computeBounds() {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            nodes.forEach(n => {
                minX = Math.min(minX, n.x);
                minY = Math.min(minY, n.y);
                maxX = Math.max(maxX, n.x + n.width);
                maxY = Math.max(maxY, n.y + n.height);
            });
            if (!nodes.length) {
                minX = 0; minY = 0; maxX = 800; maxY = 600;
            }
            return {
                minX, minY,
                width: (maxX - minX) + padding*2,
                height: (maxY - minY) + padding*2
            };
        }

        function getLineType(conn) {
            return conn.lineType || 'curve';
        }

        function getElbowPoints(x1, y1, x2, y2) {
            const dx = Math.abs(x2 - x1);
            const dy = Math.abs(y2 - y1);
            if (dx >= dy) {
                return [
                    { x: x1, y: y1 },
                    { x: x2, y: y1 },
                    { x: x2, y: y2 }
                ];
            }
            return [
                { x: x1, y: y1 },
                { x: x1, y: y2 },
                { x: x2, y: y2 }
            ];
        }

        function getPolylineMidpoint(points) {
            if (!points || points.length < 2) return points && points[0] ? points[0] : { x: 0, y: 0 };
            let total = 0;
            for (let i = 0; i < points.length - 1; i++) {
                total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
            }
            let remaining = total / 2;
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const seg = Math.hypot(b.x - a.x, b.y - a.y);
                if (seg === 0) continue;
                if (remaining <= seg) {
                    const t = remaining / seg;
                    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
                }
                remaining -= seg;
            }
            return points[points.length - 1];
        }

        function setStageSize() {
            const b = computeBounds();
            svg.setAttribute('width', b.width);
            svg.setAttribute('height', b.height);
            nodesLayer.style.width = b.width + 'px';
            nodesLayer.style.height = b.height + 'px';
        }

        function applyTransform() {
            stage.style.transform = \`translate(\${state.offsetX}px, \${state.offsetY}px) scale(\${state.scale})\`;
            if (minimapCtx) {
                showMinimap();
            }
        }

        function showMinimap() {
            if (!minimap) return;
            if (!minimapVisible) {
                minimap.classList.add('visible');
                minimapVisible = true;
            }
            renderMinimap();
            if (minimapTimer) clearTimeout(minimapTimer);
            minimapTimer = setTimeout(hideMinimap, 1600);
        }

        function hideMinimap() {
            if (!minimap) return;
            minimap.classList.remove('visible');
            minimapVisible = false;
            if (minimapTimer) {
                clearTimeout(minimapTimer);
                minimapTimer = null;
            }
        }

        function renderMinimap() {
            if (!minimapCtx || !minimapCanvas) return;
            const ctx = minimapCtx;
            const width = minimapCanvas.width;
            const height = minimapCanvas.height;
            ctx.clearRect(0, 0, width, height);

            const b = computeBounds();
            const scale = Math.min(width / b.width, height / b.height);
            const offsetX = (width - b.width * scale) / 2;
            const offsetY = (height - b.height * scale) / 2;
            minimapTransform = { scale, offsetX, offsetY };

            const isNight = meta.nightMode;
            const lineFallback = isNight ? '#a5b4fc' : '#667eea';
            const nodeStroke = isNight ? 'rgba(148,163,184,0.6)' : 'rgba(0,0,0,0.2)';
            const nodeFillFallback = isNight ? '#0f172a' : '#ffffff';

            ctx.save();
            ctx.translate(offsetX, offsetY);
            ctx.scale(scale, scale);
            ctx.lineWidth = Math.max(1 / scale, 0.5);

            const nodeMap = new Map(nodes.map(n => [n.id, n]));
            connections.forEach(conn => {
                const fromNode = nodeMap.get(conn.from && conn.from.id);
                const toNode = nodeMap.get(conn.to && conn.to.id);
                if (!fromNode || !toNode) return;
                const fromAnchorX = conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5;
                const fromAnchorY = conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1;
                const toAnchorX = conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5;
                const toAnchorY = conn.toAnchorY !== undefined ? conn.toAnchorY : 0;
                const x1 = (fromNode.x - b.minX + padding) + fromNode.width * fromAnchorX;
                const y1 = (fromNode.y - b.minY + padding) + fromNode.height * fromAnchorY;
                const x2 = (toNode.x - b.minX + padding) + toNode.width * toAnchorX;
                const y2 = (toNode.y - b.minY + padding) + toNode.height * toAnchorY;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                const lineType = getLineType(conn);
                if (lineType === 'curve') {
                    const offset = conn.controlOffsetY || 0;
                    const cp1y = y1 + (y2 - y1) / 2 + offset;
                    const cp2y = y2 - (y2 - y1) / 2 + offset;
                    ctx.bezierCurveTo(x1, cp1y, x2, cp2y, x2, y2);
                } else if (lineType === 'straight') {
                    ctx.lineTo(x2, y2);
                } else {
                    const points = getElbowPoints(x1, y1, x2, y2);
                    points.slice(1).forEach(pt => ctx.lineTo(pt.x, pt.y));
                }
                ctx.strokeStyle = conn.color || lineFallback;
                ctx.stroke();
            });

            nodes.forEach(node => {
                const x = node.x - b.minX + padding;
                const y = node.y - b.minY + padding;
                ctx.fillStyle = node.color || nodeFillFallback;
                ctx.strokeStyle = nodeStroke;
                ctx.fillRect(x, y, node.width, node.height);
                ctx.strokeRect(x, y, node.width, node.height);
            });

            const viewX = (-state.offsetX) / state.scale;
            const viewY = (-state.offsetY) / state.scale;
            const viewW = viewer.clientWidth / state.scale;
            const viewH = viewer.clientHeight / state.scale;
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = Math.max(1.5 / scale, 0.5);
            ctx.strokeRect(viewX, viewY, viewW, viewH);

            ctx.restore();
        }

        function renderConnections() {
            const isNight = meta.nightMode;
            const nodeMap = new Map(nodes.map(n => [n.id, n]));
            svg.innerHTML = '';
            const b = computeBounds();

            connections.forEach(conn => {
                const fromNode = nodeMap.get(conn.from && conn.from.id);
                const toNode = nodeMap.get(conn.to && conn.to.id);
                if (!fromNode || !toNode) return;

                const fromAnchorX = conn.fromAnchorX !== undefined ? conn.fromAnchorX : 0.5;
                const fromAnchorY = conn.fromAnchorY !== undefined ? conn.fromAnchorY : 1;
                const toAnchorX = conn.toAnchorX !== undefined ? conn.toAnchorX : 0.5;
                const toAnchorY = conn.toAnchorY !== undefined ? conn.toAnchorY : 0;

                const x1 = (fromNode.x - b.minX + padding) + fromNode.width * fromAnchorX;
                const y1 = (fromNode.y - b.minY + padding) + fromNode.height * fromAnchorY;
                const x2 = (toNode.x - b.minX + padding) + toNode.width * toAnchorX;
                const y2 = (toNode.y - b.minY + padding) + toNode.height * toAnchorY;

                const lineType = getLineType(conn);
                const offset = conn.controlOffsetY || 0;
                const cp1y = y1 + (y2 - y1) / 2 + offset;
                const cp2y = y2 - (y2 - y1) / 2 + offset;

                const color = conn.color || '#667eea';
                const displayColor = isNight ? '#a5b4fc' : color;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                let pathD = '';
                let arrowTip = { x: x2, y: y2 };
                let arrowRef = { x: x2 - 10, y: y2 };
                let labelPoint = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
                if (lineType === 'curve') {
                    pathD = \`M \${x1} \${y1} C \${x1} \${cp1y} \${x2} \${cp2y} \${x2} \${y2}\`;
                    const pointOnCurve = (t) => {
                        const mt = 1 - t;
                        const px = mt*mt*mt*x1 + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x2;
                        const py = mt*mt*mt*y1 + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*y2;
                        return { x: px, y: py };
                    };
                    arrowTip = pointOnCurve(0.995);
                    arrowRef = pointOnCurve(0.985);
                    labelPoint = pointOnCurve(0.5);
                } else if (lineType === 'straight') {
                    pathD = \`M \${x1} \${y1} L \${x2} \${y2}\`;
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const len = Math.hypot(dx, dy) || 1;
                    arrowRef = { x: x2 - (dx / len) * 10, y: y2 - (dy / len) * 10 };
                } else {
                    const points = getElbowPoints(x1, y1, x2, y2);
                    pathD = \`M \${points[0].x} \${points[0].y} L \${points[1].x} \${points[1].y} L \${points[2].x} \${points[2].y}\`;
                    const last = points[points.length - 1];
                    const prev = points[points.length - 2];
                    const dx = last.x - prev.x;
                    const dy = last.y - prev.y;
                    const len = Math.hypot(dx, dy) || 1;
                    arrowTip = { x: last.x, y: last.y };
                    arrowRef = { x: last.x - (dx / len) * 10, y: last.y - (dy / len) * 10 };
                    labelPoint = getPolylineMidpoint(points);
                }
                path.setAttribute('d', pathD);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', displayColor);
                path.setAttribute('stroke-width', conn.lineWidth || 2);
                if (conn.lineStyle === 'dashed') path.setAttribute('stroke-dasharray', '10 5');
                else if (conn.lineStyle === 'dotted') path.setAttribute('stroke-dasharray', '2 3');
                svg.appendChild(path);

                const arrowSize = conn.arrowSize || 20;
                const angle = Math.atan2(arrowTip.y - arrowRef.y, arrowTip.x - arrowRef.x);

                const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                const p1x = arrowTip.x;
                const p1y = arrowTip.y;
                const p2x = arrowTip.x - arrowSize * Math.cos(angle - Math.PI / 6);
                const p2y = arrowTip.y - arrowSize * Math.sin(angle - Math.PI / 6);
                const p3x = arrowTip.x - arrowSize * Math.cos(angle + Math.PI / 6);
                const p3y = arrowTip.y - arrowSize * Math.sin(angle + Math.PI / 6);
                arrow.setAttribute('points', \`\${p1x},\${p1y} \${p2x},\${p2y} \${p3x},\${p3y}\`);
                arrow.setAttribute('fill', displayColor);
                svg.appendChild(arrow);

                if (conn.label && conn.label.trim()) {
                    const midX = labelPoint.x;
                    const midY = labelPoint.y;
                    const fontSize = conn.labelFontSize || 12;
                    const lineHeight = fontSize * 1.4;
                    const bgColor = isNight ? '#1a1a2e' : '#ffffff';
                    const textColor = isNight ? '#e0e0e0' : '#333333';

                    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    textEl.setAttribute('x', midX);
                    textEl.setAttribute('y', midY + fontSize * 0.35);
                    textEl.setAttribute('fill', textColor);
                    textEl.setAttribute('font-size', fontSize);
                    textEl.setAttribute('text-anchor', 'middle');
                    textEl.textContent = conn.label;
                    svg.appendChild(textEl);

                    const textWidth = textEl.getBBox ? textEl.getBBox().width : (conn.label.length * fontSize * 0.55);
                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('x', midX - textWidth / 2 - 4);
                    rect.setAttribute('y', midY - lineHeight / 2);
                    rect.setAttribute('width', textWidth + 8);
                    rect.setAttribute('height', lineHeight);
                    rect.setAttribute('fill', bgColor);
                    rect.setAttribute('stroke', displayColor);
                    rect.setAttribute('stroke-width', 1);
                    svg.insertBefore(rect, textEl);
                }
            });
        }

        function renderNodes() {
            nodesLayer.innerHTML = '';
            nodesLayer.appendChild(selectionBox);
            const b = computeBounds();
            nodes.forEach(node => {
                const el = document.createElement('div');
                el.className = 'node';
                const shape = node.shape || 'rounded-rect';
                el.classList.add(\`shape-\${shape}\`);
                el.style.left = (node.x - b.minX + padding) + 'px';
                el.style.top = (node.y - b.minY + padding) + 'px';
                el.style.width = node.width + 'px';
                el.style.height = node.height + 'px';
                el.style.background = node.color || '#ffffff';
                el.style.fontSize = (node.fontSize || 13) + 'px';
                if (node.textColor) {
                    el.style.color = node.textColor;
                }
                el.style.textAlign = node.textAlign || 'center';
                if (node.codeMode) {
                    el.style.fontFamily = 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace';
                    el.style.background = '#0f172a';
                    el.style.color = node.textColor || '#e0e8ff';
                    el.style.borderColor = '#1f2937';
                }
                el.dataset.id = node.id;

                if (node.content && Array.isArray(node.content)) {
                    node.content.forEach(item => {
                        if (item.type === 'text') {
                            const p = document.createElement('p');
                            p.textContent = item.value;
                            el.appendChild(p);
                        } else if (item.type === 'link') {
                            const p = document.createElement('p');
                            const a = document.createElement('a');
                            a.href = item.url || item.title || '#';
                            a.textContent = item.title || item.url;
                            a.target = '_blank';
                            p.appendChild(a);
                            el.appendChild(p);
                        } else if (item.type === 'image' && item.value) {
                            const img = document.createElement('img');
                            img.src = item.value;
                            const displayWidth = item.displayWidth || item.width;
                            const displayHeight = item.displayHeight || item.height;
                            if (displayWidth) {
                                img.style.width = displayWidth + 'px';
                            } else {
                                img.style.maxWidth = '100%';
                            }
                            if (displayHeight) {
                                img.style.height = displayHeight + 'px';
                            } else {
                                img.style.height = 'auto';
                            }
                            img.style.objectFit = 'contain';
                            el.appendChild(img);
                        }
                    });
                } else {
                    const p = document.createElement('p');
                    p.textContent = node.text || '节点';
                    el.appendChild(p);
                }

                el.addEventListener('dblclick', (evt) => {
                    evt.stopPropagation();
                    const target = nodes.find(n => n.id == node.id);
                    if (target) {
                        showNodeEditor(target, el);
                    }
                });

                el.addEventListener('click', (evt) => {
                    evt.stopPropagation();
                    let connected = false;
                    if (evt.shiftKey) {
                        if (state.pendingConnectFromId !== null && state.pendingConnectFromId !== node.id) {
                            connected = addConnection(state.pendingConnectFromId, node.id);
                            state.pendingConnectFromId = null;
                            state.selectedNodeId = node.id;
                            state.selectedNodeIds = [node.id];
                        } else if (state.selectedNodeId !== null && state.selectedNodeId !== node.id) {
                            connected = addConnection(state.selectedNodeId, node.id);
                            state.pendingConnectFromId = null;
                            state.selectedNodeId = node.id;
                            state.selectedNodeIds = [node.id];
                        } else {
                            state.pendingConnectFromId = node.id;
                        }
                    } else {
                        state.selectedNodeId = node.id;
                        state.selectedNodeIds = [node.id];
                        state.pendingConnectFromId = null;
                    }
                    render();
                    if (connected) pushHistory();
                });

                el.addEventListener('mousedown', (evt) => {
                    evt.stopPropagation();
                    if (state.selectMode) return;
                    state.draggingNodeId = node.id;
                    state.nodeDragMoved = false;
                    state.dragStart = { x: evt.clientX, y: evt.clientY };
                    state.nodeStart = { x: node.x, y: node.y };
                    const selectedSet = new Set(state.selectedNodeIds || []);
                    const inSelection = selectedSet.size && selectedSet.has(node.id);
                    const group = inSelection ? Array.from(selectedSet) : computeSubtree(node.id);
                    state.dragGroupIds = group;
                    state.dragGroupStart = new Map();
                    group.forEach(id => {
                        const n = nodes.find(nn => nn.id == id);
                        if (n) state.dragGroupStart.set(id, { x: n.x, y: n.y });
                    });
                    el.style.cursor = 'grabbing';
                });

                nodesLayer.appendChild(el);
            });
            // 选中态样式
            const selectedSet = new Set(state.selectedNodeIds || (state.selectedNodeId ? [state.selectedNodeId] : []));
            selectedSet.forEach(id => {
                const el = nodesLayer.querySelector('[data-id=\"' + id + '\"]');
                if (el) {
                    el.style.outline = '2px solid #f97316';
                    el.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.25)';
                }
            });
            if (state.pendingConnectFromId !== null) {
                const el = nodesLayer.querySelector('[data-id=\"' + state.pendingConnectFromId + '\"]');
                if (el) {
                    el.style.outline = '2px dashed #22c55e';
                    el.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.25)';
                }
            }
        }

        function render() {
            setStageSize();
            renderNodes();
            renderConnections();
            applyTransform();
            updateColorPicker();
        }

        function fitView() {
            const b = computeBounds();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const scaleX = (vw - 100) / b.width;
            const scaleY = (vh - 140) / b.height;
            const targetScale = Math.min(1.5, Math.max(0.2, Math.min(scaleX, scaleY)));
            state.scale = targetScale;
            state.offsetX = (vw - b.width * targetScale) / 2;
            state.offsetY = (vh - b.height * targetScale) / 2;
            applyTransform();
            pushHistory();
        }

        function resetView() {
            state.scale = meta.zoom || 0.75;
            state.offsetX = meta.panX || 40;
            state.offsetY = meta.panY || 80;
            applyTransform();
            pushHistory();
        }

        function scheduleViewHistory() {
            if (state.viewHistoryTimer) clearTimeout(state.viewHistoryTimer);
            state.viewHistoryTimer = setTimeout(() => {
                state.viewHistoryTimer = null;
                pushHistory();
            }, 200);
        }

        function updateSelectModeUI() {
            const hint = document.getElementById('hint');
            const toggleBtn = document.getElementById('toggleSelect');
            if (state.selectMode) {
                document.body.classList.add('select-mode');
                toggleBtn.classList.add('is-active');
                toggleBtn.textContent = '退出选择';
                hint.textContent = '选择模式：节点文字可框选；背景可拖拽平移';
                viewer.style.cursor = 'default';
            } else {
                document.body.classList.remove('select-mode');
                toggleBtn.classList.remove('is-active');
                toggleBtn.textContent = '选择文本';
                hint.textContent = '拖动节点移动；双击节点编辑；拖拽空白平移，滚轮缩放';
                viewer.style.cursor = 'grab';
            }
        }

        function snapshotData() {
            return {
                nodes: JSON.parse(JSON.stringify(nodes)),
                connections: JSON.parse(JSON.stringify(connections)),
                view: {
                    scale: state.scale,
                    offsetX: state.offsetX,
                    offsetY: state.offsetY
                }
            };
        }

        function updateHistoryButtons() {
            const undoBtn = document.getElementById('undoBtn');
            const redoBtn = document.getElementById('redoBtn');
            undoBtn.disabled = history.index <= 0;
            redoBtn.disabled = history.index >= history.stack.length - 1;
        }

        function pushHistory() {
            const snap = snapshotData();
            if (history.index >= 0) {
                const prev = history.stack[history.index];
                if (JSON.stringify(prev) === JSON.stringify(snap)) return;
            }
            history.stack = history.stack.slice(0, history.index + 1);
            history.stack.push(snap);
            if (history.stack.length > history.limit) {
                history.stack.shift();
            }
            history.index = history.stack.length - 1;
            updateHistoryButtons();
        }

        function applySnapshot(snapshot) {
            nodes.length = 0;
            connections.length = 0;
            snapshot.nodes.forEach(n => nodes.push(n));
            snapshot.connections.forEach(c => connections.push(c));
            if (snapshot.view) {
                state.scale = snapshot.view.scale;
                state.offsetX = snapshot.view.offsetX;
                state.offsetY = snapshot.view.offsetY;
            }
            state.selectedNodeId = null;
            state.selectedNodeIds = [];
            state.pendingConnectFromId = null;
            hideNodeEditor();
            render();
        }

        function undo() {
            if (history.index <= 0) return;
            history.index -= 1;
            applySnapshot(history.stack[history.index]);
            updateHistoryButtons();
        }

        function redo() {
            if (history.index >= history.stack.length - 1) return;
            history.index += 1;
            applySnapshot(history.stack[history.index]);
            updateHistoryButtons();
        }

        function getWorldFromClient(clientX, clientY) {
            const b = computeBounds();
            const worldX = (clientX - state.offsetX) / state.scale + b.minX - padding;
            const worldY = (clientY - state.offsetY) / state.scale + b.minY - padding;
            return { x: worldX, y: worldY };
        }

        function getDefaultInsertWorld() {
            const b = computeBounds();
            return {
                x: (window.innerWidth / 2 - state.offsetX) / state.scale + b.minX - padding,
                y: (window.innerHeight / 2 - state.offsetY) / state.scale + b.minY - padding
            };
        }

        function addNodeAt(worldPos, anchor = 'center') {
            const nodeWidth = 160;
            const nodeHeight = 90;
            let viewCenterX;
            let viewCenterY;
            if (worldPos && anchor === 'topleft') {
                viewCenterX = worldPos.x;
                viewCenterY = worldPos.y;
            } else {
                const center = worldPos || getDefaultInsertWorld();
                viewCenterX = center.x - nodeWidth / 2;
                viewCenterY = center.y - nodeHeight / 2;
            }
            const id = Date.now() + Math.random();
            nodes.push({
                id,
                x: viewCenterX,
                y: viewCenterY,
                width: nodeWidth,
                height: nodeHeight,
                color: '#e8f0fe',
                textColor: '#1f2937',
                fontSize: 13,
                textAlign: 'center',
                content: [{ type: 'text', value: '新节点' }]
            });
            state.selectedNodeId = id;
            state.selectedNodeIds = [id];
            render();
            pushHistory();
        }

        function addNode() {
            const pos = state.lastClickWorld;
            if (pos) {
                addNodeAt(pos, 'topleft');
                return;
            }
            addNodeAt(getDefaultInsertWorld());
        }

        function addNodeFromSelected() {
            const primary = state.selectedNodeId || (state.selectedNodeIds && state.selectedNodeIds[0]);
            if (!primary) {
                addNode();
                return;
            }
            const parent = nodes.find(n => n.id == primary);
            if (!parent) { addNode(); return; }
            const id = Date.now() + Math.random();
            const child = {
                id,
                x: parent.x + parent.width + 80,
                y: parent.y,
                width: 160,
                height: 90,
                color: '#e8f0fe',
                textColor: '#1f2937',
                fontSize: 13,
                textAlign: 'center',
                content: [{ type: 'text', value: '新节点' }]
            };
            nodes.push(child);
            addConnection(parent.id, child.id);
            state.selectedNodeId = child.id;
            state.selectedNodeIds = [child.id];
            render();
            pushHistory();
        }

        function addConnection(fromId, toId) {
            if (!fromId || !toId || fromId === toId) return false;
            connections.push({
                from: { id: fromId },
                to: { id: toId },
                controlOffsetY: 0,
                lineStyle: 'solid',
                lineType: 'curve',
                lineWidth: 2,
                color: '#667eea',
                arrowSize: 20,
                label: '',
                labelFontSize: 12,
                isIndependent: false,
                fromAnchorX: 0.5,
                fromAnchorY: 1,
                toAnchorX: 0.5,
                toAnchorY: 0
            });
            return true;
        }

        function downloadJSON() {
            const payload = JSON.stringify({
                nodes,
                connections,
                meta: {
                    fileName: meta.fileName,
                    zoom: state.scale,
                    panX: state.offsetX,
                    panY: state.offsetY,
                    nightMode: meta.nightMode
                }
            }, null, 2);
            const blob = new Blob([payload], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = (meta.fileName || 'mindmap') + '_editable.json';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 100);
        }

        function getSelectedIds() {
            return state.selectedNodeIds && state.selectedNodeIds.length
                ? state.selectedNodeIds
                : (state.selectedNodeId ? [state.selectedNodeId] : []);
        }

        function updateColorPicker() {
            const colorPicker = document.getElementById('nodeColorPicker');
            const textColorPicker = document.getElementById('nodeTextColorPicker');
            if (!colorPicker || !textColorPicker) return;
            const ids = getSelectedIds();
            const node = ids.length ? nodes.find(n => n.id == ids[0]) : null;
            colorPicker.value = (node && node.color) ? node.color : '#e8f0fe';
            textColorPicker.value = (node && node.textColor) ? node.textColor : '#1f2937';
        }

        function downloadHTML() {
            const root = document.documentElement.cloneNode(true);
            const script = root.querySelector('#export-data');
            if (script) {
                script.textContent = JSON.stringify({
                    nodes,
                    connections,
                    meta: {
                        fileName: meta.fileName,
                        zoom: state.scale,
                        panX: state.offsetX,
                        panY: state.offsetY,
                        nightMode: meta.nightMode
                    }
                }).replace(/</g, '\\\\u003c');
            }
            const html = '<!DOCTYPE html>' + root.outerHTML;
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = (meta.fileName || 'mindmap') + '_editable.html';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 100);
        }

        // Stage pan/zoom
        viewer.addEventListener('contextmenu', (e) => e.preventDefault());
        if (minimap) {
            minimap.addEventListener('click', (e) => {
                if (!minimapTransform) return;
                const rect = minimapCanvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const worldX = (x - minimapTransform.offsetX) / minimapTransform.scale;
                const worldY = (y - minimapTransform.offsetY) / minimapTransform.scale;
                if (!isFinite(worldX) || !isFinite(worldY)) return;
                state.offsetX = (viewer.clientWidth / 2) - worldX * state.scale;
                state.offsetY = (viewer.clientHeight / 2) - worldY * state.scale;
                applyTransform();
                scheduleViewHistory();
            });
            minimap.addEventListener('mouseenter', () => {
                if (!minimapVisible) {
                    minimap.classList.add('visible');
                    minimapVisible = true;
                }
                if (minimapTimer) {
                    clearTimeout(minimapTimer);
                    minimapTimer = null;
                }
            });
            minimap.addEventListener('mouseleave', () => {
                if (minimapVisible) {
                    if (minimapTimer) clearTimeout(minimapTimer);
                    minimapTimer = setTimeout(hideMinimap, 1200);
                }
            });
        }
        viewer.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                state.draggingStage = true;
                state.stageDragMoved = false;
                state.lastX = e.clientX;
                state.lastY = e.clientY;
                viewer.style.cursor = 'grabbing';
                return;
            }
            if (e.button === 0) {
                state.lastPointerDown = { x: e.clientX, y: e.clientY, target: e.target };
            }
            if (state.selectMode && e.target.closest('.node')) {
                return;
            }
            // 左键开始框选
            state.selection.active = true;
            const b = computeBounds();
            state.selection.startX = (e.clientX - state.offsetX) / state.scale;
            state.selection.startY = (e.clientY - state.offsetY) / state.scale;
            state.selection.currentX = state.selection.startX;
            state.selection.currentY = state.selection.startY;
            selectionBox.style.display = 'block';
            selectionBox.style.left = state.selection.startX + 'px';
            selectionBox.style.top = state.selection.startY + 'px';
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';
        });
        window.addEventListener('mouseup', (e) => {
            if (state.selection.active) {
                finalizeSelection();
            }
            if (state.lastPointerDown) {
                const down = state.lastPointerDown;
                const moved = Math.abs(e.clientX - down.x) > 4 || Math.abs(e.clientY - down.y) > 4;
                const isNodeTarget = down.target && down.target.closest && down.target.closest('.node');
                if (!moved && !isNodeTarget) {
                    state.lastClickWorld = getWorldFromClient(down.x, down.y);
                }
            }
            const commitNodeDrag = state.draggingNodeId !== null && state.nodeDragMoved;
            const commitStageDrag = state.draggingStage && state.stageDragMoved;
            state.draggingStage = false;
            state.draggingNodeId = null;
            state.dragGroupIds = [];
            state.dragGroupStart.clear();
            viewer.style.cursor = state.selectMode ? 'default' : 'grab';
            state.lastPointerDown = null;
            if (commitNodeDrag || commitStageDrag) pushHistory();
        });
        window.addEventListener('mousemove', (e) => {
            if (state.draggingNodeId !== null) {
                const dx = (e.clientX - state.dragStart.x) / state.scale;
                const dy = (e.clientY - state.dragStart.y) / state.scale;
                if (dx !== 0 || dy !== 0) {
                    state.nodeDragMoved = true;
                }
                state.dragGroupIds.forEach(id => {
                    const n = nodes.find(nn => nn.id == id);
                    const start = state.dragGroupStart.get(id);
                    if (n && start) {
                        n.x = start.x + dx;
                        n.y = start.y + dy;
                    }
                });
                render();
                return;
            }
            if (state.selection.active) {
                state.selection.currentX = (e.clientX - state.offsetX) / state.scale;
                state.selection.currentY = (e.clientY - state.offsetY) / state.scale;
                updateSelectionBox();
                return;
            }
            if (!state.draggingStage) return;
            const dx = e.clientX - state.lastX;
            const dy = e.clientY - state.lastY;
            if (dx !== 0 || dy !== 0) {
                state.stageDragMoved = true;
            }
            state.offsetX += dx;
            state.offsetY += dy;
            state.lastX = e.clientX;
            state.lastY = e.clientY;
            applyTransform();
        });
        viewer.addEventListener('wheel', (e) => {
            if (e.metaKey) {
                // 按住 Cmd 时左右滑动缩放（上/下滑忽略）
                e.preventDefault();
                if (e.deltaX === 0) return;
                const delta = e.deltaX < 0 ? 0.1 : -0.1;
                const prevScale = state.scale;
                state.scale = Math.min(3, Math.max(0.2, state.scale + delta));
                const rect = viewer.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                state.offsetX = mx - ((mx - state.offsetX) * (state.scale / prevScale));
                state.offsetY = my - ((my - state.offsetY) * (state.scale / prevScale));
                applyTransform();
                scheduleViewHistory();
            } else {
                // 不按 Cmd：滚轮/滑动用于平移画布
                e.preventDefault();
                state.offsetX -= e.deltaX;
                state.offsetY -= e.deltaY;
                applyTransform();
                scheduleViewHistory();
            }
        }, { passive: false });

        document.getElementById('addNodeBtn').addEventListener('click', addNode);
        document.getElementById('downloadJsonBtn').addEventListener('click', downloadJSON);
        document.getElementById('downloadHtmlBtn').addEventListener('click', downloadHTML);
        document.getElementById('resetView').addEventListener('click', resetView);
        document.getElementById('fitView').addEventListener('click', fitView);
        document.getElementById('nodeColorPicker').addEventListener('input', (e) => {
            const ids = getSelectedIds();
            if (!ids.length) return;
            const color = e.target.value;
            nodes.forEach(n => {
                if (ids.includes(n.id)) {
                    n.color = color;
                }
            });
            render();
            pushHistory();
        });
        document.getElementById('nodeTextColorPicker').addEventListener('input', (e) => {
            const ids = getSelectedIds();
            if (!ids.length) return;
            const color = e.target.value;
            nodes.forEach(n => {
                if (ids.includes(n.id)) {
                    n.textColor = color;
                }
            });
            render();
            pushHistory();
        });
        document.getElementById('toggleSelect').addEventListener('click', () => {
            state.selectMode = !state.selectMode;
            updateSelectModeUI();
        });
        document.getElementById('undoBtn').addEventListener('click', undo);
        document.getElementById('redoBtn').addEventListener('click', redo);

        function deleteSelectedNode() {
            const ids = state.selectedNodeIds && state.selectedNodeIds.length ? state.selectedNodeIds : (state.selectedNodeId ? [state.selectedNodeId] : []);
            if (!ids.length) return;
            const toDelete = new Set(ids);
            const stack = [...ids];
            while (stack.length) {
                const current = stack.pop();
                connections.forEach(c => {
                    const fid = c.from && c.from.id;
                    const tid = c.to && c.to.id;
                    if (fid == current && tid != null && !toDelete.has(tid)) {
                        toDelete.add(tid);
                        stack.push(tid);
                    }
                });
            }
            if (toDelete.size > 10) {
                if (!confirm('确定要删除 ' + toDelete.size + ' 个节点及其子节点吗？此操作无法撤销。')) {
                    return;
                }
            }
            for (let i = nodes.length - 1; i >= 0; i--) {
                if (toDelete.has(nodes[i].id)) {
                    nodes.splice(i, 1);
                }
            }
            for (let i = connections.length - 1; i >= 0; i--) {
                const c = connections[i];
                const fid = c.from && c.from.id;
                const tid = c.to && c.to.id;
                if (toDelete.has(fid) || toDelete.has(tid)) {
                    connections.splice(i, 1);
                }
            }
            state.selectedNodeId = null;
            state.selectedNodeIds = [];
            render();
            pushHistory();
        }
        document.getElementById('deleteNodeBtn').addEventListener('click', deleteSelectedNode);
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                deleteSelectedNode();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                addNodeFromSelected();
            }
        });
        window.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                downloadHTML();
            }
        });
        window.addEventListener('keydown', (e) => {
            const active = document.activeElement;
            const isInput = active && (
                active.tagName === 'TEXTAREA' ||
                (active.tagName === 'INPUT' && active.type !== 'checkbox' && active.type !== 'radio') ||
                active.isContentEditable
            );
            if (isInput) return;
            const key = e.key.toLowerCase();
            if ((e.metaKey || e.ctrlKey) && key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if ((e.metaKey || e.ctrlKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
                e.preventDefault();
                redo();
            }
        });

        viewer.addEventListener('dblclick', (e) => {
            if (e.target.closest('.node')) return;
            const world = getWorldFromClient(e.clientX, e.clientY);
            state.lastClickWorld = world;
            addNodeAt(world);
        });

        function computeSubtree(rootId) {
            const visited = new Set();
            const stack = [rootId];
            while (stack.length) {
                const id = stack.pop();
                if (visited.has(id)) continue;
                visited.add(id);
                connections.forEach(c => {
                    const fid = c.from && c.from.id;
                    const tid = c.to && c.to.id;
                    if (fid == id && tid != null && !visited.has(tid)) {
                        stack.push(tid);
                    }
                });
            }
            return Array.from(visited);
        }

        function updateSelectionBox() {
            const x1 = state.selection.startX;
            const y1 = state.selection.startY;
            const x2 = state.selection.currentX;
            const y2 = state.selection.currentY;
            const left = Math.min(x1, x2);
            const top = Math.min(y1, y2);
            const width = Math.abs(x1 - x2);
            const height = Math.abs(y1 - y2);
            selectionBox.style.display = 'block';
            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';
        }

        function finalizeSelection() {
            selectionBox.style.display = 'none';
            state.selection.active = false;
            const x1 = Math.min(state.selection.startX, state.selection.currentX);
            const y1 = Math.min(state.selection.startY, state.selection.currentY);
            const x2 = Math.max(state.selection.startX, state.selection.currentX);
            const y2 = Math.max(state.selection.startY, state.selection.currentY);
            const b = computeBounds();
            const selected = [];
            nodes.forEach(n => {
                const nx = n.x - b.minX + padding;
                const ny = n.y - b.minY + padding;
                const nw = n.width;
                const nh = n.height;
                if (nx + nw >= x1 && nx <= x2 && ny + nh >= y1 && ny <= y2) {
                    selected.push(n.id);
                }
            });
            if (selected.length) {
                state.selectedNodeIds = selected;
                state.selectedNodeId = selected[0];
            } else {
                state.selectedNodeIds = [];
                state.selectedNodeId = null;
            }
            render();
        }

        updateSelectModeUI();
        render();
        fitView();
        pushHistory();
    })();
    </script>
</body>
</html>`;

            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const prefix = this.currentFileName === '未保存' ? 'mindmap' : this.currentFileName;
            link.download = `${prefix}_editable_${Date.now()}.html`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            if (statusBar) {
                statusBar.textContent = '✓ 可编辑HTML导出成功!';
            }
        } catch (error) {
            console.error('[导出可编辑HTML失败]', error);
            alert('导出可编辑HTML失败：' + error.message);
            if (statusBar) {
                statusBar.textContent = '✗ 导出失败';
            }
        } finally {
            setTimeout(() => {
                if (statusBar) statusBar.innerHTML = originalContent;
            }, 3000);
        }
    }

    drawConnectionOnContext(ctx, connection, scale = 1) {
        const fromNode = connection.from;
        const toNode = connection.to;
        const { x1, y1, x2, y2 } = this.getConnectionEndpoints(connection);
        const lineType = this.getConnectionLineType(connection);

        const isNightMode = document.body.classList.contains('night-mode');

        // 使用连接线的实际属性
        const lineColor = connection.color || '#667eea';
        const lineWidth = connection.lineWidth || 2;
        const lineStyle = connection.lineStyle || 'solid';
        const arrowSize = connection.arrowSize || 20;

        ctx.strokeStyle = isNightMode ? invertColor(lineColor) : lineColor;
        ctx.lineWidth = lineWidth;

        // 设置线条样式
        if (lineStyle === 'dashed') {
            ctx.setLineDash([10, 5]);
        } else if (lineStyle === 'dotted') {
            ctx.setLineDash([2, 3]);
        } else {
            ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        let arrowTip = null;
        let arrowRef = null;
        let labelPoint = null;
        let cp1y = null;
        let cp2y = null;

        if (lineType === 'curve') {
            const offset = connection.controlOffsetY || 0;
            cp1y = y1 + (y2 - y1) / 2 + offset;
            cp2y = y2 - (y2 - y1) / 2 + offset;
            ctx.bezierCurveTo(x1, cp1y, x2, cp2y, x2, y2);
            ctx.stroke();

            const pointOnCurve = (t) => {
                const mt = 1 - t;
                const px = mt * mt * mt * x1 +
                           3 * mt * mt * t * x1 +
                           3 * mt * t * t * x2 +
                           t * t * t * x2;
                const py = mt * mt * mt * y1 +
                           3 * mt * mt * t * cp1y +
                           3 * mt * t * t * cp2y +
                           t * t * t * y2;
                return { x: px, y: py };
            };
            arrowTip = pointOnCurve(0.995);
            arrowRef = pointOnCurve(0.985);
            labelPoint = pointOnCurve(0.5);
        } else if (lineType === 'straight') {
            ctx.lineTo(x2, y2);
            ctx.stroke();
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            arrowTip = { x: x2, y: y2 };
            arrowRef = { x: x2 - (dx / len) * 10, y: y2 - (dy / len) * 10 };
            labelPoint = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
        } else if (lineType === 'elbow') {
            const points = this.getElbowPoints(x1, y1, x2, y2);
            points.slice(1).forEach(pt => ctx.lineTo(pt.x, pt.y));
            ctx.stroke();
            const last = points[points.length - 1];
            const prev = points[points.length - 2];
            const dx = last.x - prev.x;
            const dy = last.y - prev.y;
            const len = Math.hypot(dx, dy) || 1;
            arrowTip = { x: last.x, y: last.y };
            arrowRef = { x: last.x - (dx / len) * 10, y: last.y - (dy / len) * 10 };
            labelPoint = this.getPolylineMidpoint(points);
        }

        // 重置线条样式
        ctx.setLineDash([]);

        // 绘制箭头，使用曲线末端切线并贴近节点
        if (!arrowTip || !arrowRef) return;
        const angle = Math.atan2(arrowTip.y - arrowRef.y, arrowTip.x - arrowRef.x);

        ctx.fillStyle = isNightMode ? invertColor(lineColor) : lineColor;
        ctx.beginPath();
        ctx.moveTo(arrowTip.x, arrowTip.y);
        ctx.lineTo(arrowTip.x - arrowSize * Math.cos(angle - Math.PI / 6), arrowTip.y - arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(arrowTip.x - arrowSize * Math.cos(angle + Math.PI / 6), arrowTip.y - arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.fill();
        ctx.strokeStyle = isNightMode ? '#111111' : '#ffffff';
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        ctx.moveTo(arrowTip.x, arrowTip.y);
        ctx.lineTo(arrowTip.x - arrowSize * Math.cos(angle - Math.PI / 6), arrowTip.y - arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(arrowTip.x - arrowSize * Math.cos(angle + Math.PI / 6), arrowTip.y - arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.stroke();

        // 绘制连接线文字（如果有）
        if (connection.label && connection.label.trim() && labelPoint) {
            const midX = labelPoint.x;
            const midY = labelPoint.y;

            // 使用连接线的字体大小，默认为12
            const fontSize = connection.labelFontSize || 12;
            const lineHeight = fontSize * 1.4;

            // 设置文字样式
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // 测量文字宽度
            const textMetrics = ctx.measureText(connection.label);
            const textWidth = textMetrics.width;
            const padding = 4;

            // 绘制文字背景（白色矩形）
            const bgColor = isNightMode ? '#1a1a2e' : '#ffffff';
            ctx.fillStyle = bgColor;
            ctx.fillRect(midX - textWidth / 2 - padding, midY - lineHeight / 2, textWidth + padding * 2, lineHeight);

            // 绘制文字边框
            ctx.strokeStyle = isNightMode ? invertColor(lineColor) : lineColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(midX - textWidth / 2 - padding, midY - lineHeight / 2, textWidth + padding * 2, lineHeight);

            // 绘制文字
            const textColor = isNightMode ? '#e0e0e0' : '#333333';
            ctx.fillStyle = textColor;
            ctx.fillText(connection.label, midX, midY);
        }
    }

    drawNodeOnContext(ctx, node, scale = 1) {
        const isNightMode = document.body.classList.contains('night-mode');
        const nodeColor = isNightMode ? toNightFillColor(node.color) : node.color;
        ctx.fillStyle = nodeColor;
        ctx.strokeStyle = isNightMode ? NIGHT_BORDER_DEFAULT : '#667eea';
        ctx.lineWidth = 2;
        // 使用节点的shape属性，如果没有则默认为rounded-rect（向前兼容）
        const shape = node.shape || 'rounded-rect';
        this.drawNodeShape(ctx, node, shape);
        ctx.fill();
        ctx.stroke();

        const content = node.content || [{type: 'text', value: node.text || ''}];
        const fontSize = node.fontSize || 13;
        const lineHeight = fontSize * 1.3;
        const textAlign = node.textAlign || 'center';
        const rawTextColor = node.textColor || '#333';
        const baseTextColor = isNightMode ? invertColor(rawTextColor) : rawTextColor;

        // 先计算总内容高度，以便垂直居中
        let totalContentHeight = 0;
        let hasImage = false;

        content.forEach((item, index) => {
            if (item.type === 'image') {
                hasImage = true;
                const maxWidth = node.width - 20;
                const maxHeight = 300;
                let displayHeight = item.height;
                if (item.width > maxWidth || item.height > maxHeight) {
                    const ratio = Math.min(maxWidth / item.width, maxHeight / item.height);
                    displayHeight = item.height * ratio;
                }
                totalContentHeight += displayHeight;
                if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
            } else if (item.type === 'text') {
                ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
                const lines = this.wrapText(item.value, node.width - this.NODE_HORIZONTAL_PADDING, ctx);
                totalContentHeight += lines.length * lineHeight;
                if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
            } else if (item.type === 'link') {
                // 链接类型：标题（粗体）+ URL
                ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
                const titleLines = this.wrapText(item.title || item.url, node.width - this.NODE_HORIZONTAL_PADDING, ctx);
                ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
                totalContentHeight += titleLines.length * lineHeight;
                totalContentHeight += lineHeight * 0.8;
                if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
            } else if (item.type === 'pending_link') {
                ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
                const lines = this.wrapText(item.value || item.url, node.width - this.NODE_HORIZONTAL_PADDING, ctx);
                totalContentHeight += lines.length * lineHeight;
                if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
            }
        });

        // 计算起始Y位置，使内容垂直居中
        let currentY = node.y + (node.height - totalContentHeight) / 2;

        // 按顺序绘制内容
        content.forEach((item, index) => {
            // 在非第一项之前添加间隙
            if (index > 0) {
                currentY += this.IMAGE_TEXT_GAP;
            }

            if (item.type === 'text') {
                ctx.fillStyle = baseTextColor;
                ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
                ctx.textAlign = textAlign;
                ctx.textBaseline = 'top';

                const lines = this.wrapText(item.value, node.width - this.NODE_HORIZONTAL_PADDING, ctx);

                lines.forEach((line, lineIndex) => {
                    let textX;
                    if (textAlign === 'left') {
                        textX = node.x + 5;
                    } else if (textAlign === 'right') {
                        textX = node.x + node.width - 5;
                    } else {
                        textX = node.x + node.width / 2;
                    }
                    ctx.fillText(line, textX, currentY);
                    currentY += lineHeight;
                });

            } else if (item.type === 'image') {
                try {
                    const img = this.imageCache.get(item.value);
                    if (img && img.complete && img.naturalWidth > 0) {
                        const displayWidth = item.displayWidth || item.width;
                        const displayHeight = item.displayHeight || item.height;
                        const imgX = node.x + (node.width - displayWidth) / 2;
                        ctx.drawImage(img, imgX, currentY, displayWidth, displayHeight);
                        currentY += displayHeight;
                    } else {
                        const displayWidth = item.displayWidth || item.width || 100;
                        const displayHeight = item.displayHeight || item.height || 100;
                        const imgX = node.x + (node.width - displayWidth) / 2;
                        ctx.fillStyle = '#f0f0f0';
                        ctx.fillRect(imgX, currentY, displayWidth, displayHeight);
                        currentY += displayHeight;
                        console.warn('[Export Draw] Image not found in cache or not loaded:', item.value);
                    }
                } catch (e) {
                    console.error('error drawing image on context', e);
                }
            } else if (item.type === 'link') {
                // 绘制链接：标题（粗体）+ URL（小号链接颜色）
                ctx.textAlign = textAlign;
                ctx.textBaseline = 'top';

                // 绘制标题（粗体）
                ctx.fillStyle = baseTextColor;
                ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
                const titleLines = this.wrapText(item.title || item.url, node.width - this.NODE_HORIZONTAL_PADDING, ctx);
                titleLines.forEach(line => {
                    let textX;
                    if (textAlign === 'left') {
                        textX = node.x + 5;
                    } else if (textAlign === 'right') {
                        textX = node.x + node.width - 5;
                    } else {
                        textX = node.x + node.width / 2;
                    }
                    ctx.fillText(line, textX, currentY);
                    currentY += lineHeight;
                });

                // 绘制URL（小号，链接颜色）
                const linkColor = isNightMode ? NIGHT_BORDER_DEFAULT : '#667eea';
                ctx.fillStyle = linkColor;
                ctx.font = `${Math.max(fontSize * 0.75, 10)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

                // 截断URL以适应宽度
                let displayUrl = item.url;
                try {
                    const urlObj = new URL(item.url);
                    displayUrl = urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname.substring(0, 20) + '...' : '');
                } catch (e) {
                    if (displayUrl.length > 30) {
                        displayUrl = displayUrl.substring(0, 30) + '...';
                    }
                }

                let textX;
                if (textAlign === 'left') {
                    textX = node.x + 5;
                } else if (textAlign === 'right') {
                    textX = node.x + node.width - 5;
                } else {
                    textX = node.x + node.width / 2;
                }
                ctx.fillText(displayUrl, textX, currentY);
                currentY += lineHeight * 0.8;
            } else if (item.type === 'pending_link') {
                // 待处理的链接，暂时显示为普通文本
                ctx.fillStyle = baseTextColor;
                ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
                ctx.textAlign = textAlign;
                ctx.textBaseline = 'top';

                const lines = this.wrapText(item.value || item.url, node.width - this.NODE_HORIZONTAL_PADDING, ctx);
                lines.forEach(line => {
                    let textX;
                    if (textAlign === 'left') {
                        textX = node.x + 5;
                    } else if (textAlign === 'right') {
                        textX = node.x + node.width - 5;
                    } else {
                        textX = node.x + node.width / 2;
                    }
                    ctx.fillText(line, textX, currentY);
                    currentY += lineHeight;
                });
            }
        });

        // 绘制节点标签（导出时仅显示已设置的标签）
        this.drawNodeTag(ctx, node, isNightMode, false);
    }

    _updateImageOverlays() {
        // Mark all existing overlays as potentially unused
        const unusedIds = new Set(this.imageOverlays.keys());

        this.nodes.forEach(node => {
            const imageItem = node.content && node.content.find(item => item.type === 'image');
            const isGif = imageItem && imageItem.value && imageItem.value.startsWith('data:image/gif');

            if (!isGif) {
                // If a node previously had a GIF but no longer does, it will be caught in the unusedIds cleanup
                return;
            }

            // Check if node is in viewport (rough check)
            const nodeScreenX = node.x * this.zoom + this.panX;
            const nodeScreenY = node.y * this.zoom + this.panY;
            const nodeScreenWidth = node.width * this.zoom;
            const nodeScreenHeight = node.height * this.zoom;

            if (nodeScreenX + nodeScreenWidth < 0 || nodeScreenX > this.canvas.width ||
                nodeScreenY + nodeScreenHeight < 0 || nodeScreenY > this.canvas.height) {
                // Node is off-screen, hide its overlay if it exists
                const existingOverlay = this.imageOverlays.get(node.id);
                if (existingOverlay) {
                    existingOverlay.style.display = 'none';
                }
                unusedIds.delete(node.id); // It's off-screen, but don't delete it.
                return;
            }

            // Node is a visible GIF, get or create its overlay
            let imgElement = this.imageOverlays.get(node.id);
            if (!imgElement) {
                imgElement = new Image();
                imgElement.style.position = 'absolute';
                imgElement.style.pointerEvents = 'none'; // Clicks should go through to the canvas
                imgElement.style.borderRadius = '4px'; // Match node style
                this.canvasContainer.appendChild(imgElement);
                this.imageOverlays.set(node.id, imgElement);
            }
            
            if (imgElement.src !== imageItem.value) {
                imgElement.src = imageItem.value;
            }

            // Update overlay style and position
            imgElement.style.display = 'block';

            const displayWidth = (imageItem.displayWidth || imageItem.width) * this.zoom;
            const displayHeight = (imageItem.displayHeight || imageItem.height) * this.zoom;
            
            let totalContentHeight = 0;
            const fontSize = node.fontSize || 13;
            const lineHeight = fontSize * (node.codeMode ? 1.35 : 1.3);
            this.ctx.font = `${fontSize}px ${node.codeMode ? this.codeFontStack : 'sans-serif'}`;

            node.content.forEach((item, index) => {
                if (index > 0) totalContentHeight += this.IMAGE_TEXT_GAP;
                if (item.type === 'image') {
                    totalContentHeight += item.displayHeight || item.height || 100;
                } else if (item.type === 'text' || item.type === 'pending_link') {
                    const lines = this.wrapText(item.value || item.url || '', node.width - this.NODE_HORIZONTAL_PADDING, this.ctx);
                    totalContentHeight += lines.length * lineHeight;
                } else if (item.type === 'link') {
                    this.ctx.font = `bold ${fontSize}px sans-serif`;
                    const titleLines = this.wrapText(item.title || item.url, node.width - this.NODE_HORIZONTAL_PADDING, this.ctx);
                    this.ctx.font = `${fontSize}px sans-serif`;
                    totalContentHeight += titleLines.length * lineHeight + (lineHeight * 0.8);
                }
            });
            
            let currentY = node.y + (node.height - totalContentHeight) / 2;

            for (const item of node.content) {
                if (item === imageItem) {
                    break;
                }
                if (node.content.indexOf(item) > 0) currentY += this.IMAGE_TEXT_GAP;

                if (item.type === 'image') {
                    currentY += item.displayHeight || item.height || 100;
                } else if (item.type === 'text' || item.type === 'pending_link') {
                     const lines = this.wrapText(item.value || item.url || '', node.width - this.NODE_HORIZONTAL_PADDING, this.ctx);
                    currentY += lines.length * lineHeight;
                } else if (item.type === 'link') {
                    this.ctx.font = `bold ${fontSize}px sans-serif`;
                    const titleLines = this.wrapText(item.title || item.url, node.width - this.NODE_HORIZONTAL_PADDING, this.ctx);
                    this.ctx.font = `${fontSize}px sans-serif`;
                    currentY += titleLines.length * lineHeight + (lineHeight * 0.8);
                }
            }

            const imgScreenX = (node.x + (node.width - (imageItem.displayWidth || imageItem.width)) / 2) * this.zoom + this.panX;
            const imgScreenY = currentY * this.zoom + this.panY;
            
            imgElement.style.left = `${imgScreenX}px`;
            imgElement.style.top = `${imgScreenY}px`;
            imgElement.style.width = `${displayWidth}px`;
            imgElement.style.height = `${displayHeight}px`;

            unusedIds.delete(node.id);
        });

        unusedIds.forEach(id => {
            const overlay = this.imageOverlays.get(id);
            if (overlay) {
                overlay.remove();
                this.imageOverlays.delete(id);
            }
        });
    }

    animate() {
        // 如果有框选矩形显示，需要持续重绘
        if (this.showSelectionBox) {
            this.draw();
        }
        requestAnimationFrame(() => this.animate());
    }
}

// 全局函数
function closeSaveModal() {
    document.getElementById('saveModal').classList.remove('active');
}

function closeExtractToPageModal() {
    document.getElementById('extractToPageModal').classList.remove('active');
}

function confirmExtractToPage() {
    const input = document.getElementById('extractPageName');
    const pageName = input ? input.value.trim() : '';

    if (!pageName) {
        alert('请输入页面名称');
        return;
    }

    // 检查页面名称是否已存在
    const namespace = AppState.namespaceManager ? AppState.namespaceManager.getCurrentNamespace() : 'default';
    const pageKey = `mindmap_${namespace}_${pageName}`;
    if (localStorage.getItem(pageKey)) {
        if (!confirm(`页面 "${pageName}" 已存在，是否覆盖？`)) {
            return;
        }
    }

    // 获取当前活跃的 app 实例并执行提取操作
    const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
    if (activeApp && activeApp.extractNodesToNewPage) {
        activeApp.extractNodesToNewPage(pageName);
    }

    closeExtractToPageModal();
}

function closeFileManagerModal() {
    document.getElementById('fileManagerModal').classList.remove('active');
}

// 图片查看器状态
let imageViewerState = {
    zoom: 1,
    minZoom: 0.1,
    maxZoom: 5,
    isResizing: false,
    resizeStartX: 0,
    resizeStartY: 0,
    startWidth: 0,
    startHeight: 0,
    panX: 0,
    panY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
};

function closeImageViewer() {
    const modal = document.getElementById('imageViewerModal');
    if (modal) {
        modal.classList.remove('active');
    }
    // 重置缩放
    imageViewerState.zoom = 1;
    imageViewerState.panX = 0;
    imageViewerState.panY = 0;
    updateImageZoom();
}

function zoomImage(delta) {
    imageViewerState.zoom = Math.max(
        imageViewerState.minZoom,
        Math.min(imageViewerState.maxZoom, imageViewerState.zoom + delta)
    );
    updateImageZoom();
}

function resetImageZoom() {
    imageViewerState.zoom = 1;
    imageViewerState.panX = 0;
    imageViewerState.panY = 0;
    updateImageZoom();
}

function updateImageZoom() {
    const img = document.getElementById('largeImageView');
    const zoomLabel = document.getElementById('imageZoomLevel');
    if (img) {
        img.style.transform = `translate(${imageViewerState.panX}px, ${imageViewerState.panY}px) scale(${imageViewerState.zoom})`;
    }
    if (zoomLabel) {
        zoomLabel.textContent = `${Math.round(imageViewerState.zoom * 100)}%`;
    }
}

// 初始化图片查看器的拖拽调整大小功能
function initImageViewerResize() {
    const content = document.getElementById('imageViewerContent');
    const handle = content ? content.querySelector('.image-viewer-resize-handle') : null;
    
    if (!handle || !content) return;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        imageViewerState.isResizing = true;
        imageViewerState.resizeStartX = e.clientX;
        imageViewerState.resizeStartY = e.clientY;
        imageViewerState.startWidth = content.offsetWidth;
        imageViewerState.startHeight = content.offsetHeight;
        
        document.addEventListener('mousemove', handleImageViewerResize);
        document.addEventListener('mouseup', stopImageViewerResize);
    });
}

function handleImageViewerResize(e) {
    if (!imageViewerState.isResizing) return;
    
    const content = document.getElementById('imageViewerContent');
    if (!content) return;

    const deltaX = e.clientX - imageViewerState.resizeStartX;
    const deltaY = e.clientY - imageViewerState.resizeStartY;

    const newWidth = Math.max(300, Math.min(window.innerWidth * 0.95, imageViewerState.startWidth + deltaX));
    const newHeight = Math.max(200, Math.min(window.innerHeight * 0.95, imageViewerState.startHeight + deltaY));

    content.style.width = `${newWidth}px`;
    content.style.height = `${newHeight}px`;
}

function stopImageViewerResize() {
    imageViewerState.isResizing = false;
    document.removeEventListener('mousemove', handleImageViewerResize);
    document.removeEventListener('mouseup', stopImageViewerResize);
}

// 在 DOM 加载完成后初始化图片查看器
document.addEventListener('DOMContentLoaded', () => {
    initImageViewerResize();
    
    // 添加滚轮缩放和拖动支持
    const container = document.getElementById('imageViewerContainer');
    const img = document.getElementById('largeImageView');
    if (container && img) {
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            // metaKey for Cmd on Mac, ctrlKey for a more general approach
            if (e.metaKey || e.ctrlKey) {
                if (e.deltaX !== 0) { // Only zoom on horizontal scroll
                    const delta = e.deltaX > 0 ? -0.1 : 0.1;
                    zoomImage(delta);
                }
            } else {
                imageViewerState.panX -= e.deltaX;
                imageViewerState.panY -= e.deltaY;
                updateImageZoom();
            }
        });

        const handleMouseMove = (e) => {
            if (!imageViewerState.isPanning) return;
            e.preventDefault();
            imageViewerState.panX = e.clientX - imageViewerState.panStartX;
            imageViewerState.panY = e.clientY - imageViewerState.panStartY;
            updateImageZoom();
        };

        const handleMouseUp = (e) => {
            if (!imageViewerState.isPanning) return;
            e.preventDefault();
            imageViewerState.isPanning = false;
            container.style.cursor = 'grab';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        container.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            imageViewerState.isPanning = true;
            imageViewerState.panStartX = e.clientX - imageViewerState.panX;
            imageViewerState.panStartY = e.clientY - imageViewerState.panY;
            container.style.cursor = 'grabbing';
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        let initialZoom = 1;
        img.addEventListener('gesturestart', (e) => {
            e.preventDefault();
            initialZoom = imageViewerState.zoom;
        });

        img.addEventListener('gesturechange', (e) => {
            e.preventDefault();
            const newZoom = initialZoom * e.scale;
            imageViewerState.zoom = Math.max(
                imageViewerState.minZoom,
                Math.min(imageViewerState.maxZoom, newZoom)
            );
            updateImageZoom();
        });
    }
});

function confirmSave() {
    try {
        const fileNameInput = document.getElementById('saveFileName');
        let filename = fileNameInput ? fileNameInput.value.trim() : '';

        if (!filename) {
            filename = 'mindmap_' + new Date().getTime();
        }

        // 保存文件到当前活跃的app
        const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
        if (activeApp && activeApp.saveFile) {
            activeApp.saveFile(filename);
        }

        // 重置输入框
        if (fileNameInput) {
            fileNameInput.value = 'mindmap';
        }

        // 关闭弹窗 - 使用 setTimeout 确保 DOM 更新
        setTimeout(() => {
            const modal = document.getElementById('saveModal');
            if (modal) {
                modal.classList.remove('active');
            }
        }, 0);

    } catch(e) {
        console.error('保存失败:', e);
        // 即使出错也强制关闭弹窗
        const modal = document.getElementById('saveModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }
}

// 启动应用 - 双屏模式
let modeController;
document.addEventListener('DOMContentLoaded', function() {
    try {
        console.log('[初始化] 开始初始化应用...');
        
        // 先初始化命名空间管理器
        console.log('[初始化] 创建 NamespaceManager...');
        AppState.namespaceManager = new NamespaceManager();
        console.log('[初始化] NamespaceManager 创建成功');

        // 初始化快捷方式管理器
        shortcutManager = new ShortcutManager();

        // 然后初始化其他组件
        console.log('[初始化] 创建 ModeController...');
        modeController = new ModeController();
        console.log('[初始化] ModeController 创建成功');
        
        console.log('[初始化] 创建 MindMapApp(left)...');
        AppState.appLeft = new MindMapApp('left');
        console.log('[初始化] MindMapApp(left) 创建成功');
        
        console.log('[初始化] 创建 MindMapApp(right)...');
        AppState.appRight = new MindMapApp('right');
        console.log('[初始化] MindMapApp(right) 创建成功');

        if (shortcutManager) {
            const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
            if (activeApp) {
                shortcutManager.setActiveFile(activeApp.currentFileName);
            }
        }

        // 立即标记初始化完成，因为初始化加载不会阻止用户操作
        AppState.isInitializing = false;
        console.log('[初始化] isInitializing 设置为 false（允许用户操作）');

        // 显示加载指示器
        const loadingIndicator = document.getElementById('fileListLoadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'block';
            console.log('[初始化] 显示文件列表加载指示器');
        }

        // 强制渲染文件列表（确保文件列表元素存在）
        console.log('[初始化] 渲染文件列表...');
        const initialActiveApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
        if (initialActiveApp) {
            const searchInput = document.getElementById('fileSearchInput');
            const searchTerm = searchInput ? searchInput.value : '';
            initialActiveApp.updateSidebarFileList(searchTerm);
            console.log('[初始化] 文件列表渲染完成');
        }

        // 立即隐藏文件列表加载指示器（不影响用户操作）
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
            console.log('[初始化] 立即隐藏文件列表加载指示器');
        }

        // 设置文件列表点击事件委托（修复Safari兼容性问题）
        console.log('[初始化] 设置文件列表事件委托...');
        const fileListContainer = document.getElementById('fileListSidebar');
        if (fileListContainer) {
            fileListContainer.addEventListener('click', function(e) {
                let target = e.target;
                // 向上查找文件列表项元素
                while (target && target !== fileListContainer) {
                    if (target.classList && target.classList.contains('file-list-item')) {
                        const filename = target.getAttribute('data-filename');
                        if (filename) {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('[文件列表委托] 点击文件:', filename);

                            // 文件列表在左侧sidebar中，应该使用当前活跃屏幕的app
                            const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;

                            console.log('[文件列表委托] activeScreen:', AppState.activeScreen);
                            console.log('[文件列表委托] activeApp:', activeApp ? 'exists' : 'null');
                            console.log('[文件列表委托] isInitializing:', AppState.isInitializing);
                            console.log('[文件列表委托] isLoadingFile:', activeApp ? activeApp.isLoadingFile : 'N/A');

                            if (!activeApp) {
                                console.error('[文件列表委托] activeApp is null!');
                                return;
                            }

                            // 检查应用是否正在加载文件
                            if (activeApp.isLoadingFile) {
                                // 显示提示信息
                                const statusBar = document.querySelector('.status-bar .coordinates');
                                if (statusBar) {
                                    const originalContent = statusBar.innerHTML;
                                    statusBar.textContent = '⏳ 正在加载文件，请稍候...';
                                    statusBar.style.color = '#ff9800';
                                    setTimeout(function() {
                                        statusBar.innerHTML = originalContent;
                                        statusBar.style.color = '';
                                    }, 1500);
                                }
                                console.log('[文件列表委托] 文件正在加载中，跳过本次点击');
                                return;
                            }

                            console.log('[文件列表委托] 调用 loadFile:', filename);
                            activeApp.loadFile(filename);
                            const searchInput = document.getElementById('fileSearchInput');
                            activeApp.updateSidebarFileList(searchInput ? searchInput.value : '');
                        }
                        break;
                    }
                    target = target.parentElement;
                }
            }, true);
            console.log('[初始化] 文件列表事件委托设置成功');
        }

        // 刷新页面时同步服务器数据并更新文件列表
        const refreshFileLists = () => {
            const activeApp = AppState.activeScreen === 'left' ? AppState.appLeft : AppState.appRight;
            if (!activeApp) return;
            const searchInput = document.getElementById('fileSearchInput');
            const searchTerm = searchInput ? searchInput.value : '';
            activeApp.updateSidebarFileList(searchTerm);

            const managerSearchInput = document.getElementById('fileManagerSearchInput');
            const managerSearchTerm = managerSearchInput ? managerSearchInput.value : '';
            activeApp.updateFileManagerList(managerSearchTerm);
        };

        if (window.storageAdapter && typeof window.storageAdapter.refreshFromServer === 'function') {
            window.storageAdapter.refreshFromServer({ allowDeleteLocal: true })
                .then(refreshFileLists)
                .catch(refreshFileLists);
        } else {
            refreshFileLists();
        }

        // 在两个app都完全初始化后，应用保存的全屏显示状态
        // 使用多次requestAnimationFrame确保DOM完全更新
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                try {
                    modeController.applyInitialState();
                    console.log('[初始化] 完成!');

                    // 隐藏页面加载指示器
                    var loadingOverlay = document.getElementById('loadingOverlay');
                    if (loadingOverlay) {
                        loadingOverlay.style.opacity = '0';
                        loadingOverlay.style.transition = 'opacity 0.3s ease';
                        setTimeout(function() {
                            loadingOverlay.style.display = 'none';
                        }, 300);
                    }
                } catch (e) {
                    console.error('[初始化] applyInitialState 错误:', e);
                    // 即使出错也隐藏页面加载指示器
                    var loadingOverlay = document.getElementById('loadingOverlay');
                    if (loadingOverlay) {
                        loadingOverlay.style.display = 'none';
                    }
                }
            });
        });
    } catch (e) {
        console.error('[初始化] 严重错误:', e);
        // 隐藏页面加载指示器
        var loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
        alert('应用初始化失败: ' + e.message + '\n\n请刷新页面重试，或查看控制台获取详细错误信息。');
    }
});

function closePasswordModal() {
    if (AppState.namespaceManager) {
        // 用户点击取消时，切换到默认空间（如果当前空间是加密的且没有密码）
        AppState.namespaceManager.closePasswordModal(true);
    }
}

function confirmPassword() {
    if (AppState.namespaceManager) {
        AppState.namespaceManager.confirmPassword();
    }
}
