// injected.js - 注入到页面主世界，拦截 fetch/XHR
(function() {
    'use strict';

    console.log('🚀 [Injected] 拦截器已注入到页面主世界');

    // woaizuji orderList 接口的URL标识
    const WOAIZUJI_ORDER_LIST_URL = 'external-gw.woaizuji.com/merchantTeamwork/inside_route_page/merchantOrder/orderList';

    function isWoaizujiOrderListUrl(url) {
        return typeof url === 'string' && url.includes(WOAIZUJI_ORDER_LIST_URL);
    }

    // 发送提取到的数据给 content script
    function sendMerchantInfo(merchantCode, merchantName) {
        window.postMessage({
            type: 'WOAIZUJI_MERCHANT_INFO',
            merchantCode: merchantCode,
            merchantName: merchantName
        }, '*');
    }

    // 从响应中提取商家信息
    function extractMerchantInfo(responseData) {
        console.log('🔍 [Injected] 提取商家信息 rsp data data:', Array.isArray(responseData.data.data));
        try {
            if (responseData &&
                responseData.data && responseData.data.data &&
                Array.isArray(responseData.data.data) &&
                responseData.data.data.length > 0) {

                const firstOrder = responseData.data.data[0];
                const merchantCode = firstOrder.merchantCode;
                const merchantName = firstOrder.merchantName;

                if (merchantCode || merchantName) {
                    console.log('✅ [Injected] 提取到商家信息:', { merchantCode, merchantName });
                    sendMerchantInfo(merchantCode || '', merchantName || '');
                }
            }
        } catch (e) {
            console.error('❌ [Injected] 解析商家信息失败:', e);
        }
    }

    // ============================================
    // 拦截 fetch
    // ============================================
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

        if (isWoaizujiOrderListUrl(url)) {
            console.log('🎯🎯🎯 [Fetch] 匹配到orderList请求!');
            console.log('🎯 请求URL:', url);

            return originalFetch.apply(this, args).then(response => {
                console.log('📥 [Fetch] 收到响应, status:', response.status);
                const clonedResponse = response.clone();
                clonedResponse.json().then(data => {
                    console.log('📦📦📦 [orderList 完整响应] ↓↓↓');
                    console.log(JSON.stringify(data, null, 2));
                    console.log('📦📦📦 [orderList 完整响应] ↑↑↑');
                    extractMerchantInfo(data);
                }).catch(e => console.error('❌ JSON解析失败:', e));
                return response;
            });
        }

        return originalFetch.apply(this, args);
    };

    // ============================================
    // 拦截 XMLHttpRequest
    // ============================================
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._url = url;
        this._isTarget = isWoaizujiOrderListUrl(url);

        if (this._isTarget) {
            console.log('🎯🎯🎯 [XHR] 匹配到orderList请求!');
            console.log('🎯 请求URL:', url);
        }

        return originalXHROpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        if (this._isTarget) {
            this.addEventListener('load', function() {
                try {
                    console.log('📥 [XHR] 收到响应, status:', this.status);
                    console.log('📦📦📦 [orderList 完整响应] ↓↓↓');
                    console.log(this.responseText);
                    console.log('📦📦📦 [orderList 完整响应] ↑↑↑');
                    const data = JSON.parse(this.responseText);
                    extractMerchantInfo(data);
                } catch (e) {
                    console.error('❌ [XHR] 解析失败:', e);
                }
            });
        }
        return originalXHRSend.apply(this, args);
    };

    console.log('✅ [Injected] Fetch 和 XHR 拦截已设置完成');

})();
