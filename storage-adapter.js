// 存储适配器 - 智能同步（解决 localStorage quota：大数据写入自动转存到服务器）
class StorageAdapter {
    constructor() {
        this.PLACEHOLDER_PREFIX = '__server__:'; // localStorage中的占位符前缀
        this.syncInterval = 2000;
        this.recentlyModified = new Map(); // 最近修改的键（避免被服务器覆盖）
        this.pendingSyncTimers = new Map(); // key -> timeoutId（节流服务器写入）
        this.serverCache = {}; // key -> string value（真实数据）

        this._originalSetItem = localStorage.setItem.bind(localStorage);
        this._originalGetItem = localStorage.getItem.bind(localStorage);
        this._originalRemoveItem = localStorage.removeItem.bind(localStorage);

        // 关键：同步读取服务器数据，保证 app.js 初始化时就能读取到真实内容（即使本地只有占位符）
        this.useServerStorage = this.bootstrapFromServerSync();

        // 先把localStorage接口劫持起来（后续写入可自动转存，避免再次触发quota）
        this.hijackLocalStorage();

        if (this.useServerStorage) {
            // 先迁移本地大条目到服务器（避免"服务器空 -> 删除本地"的风险）
            this.migrateLocalMindmapDataToServer();
            // 主动清理 localStorage 空间（删除已备份到服务器的数据）
            this.tryFreeLocalStorageSpace();
            // 再把服务器已有数据映射为本地占位符（用于文件列表枚举；首次不做删除同步）
            this.syncFromServer(this.serverCache, { allowDeleteLocal: false });
            console.log('✓ 服务器已连接（已启用大数据转存）');
            this.startSync();
            // 页面卸载前强制同步所有待同步数据
            this.setupBeforeUnloadSync();
        } else {
            console.log('⚠️ 未连接到服务器，使用本地localStorage（可能受5MB限制）');
            // 清理孤立占位符：服务器不可用时，占位符毫无用处，只会浪费 localStorage 空间
            this.cleanOrphanedPlaceholders();
            // 显示警告
            this.showServerWarning();
        }
    }

    // 服务器不可用时，清理无法读取的占位符，释放 localStorage 空间
    cleanOrphanedPlaceholders() {
        var removedCount = 0;
        try {
            for (var i = localStorage.length - 1; i >= 0; i--) {
                var key = localStorage.key(i);
                if (!key) continue;
                var val = this._originalGetItem(key);
                if (val && this.isPlaceholder(val)) {
                    console.warn('[StorageAdapter] 清理孤立占位符:', key);
                    this._originalRemoveItem(key);
                    removedCount++;
                }
            }
        } catch (e) {}
        if (removedCount > 0) {
            console.log('[StorageAdapter] 已清理', removedCount, '个孤立占位符');
        }
    }

    // 服务器不可用时显示警告
    showServerWarning() {
        setTimeout(function() {
            var bar = document.querySelector('.status-bar .coordinates');
            if (bar) {
                bar.innerHTML = '<span style="color:#f44336">⚠️ 服务器未连接，保存功能受限！请先启动服务器 (node server.js)</span>';
                setTimeout(function() {
                    bar.innerHTML = '坐标: <span id="coordX">0</span>, <span id="coordY">0</span>';
                }, 8000);
            }
        }, 1000);
    }
    
    // 页面卸载前同步
    setupBeforeUnloadSync() {
        var self = this;
        
        // 使用 visibilitychange 事件（更可靠）
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'hidden') {
                self.flushPendingSync();
            }
        });
        
        // 也监听 pagehide（Safari 更好支持）
        window.addEventListener('pagehide', function() {
            self.flushPendingSync();
        });
        
        // 备用：beforeunload
        window.addEventListener('beforeunload', function() {
            self.flushPendingSync();
        });
    }
    
    // 立即同步所有待同步数据
    flushPendingSync() {
        var self = this;
        
        // 收集所有待同步的键
        var keysToSync = [];
        this.pendingSyncTimers.forEach(function(timer, key) {
            clearTimeout(timer);
            keysToSync.push(key);
        });
        this.pendingSyncTimers.clear();
        
        // 使用 sendBeacon 发送（更可靠）
        for (var i = 0; i < keysToSync.length; i++) {
            var key = keysToSync[i];
            var value = this.serverCache[key];
            if (value) {
                try {
                    if (navigator.sendBeacon) {
                        // 使用 sendBeacon（推荐）
                        var blob = new Blob([JSON.stringify({ value: value })], { type: 'application/json' });
                        var success = navigator.sendBeacon('/api/storage/' + encodeURIComponent(key), blob);
                        console.log('[StorageAdapter] sendBeacon 同步:', key, success ? '成功' : '失败');
                    } else {
                        // 回退到同步 XHR
                        var xhr = new XMLHttpRequest();
                        xhr.open('PUT', '/api/storage/' + encodeURIComponent(key), false);
                        xhr.setRequestHeader('Content-Type', 'application/json');
                        xhr.send(JSON.stringify({ value: value }));
                        console.log('[StorageAdapter] XHR 同步:', key);
                    }
                } catch (e) {
                    console.error('[StorageAdapter] 卸载同步失败:', key, e);
                }
            }
        }
    }

    bootstrapFromServerSync() {
        try {
            console.log('[StorageAdapter] 开始同步获取服务器数据...');
            var startTime = Date.now();
            var xhr = new XMLHttpRequest();
            xhr.open('GET', '/api/storage', false); // sync
            xhr.send(null);
            var requestTime = Date.now() - startTime;
            console.log('[StorageAdapter] 请求完成，耗时:', requestTime, 'ms, 状态:', xhr.status);
            
            if (xhr.status >= 200 && xhr.status < 300) {
                var text = xhr.responseText || '{}';
                console.log('[StorageAdapter] 响应数据大小:', text.length, '字符');
                
                var parseStart = Date.now();
                this.serverCache = JSON.parse(text);
                var parseTime = Date.now() - parseStart;
                console.log('[StorageAdapter] JSON解析完成，耗时:', parseTime, 'ms, 键数量:', Object.keys(this.serverCache).length);
                return true;
            }
        } catch (e) {
            console.error('[StorageAdapter] 同步获取失败:', e);
        }
        this.serverCache = {};
        return false;
    }

    isSessionKey(key) {
        // 仅保留真正的“本地会话”键，不参与服务器同步
        return key === 'mindmap_current_namespace';
    }

    isPlaceholder(value) {
        if (typeof value !== 'string') return false;
        // 检查是否以占位符前缀开头
        var result = value.indexOf(this.PLACEHOLDER_PREFIX) === 0;
        return result;
    }

    // 判断是否为脑图"大数据"（包含nodes/connections），用于转存到服务器以规避localStorage 5MB限制
    isMindmapData(key, value) {
        if (!key || typeof key !== 'string') return false;
        if (key.indexOf('mindmap_') !== 0) return false;
        if (key.indexOf('_filename') === key.length - 9 && key.length >= 9) return false;
        if (key === 'mindmap_namespaces') return false; // 命名空间列表很小，保留本地即可
        if (typeof value !== 'string') return false;
        // 快速特征检测，避免JSON.parse带来的开销
        return value.indexOf('"nodes"') !== -1 && value.indexOf('"connections"') !== -1;
    }

    makePlaceholder(value) {
        var size = typeof value === 'string' ? value.length : 0;
        return this.PLACEHOLDER_PREFIX + Date.now() + ':' + size;
    }

    extractTimestamp(value) {
        if (typeof value !== 'string') return 0;
        var m = value.match(/"timestamp"\s*:\s*"([^"]+)"/);
        if (!m) return 0;
        var t = Date.parse(m[1]);
        return Number.isFinite(t) ? t : 0;
    }

    // 从服务器同步数据：对"大数据"写占位符，对小数据可直接写入localStorage
    syncFromServer(serverData, options) {
        options = options || {};
        var now = Date.now();
        var allowDeleteLocal = options.allowDeleteLocal !== false;
        var data = serverData || {};

        // 1. 合并/添加服务器数据
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var value = data[key];
            
            if (this.isSessionKey(key)) continue;
            if (typeof value === 'string' && value.indexOf('function') === 0) continue;

            // 最近修改的，跳过覆盖（包括 serverCache！避免本地新数据被旧服务器数据覆盖）
            var modTime = this.recentlyModified.get(key);
            if (modTime && now - modTime < 5000) continue;

            // 更新内存缓存（真实数据）—— 必须在 recentlyModified 检查之后！
            this.serverCache[key] = value;

            var localValue = this._originalGetItem(key);
            var isBigMindmap = this.isMindmapData(key, value);

            if (isBigMindmap) {
                // 本地已有数据（真实数据或占位符）则不覆盖，避免丢失本地保存的真实数据
                // 仅在本地没有任何数据时，尝试写入真实数据（优先）或占位符（空间不足时）
                if (localValue === null) {
                    try {
                        this._originalSetItem(key, value);
                    } catch (e) {
                        try {
                            this._originalSetItem(key, this.makePlaceholder(value));
                        } catch (e2) {
                            // 忽略：localStorage被禁用或已满（真实数据已在serverCache+服务器）
                        }
                    }
                }
            } else {
                // 小数据：保持原行为（写入localStorage，便于页面早期脚本读取）
                if (localValue === null || localValue !== value) {
                    try {
                        this._originalSetItem(key, value);
                    } catch (e) {}
                }
            }
        }

        // 2. 删除服务器上没有的本地数据（仅对"脑图大数据/占位符"做删除同步，避免误删配置键）
        // 注意：不删除 serverCache 中存在但服务器上不存在的数据（这些可能是待同步的新数据）
        if (allowDeleteLocal) {
            for (var j = localStorage.length - 1; j >= 0; j--) {
                var delKey = localStorage.key(j);
                if (!delKey || delKey.indexOf('mindmap_') !== 0) continue;
                if (this.isSessionKey(delKey)) continue;

                // 如果 serverCache 中有这个键，说明可能是待同步的新数据，不删除
                if (Object.prototype.hasOwnProperty.call(this.serverCache, delKey)) {
                    continue;
                }

                var delModTime = this.recentlyModified.get(delKey);
                if (delModTime && now - delModTime < 5000) continue;

                var delLocalValue = this._originalGetItem(delKey);
                var isMindmapBig = this.isPlaceholder(delLocalValue) ||
                    this.isMindmapData(delKey, delLocalValue) ||
                    this.isMindmapData(delKey, data[delKey]);
                if (!isMindmapBig) continue;

                if (!Object.prototype.hasOwnProperty.call(data, delKey)) {
                    try {
                        this._originalRemoveItem(delKey);
                    } catch (e) {}
                    // 不要删除 serverCache，让它自然同步
                    window.dispatchEvent(new CustomEvent('serverStorageUpdate', {
                        detail: { key: delKey, value: null }
                    }));
                }
            }
        }
    }

    // 迁移：把本地已存在的mindmap大数据挪到服务器，并将本地值替换为占位符（立即释放localStorage空间）
    migrateLocalMindmapDataToServer() {
        if (!this.useServerStorage) return;

        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (!key || this.isSessionKey(key)) continue;

                var localValue = this._originalGetItem(key);
                if (!localValue || this.isPlaceholder(localValue)) continue;

                if (!this.isMindmapData(key, localValue)) continue;

                var serverValue = this.serverCache[key];
                var localTime = this.extractTimestamp(localValue);
                var serverTime = this.extractTimestamp(serverValue);

                // 选择较新的作为最终值
                var finalValue = localTime >= serverTime ? localValue : serverValue;
                if (finalValue && finalValue !== serverValue) {
                    this.serverCache[key] = finalValue;
                    this.queueSyncToServer(key, finalValue);
                }

                // 本地替换为占位符，释放空间（overwrite为更小字符串，一般不会再触发quota）
                try {
                    this._originalSetItem(key, this.makePlaceholder(finalValue || localValue));
                } catch (e) {
                    try {
                        this._originalRemoveItem(key);
                    } catch (e2) {}
                }
            }
        } catch (e) {
            console.warn('[迁移] 失败:', e);
        }
    }

    // 尝试释放 localStorage 空间（只删除已确认同步到服务器的数据）
    tryFreeLocalStorageSpace() {
        console.log('[StorageAdapter] 尝试释放 localStorage 空间...');
        var freedCount = 0;
        var self = this;
        
        try {
            // 收集所有可删除的脑图数据键（必须满足：serverCache中有 且 没有待同步的定时器 且 不在recentlyModified中）
            var keysToRemove = [];
            var now = Date.now();
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (!key || this.isSessionKey(key)) continue;
                if (key.indexOf('mindmap_') !== 0) continue;
                
                // 如果有待同步的定时器，说明还没同步到服务器，不能删除
                if (this.pendingSyncTimers.has(key)) continue;
                
                // 如果最近被修改过，不能删除（可能还没同步到服务器）
                var modTime = this.recentlyModified.get(key);
                if (modTime && now - modTime < 10000) continue;
                
                var localValue = this._originalGetItem(key);
                // 只删除占位符（真实数据不删除，保持本地备份）
                if (localValue && this.isPlaceholder(localValue)) {
                    // 确保 serverCache 中有数据
                    if (Object.prototype.hasOwnProperty.call(this.serverCache, key)) {
                        keysToRemove.push(key);
                    }
                }
            }
            
            // 删除这些占位符释放空间
            for (var j = 0; j < keysToRemove.length; j++) {
                try {
                    this._originalRemoveItem(keysToRemove[j]);
                    freedCount++;
                } catch (e) {}
            }
            
            console.log('[StorageAdapter] 释放了', freedCount, '个占位符的空间');
        } catch (e) {
            console.warn('[StorageAdapter] 释放空间失败:', e);
        }
        
        return freedCount;
    }

    hijackLocalStorage() {
        var self = this;
        console.log('[StorageAdapter] 开始劫持 localStorage...');

        localStorage.setItem = function(key, value) {
            var now = Date.now();
            self.recentlyModified.set(key, now);

            if (AppState.namespaceManager) {
                const currentNamespace = AppState.namespaceManager.getCurrentNamespace();
                const namespaceData = AppState.namespaceManager.getAllNamespaces(true).find(ns => ns.name === currentNamespace);
                const namespacePrefix = 'mindmap_' + currentNamespace + '_';
                const isNamespaceKey = key === AppState.namespaceManager.storageKey ||
                    key === AppState.namespaceManager.namespacesKey;
                // 保留加密空间的“锁”语义，但不对数据做 AES 加密，避免性能开销
            }

            // 优先写入内存缓存（确保数据安全）
            if (self.useServerStorage && !self.isSessionKey(key)) {
                self.serverCache[key] = value;
            }

            // 脑图大数据：优先写真实数据到 localStorage，quota 不足时才用占位符
            if (self.useServerStorage && !self.isSessionKey(key) && self.isMindmapData(key, value)) {
                try {
                    // 先尝试写入真实数据到 localStorage（确保刷新页面后数据不丢失）
                    self._originalSetItem(key, value);
                    console.log('[StorageAdapter] 脑图数据已写入 localStorage:', key, '大小:', value.length);
                } catch (e) {
                    // localStorage 空间不足：清理后重试写真实数据
                    console.warn('[StorageAdapter] 真实数据写入失败，尝试清理空间:', key);
                    self.tryFreeLocalStorageSpace();
                    try {
                        self._originalSetItem(key, value);
                        console.log('[StorageAdapter] 清理后写入真实数据成功:', key);
                    } catch (e2) {
                        // 仍然空间不足：退而使用占位符（真实数据在 serverCache 和服务器）
                        console.warn('[StorageAdapter] 空间不足，使用占位符:', key);
                        try {
                            self._originalSetItem(key, self.makePlaceholder(value));
                        } catch (e3) {
                            console.warn('[StorageAdapter] 占位符也写入失败，仅使用服务器存储:', key);
                        }
                    }
                }
                // 同步到服务器作为备份
                self.queueSyncToServer(key, value);
                return;
            }

            // 小数据：正常写本地；失败时再回退到服务器或忽略
            try {
                self._originalSetItem(key, value);
            } catch (e) {
                // 尝试清理空间后重试
                console.warn('[StorageAdapter] 本地写入失败，尝试清理空间:', key);
                self.tryFreeLocalStorageSpace();
                try {
                    self._originalSetItem(key, value);
                } catch (e2) {
                    if (self.useServerStorage && !self.isSessionKey(key)) {
                        // 本地写失败：回退存服务器，不抛出异常
                        console.warn('[StorageAdapter] 小数据本地写入失败，使用服务器存储:', key);
                        self.serverCache[key] = value;
                        self.queueSyncToServer(key, value, { debounceMs: 0 });
                    } else {
                        // 会话键或无服务器：只记录警告，不抛出异常
                        console.warn('[StorageAdapter] 本地写入失败，忽略:', key, e2.message);
                    }
                    return; // 不抛出异常
                }
            }

            if (self.useServerStorage && !self.isSessionKey(key)) {
                // 小数据也同步到服务器（不走占位符逻辑）
                self.queueSyncToServer(key, value);
            }
        };

        localStorage.getItem = function(key) {
            var localValue = self._originalGetItem(key);
            
            // 如果本地没有值，从 serverCache 获取
            if (localValue === null) {
                var serverValue = Object.prototype.hasOwnProperty.call(self.serverCache, key) ? self.serverCache[key] : null;
                localValue = serverValue;
            }
            
            // 如果本地值是占位符，从 serverCache 获取真实数据
            if (self.isPlaceholder(localValue)) {
                var hasInCache = Object.prototype.hasOwnProperty.call(self.serverCache, key);
                if (hasInCache) {
                    localValue = self.serverCache[key];
                } else {
                    console.warn('[StorageAdapter] 占位符存在但 serverCache 中没有数据:', key, '占位符:', localValue.substring(0, 50));
                    return null;
                }
            }

            // 加密空间仅用于“锁定”，不再尝试 AES 解密
            
            return localValue;
        };
        
        console.log('[StorageAdapter] localStorage.getItem 劫持完成');

        localStorage.removeItem = function(key) {
            var now = Date.now();
            self.recentlyModified.set(key, now);

            // 先删本地
            try {
                self._originalRemoveItem(key);
            } catch (e) {}

            // 取消待同步
            var timer = self.pendingSyncTimers.get(key);
            if (timer) {
                clearTimeout(timer);
                self.pendingSyncTimers.delete(key);
            }

            // 删缓存 + 删服务器
            delete self.serverCache[key];
            if (self.useServerStorage && !self.isSessionKey(key)) {
                self.deleteFromServer(key);
            }
        };
    }

    queueSyncToServer(key, value, options) {
        options = options || {};
        if (!this.useServerStorage) return;
        if (this.isSessionKey(key)) return;

        // 减少 debounce 时间，让数据更快同步到服务器（从600ms改为100ms）
        var debounceMs = typeof options.debounceMs === 'number' ? options.debounceMs : (this.isMindmapData(key, value) ? 100 : 0);

        var existingTimer = this.pendingSyncTimers.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
            this.pendingSyncTimers.delete(key);
        }

        if (debounceMs <= 0) {
            this.syncToServer(key, value);
            return;
        }

        var self = this;
        var timer = setTimeout(function() {
            self.pendingSyncTimers.delete(key);
            var latest = Object.prototype.hasOwnProperty.call(self.serverCache, key) ? self.serverCache[key] : value;
            self.syncToServer(key, latest);
        }, debounceMs);

        this.pendingSyncTimers.set(key, timer);
    }

    syncToServer(key, value, retryCount) {
        var self = this;
        retryCount = retryCount || 0;

        fetch('/api/storage/' + encodeURIComponent(key), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: value })
        }).then(function(response) {
            if (response.ok) {
                console.log('[同步成功]', key);
                self._lastSyncSuccess = true;
                // 同步成功后，从 recentlyModified 中移除（表示已确认同步）
                // 但保留一小段时间的保护，防止立即被服务器数据覆盖
                setTimeout(function() {
                    var modTime = self.recentlyModified.get(key);
                    if (modTime && Date.now() - modTime > 5000) {
                        self.recentlyModified.delete(key);
                    }
                }, 5000);
            } else if (retryCount < 3) {
                // 重试
                console.warn('[同步] 重试中...', key, '次数:', retryCount + 1);
                setTimeout(function() {
                    self.syncToServer(key, value, retryCount + 1);
                }, 1000 * (retryCount + 1));
            } else {
                self._lastSyncSuccess = false;
            }
        }).catch(function(error) {
            console.error('[同步失败]', key, error);
            if (retryCount < 3) {
                // 重试
                setTimeout(function() {
                    self.syncToServer(key, value, retryCount + 1);
                }, 1000 * (retryCount + 1));
            } else {
                self._lastSyncSuccess = false;
            }
        });
    }

    // 立即同步指定 key 到服务器，返回 Promise（用于保存确认）
    syncToServerNow(key) {
        var self = this;
        if (!this.useServerStorage) {
            return Promise.resolve(false);
        }
        var value = this.serverCache[key];
        if (!value) {
            return Promise.resolve(false);
        }

        // 取消该 key 的 debounce 定时器（避免重复同步）
        var timer = this.pendingSyncTimers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.pendingSyncTimers.delete(key);
        }

        return fetch('/api/storage/' + encodeURIComponent(key), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: value })
        }).then(function(response) {
            if (response.ok) {
                console.log('[立即同步成功]', key);
                self._lastSyncSuccess = true;
                return true;
            }
            console.error('[立即同步失败] 状态码:', response.status, key);
            self._lastSyncSuccess = false;
            return false;
        }).catch(function(error) {
            console.error('[立即同步失败]', key, error);
            self._lastSyncSuccess = false;
            return false;
        });
    }

    deleteKey(key) {
        var now = Date.now();
        this.recentlyModified.set(key, now);

        // 强制使用原始接口删除本地，避免 Safari 中方法劫持失效
        try {
            this._originalRemoveItem(key);
        } catch (e) {}

        // 取消待同步
        var timer = this.pendingSyncTimers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.pendingSyncTimers.delete(key);
        }

        delete this.serverCache[key];

        if (this.useServerStorage && !this.isSessionKey(key)) {
            return this.deleteFromServer(key);
        }

        return Promise.resolve(true);
    }

    refreshFromServer(options) {
        var self = this;
        options = options || {};
        if (!this.useServerStorage) return Promise.resolve(false);

        var allowDeleteLocal = options.allowDeleteLocal === true;

        var applyServerData = function(serverData) {
            if (!serverData || typeof serverData !== 'object') return false;

            if (allowDeleteLocal) {
                var now = Date.now();
                var cacheKeys = Object.keys(self.serverCache);
                for (var i = 0; i < cacheKeys.length; i++) {
                    var key = cacheKeys[i];
                    if (self.isSessionKey(key)) continue;
                    if (Object.prototype.hasOwnProperty.call(serverData, key)) continue;
                    if (self.pendingSyncTimers.has(key)) continue;

                    var modTime = self.recentlyModified.get(key);
                    if (modTime && now - modTime < 5000) continue;

                    delete self.serverCache[key];
                    try {
                        self._originalRemoveItem(key);
                    } catch (e) {}
                }
            }

            self.syncFromServer(serverData, { allowDeleteLocal: allowDeleteLocal });
            return true;
        };

        if (typeof fetch === 'function') {
            return fetch('/api/storage')
                .then(function(response) {
                    if (!response.ok) throw new Error('refresh failed');
                    return response.text();
                })
                .then(function(text) {
                    var trimmed = (text || '').trim();
                    if (!trimmed) throw new Error('empty response');
                    var serverData = JSON.parse(trimmed);
                    return applyServerData(serverData);
                })
                .catch(function() {
                    return self.refreshFromServerXhr(applyServerData);
                });
        }

        return this.refreshFromServerXhr(applyServerData);
    }

    refreshFromServerXhr(applyServerData) {
        return new Promise(function(resolve) {
            try {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', '/api/storage', true);
                xhr.onload = function() {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            var text = (xhr.responseText || '').trim();
                            if (!text) {
                                resolve(false);
                                return;
                            }
                            var data = JSON.parse(text);
                            resolve(applyServerData(data));
                            return;
                        } catch (e) {}
                    }
                    resolve(false);
                };
                xhr.onerror = function() {
                    resolve(false);
                };
                xhr.send(null);
            } catch (e) {
                resolve(false);
            }
        });
    }

    deleteFromServer(key) {
        var self = this;

        if (typeof fetch !== 'function') {
            return this.deleteFromServerXhr(key);
        }

        return fetch('/api/storage/' + encodeURIComponent(key), { method: 'DELETE' })
            .then(function(response) {
                if (response && response.ok) return true;
                throw new Error('delete failed');
            })
            .catch(function(error) {
                console.error('[删除失败]', key);
                return self.deleteFromServerXhr(key);
            });
    }

    deleteFromServerXhr(key) {
        return new Promise(function(resolve) {
            try {
                var xhr = new XMLHttpRequest();
                xhr.open('DELETE', '/api/storage/' + encodeURIComponent(key), true);
                xhr.onload = function() {
                    resolve(xhr.status >= 200 && xhr.status < 300);
                };
                xhr.onerror = function() {
                    resolve(false);
                };
                xhr.send(null);
            } catch (e) {
                resolve(false);
            }
        });
    }

    startSync() {
        var self = this;
        this._syncEtag = null; // 服务器 ETag，用于避免重复传输未变化的数据
        setInterval(function() {
            if (!self.useServerStorage) return;

            // 清理过期的修改记录
            var now = Date.now();
            self.recentlyModified.forEach(function(time, key) {
                if (now - time > 15000) {
                    self.recentlyModified.delete(key);
                }
            });

            var fetchOptions = {};
            if (self._syncEtag) {
                fetchOptions.headers = { 'If-None-Match': self._syncEtag };
            }
            fetch('/api/storage', fetchOptions).then(function(response) {
                // 304 Not Modified: 服务器数据没变，跳过
                if (response.status === 304) return null;
                if (!response.ok) return null;
                // 记录 ETag
                var etag = response.headers.get('ETag');
                if (etag) self._syncEtag = etag;
                return response.json();
            }).then(function(serverData) {
                if (!serverData) return;
                
                // 如果服务器数据有更新（且非本地刚修改），更新缓存并通知
                var keys = Object.keys(serverData);
                for (var i = 0; i < keys.length; i++) {
                    var key = keys[i];
                    if (self.isSessionKey(key)) continue;
                    var modTime = self.recentlyModified.get(key);
                    if (modTime && now - modTime < 5000) continue;
                    
                    // 如果有待同步的定时器，说明本地有更新，跳过
                    if (self.pendingSyncTimers.has(key)) continue;

                    var newVal = serverData[key];
                    var oldVal = self.serverCache[key];
                    if (typeof newVal === 'string' && newVal !== oldVal) {
                        self.serverCache[key] = newVal;
                        // 仅在本地无数据时写入，不覆盖已有的真实数据
                        if (self.isMindmapData(key, newVal)) {
                            var localValue = self._originalGetItem(key);
                            if (localValue === null) {
                                try {
                                    self._originalSetItem(key, newVal);
                                } catch (e) {
                                    try {
                                        self._originalSetItem(key, self.makePlaceholder(newVal));
                                    } catch (e2) {}
                                }
                            }
                        }
                        window.dispatchEvent(new CustomEvent('serverStorageUpdate', {
                            detail: { key: key, value: newVal }
                        }));
                    }
                }

                // 处理删除同步 & 其他键同步（禁用删除同步，只做添加同步）
                self.syncFromServer(serverData, { allowDeleteLocal: false });
            }).catch(function(error) {});
        }, this.syncInterval);
    }
}

window.storageAdapter = new StorageAdapter();
