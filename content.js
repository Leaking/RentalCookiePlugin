// content.js - 内容脚本，在页面中运行
(function() {
    'use strict';
    
    console.log('多站点Header提取器 content script 已加载');
    
    // 创建一个浮动提示元素
    let notification = null;
    
    function createNotification() {
        if (notification) return notification;
        
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
            animation: slideIn 0.3s ease-out;
        `;
        
        // 添加动画样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notification);
        return notification;
    }
    
    function showNotification(message, duration = 3000) {
        const notif = createNotification();
        notif.textContent = message;
        notif.style.display = 'block';
        
        setTimeout(() => {
            notif.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                notif.style.display = 'none';
                notif.style.animation = 'slideIn 0.3s ease-out';
            }, 300);
        }, duration);
    }
    
    // 监听来自background script的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'HEADER_EXTRACTED') {
            console.log('收到Header提取通知:', message.data);
            
            // 根据不同网站显示不同通知
            if (window.location.hostname.includes('woaizuji.com') && message.data.woaizuji && message.data.woaizuji.azjtk) {
                showNotification(`🎉 已提取AZJTK值: ${message.data.woaizuji.azjtk.substring(0, 20)}...`);
            } else if (window.location.hostname.includes('rrzu.com') && message.data.rrzu) {
                let notificationText = '🎉 已提取Header: ';
                if (message.data.rrzu.authorization) {
                    notificationText += 'Authorization ';
                }
                if (message.data.rrzu.cookie) {
                    notificationText += 'Cookie ';
                }
                showNotification(notificationText);
            }
            
            // 可以在这里添加更多页面交互逻辑
            // 比如高亮显示某些元素，或者在页面上显示提取状态
        }
    });
    
    // 监听页面的网络请求（作为备用方案）
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const url = args[0];
        console.log('检测到请求:', url);

        if (typeof url === 'string') {
            if (url.includes('merchantOrder/orderList')) {
                console.log('检测到woaizuji订单列表请求:', url);
            } else if (url.includes('order/orderList')) {
                console.log('检测到rrzu订单列表请求:', url);
            }
        }
        
        return originalFetch.apply(this, args);
    };
    
    // 监听XMLHttpRequest（作为备用方案）
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        if (typeof url === 'string') {
            if (url.includes('merchantOrder/orderList')) {
                console.log('检测到woaizuji XHR订单列表请求:', url);
            } else if (url.includes('order/orderList')) {
                console.log('检测到rrzu XHR订单列表请求:', url);
            }
        }
        
        return originalXHROpen.call(this, method, url, ...args);
    };
    
    // 页面加载完成后的初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
    function initialize() {
        console.log('多站点Header提取器已在页面中初始化');
        
        // 检查是否在目标页面
        if (window.location.hostname.includes('woaizuji.com')) {
            console.log('检测到woaizuji网站，插件已激活');
        } else if (window.location.hostname.includes('rrzu.com')) {
            console.log('检测到rrzu网站，插件已激活');
            console.log('当前页面:', window.location.href);
        }
    }
    
})();
