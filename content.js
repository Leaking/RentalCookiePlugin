// content.js - 内容脚本（隔离环境）
// 负责注入拦截脚本，并接收消息转发给 background script
(function() {
    'use strict';

    console.log('📦 [Content Script] 已加载');

    // ============================================
    // 1. 注入拦截脚本到页面主世界（使用外部文件绕过 CSP）
    // ============================================
    function injectScript() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injected.js');
        script.onload = function() {
            console.log('✅ [Content Script] injected.js 已加载');
            this.remove(); // 加载完成后移除 script 标签
        };
        script.onerror = function() {
            console.error('❌ [Content Script] injected.js 加载失败');
        };
        (document.head || document.documentElement).appendChild(script);
    }

    // 尽早注入
    injectScript();

    // ============================================
    // 2. 监听来自 injected.js 的消息 (通过 postMessage)
    // ============================================
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;

        if (event.data && event.data.type === 'WOAIZUJI_MERCHANT_INFO') {
            console.log('📨 [Content Script] 收到商家信息:', event.data);

            // 转发给 background script
            chrome.runtime.sendMessage({
                type: 'MERCHANT_INFO_EXTRACTED',
                site: 'woaizuji',
                data: {
                    merchantCode: event.data.merchantCode,
                    merchantName: event.data.merchantName
                }
            });

            // 显示通知
            showNotificationWhenReady('🏪 商家: ' + (event.data.merchantName || event.data.merchantCode));
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
