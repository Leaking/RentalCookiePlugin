// content.js - 内容脚本（隔离环境）
// 负责注入拦截脚本，并接收消息转发给 background script
(function() {
    'use strict';

    console.log('📦 [Content Script] 已加载, hostname:', window.location.hostname, 'href:', window.location.href);

    // ============================================
    // 0. 存储数据到 localStorage（供其他网页访问）
    // ============================================
    const STORAGE_KEY = 'aizuji_plugin_merchant_data';

    // 添加或更新商家到数组（通过 merchantCode 去重）
    function upsertMerchant(merchants, newMerchant) {
        if (!Array.isArray(merchants)) {
            merchants = [];
        }
        // 查找是否已存在相同 merchantCode 的商家
        const existingIndex = merchants.findIndex(m => m.merchantCode === newMerchant.merchantCode);
        if (existingIndex >= 0) {
            // 更新现有商家
            merchants[existingIndex] = { ...merchants[existingIndex], ...newMerchant };
        } else {
            // 添加新商家
            merchants.push(newMerchant);
        }
        return merchants;
    }

    function saveToLocalStorage(platform, merchantData) {
        try {
            // 验证商家编码和名称都不为空
            if (!merchantData.merchantCode || !merchantData.merchantName) {
                console.log('⚠️ [Content Script] 商家编码或名称为空，放弃保存:', merchantData);
                return;
            }

            const existingData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

            // 获取该平台的商家列表并更新
            const platformMerchants = upsertMerchant(existingData[platform] || [], merchantData);
            const mergedData = { ...existingData, [platform]: platformMerchants };

            localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedData));
            console.log('💾 [Content Script] 数据已保存到 localStorage:', mergedData);

            // 同时保存到 chrome.storage.local（供其他域名页面访问）
            chrome.storage.local.set({ [STORAGE_KEY]: mergedData }, () => {
                console.log('💾 [Content Script] 数据已同步到 chrome.storage.local');
            });

            // 同时通过 postMessage 通知页面数据已更新
            window.postMessage({
                type: 'AIZUJI_PLUGIN_DATA_UPDATED',
                data: mergedData
            }, '*');
        } catch (e) {
            console.error('❌ [Content Script] 保存到 localStorage 失败:', e);
        }
    }

    function saveWoaizujiData(merchantCode, merchantName, token) {
        saveToLocalStorage('woaizuji', {
            platform: 'aizuji',
            merchantCode: merchantCode,
            merchantName: merchantName,
            token: token,
            timestamp: new Date().toISOString()
        });
    }

    function saveRrzuData(merchantCode, merchantName, authorization) {
        saveToLocalStorage('rrzu', {
            platform: 'renrenzu',
            merchantCode: merchantCode,
            merchantName: merchantName,
            token: authorization,
            timestamp: new Date().toISOString()
        });
    }

    // ============================================
    // 1. 注入拦截脚本到页面主世界（使用外部文件绕过 CSP）
    // ============================================
    const isTargetSite = window.location.hostname.includes('woaizuji.com') ||
                         window.location.hostname.includes('rrzu.com');

    function injectScript() {
        // 只在目标站点注入拦截脚本
        if (!isTargetSite) {
            console.log('📦 [Content Script] 非目标站点，跳过注入拦截脚本');
            return;
        }

        console.log('🔧 [Content Script] 开始注入 injected.js...');
        const scriptUrl = chrome.runtime.getURL('injected.js');
        console.log('🔧 [Content Script] injected.js URL:', scriptUrl);

        const script = document.createElement('script');
        script.src = scriptUrl;
        script.onload = function() {
            console.log('✅ [Content Script] injected.js 已加载到页面');
            this.remove(); // 加载完成后移除 script 标签
        };
        script.onerror = function(e) {
            console.error('❌ [Content Script] injected.js 加载失败:', e);
        };

        const target = document.head || document.documentElement;
        console.log('🔧 [Content Script] 注入目标:', target ? target.tagName : 'null');
        if (target) {
            target.appendChild(script);
            console.log('🔧 [Content Script] script 标签已添加');
        } else {
            console.error('❌ [Content Script] 找不到注入目标');
        }
    }

    // 尽早注入（仅在目标站点）
    injectScript();

    // ============================================
    // 2. 监听来自 injected.js 和页面的消息 (通过 postMessage)
    // ============================================
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;

        // 处理来自页面的数据请求（用于 RentalSys 等外部应用）
        if (event.data && event.data.type === 'AIZUJI_PLUGIN_REQUEST_DATA') {
            console.log('📨 [Content Script] 收到数据请求');

            // 从 chrome.storage.local 获取数据（使用统一的 key）
            chrome.storage.local.get([STORAGE_KEY], (result) => {
                const merchantData = result[STORAGE_KEY] || {};
                console.log('📦 [Content Script] 从 chrome.storage.local 读取到:', merchantData);

                // 发送响应（数据格式已经是 {woaizuji: {...}, rrzu: {...}}）
                window.postMessage({
                    type: 'AIZUJI_PLUGIN_DATA_RESPONSE',
                    data: Object.keys(merchantData).length > 0 ? merchantData : null
                }, '*');
            });

            return;
        }

        // 处理 woaizuji 商家信息
        if (event.data && event.data.type === 'WOAIZUJI_MERCHANT_INFO') {
            console.log('📨 [Content Script] 收到woaizuji商家信息:', event.data);

            // 转发给 background script
            chrome.runtime.sendMessage({
                type: 'MERCHANT_INFO_EXTRACTED',
                site: 'woaizuji',
                data: {
                    merchantCode: event.data.merchantCode,
                    merchantName: event.data.merchantName
                }
            });

            // 从 background 获取完整数据（包括token）后保存到 localStorage
            chrome.runtime.sendMessage({ type: 'GET_HEADER_DATA' }, (response) => {
                if (response && response.woaizuji) {
                    saveWoaizujiData(
                        event.data.merchantCode,
                        event.data.merchantName,
                        response.woaizuji.azjtk
                    );
                }
            });

            // 显示通知
            showNotificationWhenReady('🏪 商家: ' + (event.data.merchantName || event.data.merchantCode));
        }

        // 处理 rrzu orderList 商家信息
        if (event.data && event.data.type === 'RRZU_ORDER_MERCHANT_INFO') {
            console.log('📨 [Content Script] 收到rrzu orderList商家信息:', event.data);

            // 转发给 background script
            chrome.runtime.sendMessage({
                type: 'MERCHANT_INFO_EXTRACTED',
                site: 'rrzu_order',
                data: {
                    merchantCode: event.data.merchantCode,
                    merchantName: event.data.merchantName
                }
            });

            // 从 background 获取完整数据（包括token）后保存到 localStorage
            chrome.runtime.sendMessage({ type: 'GET_HEADER_DATA' }, (response) => {
                if (response && response.rrzu) {
                    saveRrzuData(
                        event.data.merchantCode,
                        event.data.merchantName,
                        response.rrzu.authorization
                    );
                }
            });

            // 显示通知
            showNotificationWhenReady('🏢 商家: ' + (event.data.merchantName || event.data.merchantCode));
        }
    });

    // ============================================
    // 3. 通知功能
    // ============================================
    let notification = null;
    let pendingNotifications = [];

    function createNotification() {
        if (notification) return notification;
        if (!document.body) return null;

        notification = document.createElement('div');
        notification.id = 'azjtk-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            display: none;
            max-width: 300px;
            word-wrap: break-word;
        `;
        document.body.appendChild(notification);
        return notification;
    }

    function showNotification(message, duration = 3000) {
        const notif = createNotification();
        if (!notif) return;

        notif.textContent = message;
        notif.style.display = 'block';

        setTimeout(() => {
            notif.style.display = 'none';
        }, duration);
    }

    function showNotificationWhenReady(message) {
        if (document.body) {
            showNotification(message);
        } else {
            pendingNotifications.push(message);
        }
    }

    // ============================================
    // 4. 监听来自 background script 的消息
    // ============================================
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'HEADER_EXTRACTED') {
            console.log('[Content Script] 收到Header提取通知:', message.data);

            // 将完整数据保存到 localStorage
            if (message.data.woaizuji && message.data.woaizuji.azjtk) {
                saveWoaizujiData(
                    message.data.woaizuji.merchantCode,
                    message.data.woaizuji.merchantName,
                    message.data.woaizuji.azjtk
                );
            }
            if (message.data.rrzu && message.data.rrzu.authorization) {
                saveRrzuData(
                    message.data.rrzu.merchantCode,
                    message.data.rrzu.merchantName,
                    message.data.rrzu.authorization
                );
            }

            if (window.location.hostname.includes('woaizuji.com') && message.data.woaizuji && message.data.woaizuji.azjtk) {
                showNotificationWhenReady('🎉 已提取AZJTK值');
            } else if (window.location.hostname.includes('rrzu.com') && message.data.rrzu) {
                showNotificationWhenReady('🎉 已提取Header');
            }
        }
    });

    // ============================================
    // 5. 初始化
    // ============================================
    function initialize() {
        console.log('📍 [Content Script] 初始化完成');

        pendingNotifications.forEach(msg => showNotification(msg));
        pendingNotifications = [];

        // 在目标站点上，自动同步 localStorage 数据到 chrome.storage.local
        if (isTargetSite) {
            try {
                const existingData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                if (Object.keys(existingData).length > 0) {
                    chrome.storage.local.set({ [STORAGE_KEY]: existingData }, () => {
                        console.log('🔄 [Content Script] 已将 localStorage 数据同步到 chrome.storage.local:', existingData);
                    });
                }
            } catch (e) {
                console.error('❌ [Content Script] 同步数据失败:', e);
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
