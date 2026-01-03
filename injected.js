// injected.js - 注入到页面主世界，拦截 fetch/XHR
(function() {
    'use strict';

    console.log('🚀🚀🚀 [Injected] 拦截器已注入到页面主世界');
    console.log('🚀 [Injected] 当前页面:', window.location.href);
    console.log('🚀 [Injected] 原始 fetch:', typeof window.fetch);

    // woaizuji orderList 接口的URL标识
    const WOAIZUJI_ORDER_LIST_URL = 'external-gw.woaizuji.com/merchantTeamwork/inside_route_page/merchantOrder/orderList';
    // rrzu orderList 接口的URL标识
    const RRZU_ORDER_LIST_URL = 'go-micro.rrzu.com/order/orderList';


    function isWoaizujiOrderListUrl(url) {
        return typeof url === 'string' && url.includes(WOAIZUJI_ORDER_LIST_URL);
    }

    function isRrzuOrderListUrl(url) {
        return typeof url === 'string' && url.includes(RRZU_ORDER_LIST_URL);
    }

    // 发送提取到的 woaizuji 数据给 content script
    function sendWoaizujiMerchantInfo(merchantCode, merchantName) {
        window.postMessage({
            type: 'WOAIZUJI_MERCHANT_INFO',
            merchantCode: merchantCode,
            merchantName: merchantName
        }, '*');
    }

    // 发送提取到的 rrzu orderList 商家数据给 content script
    function sendRrzuOrderMerchantInfo(merchantCode, merchantName) {
        window.postMessage({
            type: 'RRZU_ORDER_MERCHANT_INFO',
            merchantCode: merchantCode,
            merchantName: merchantName
        }, '*');
    }

    // 从 woaizuji 响应中提取商家信息
    function extractWoaizujiMerchantInfo(responseData) {
        console.log('🔍 [Injected] 提取woaizuji商家信息 rsp data data:', Array.isArray(responseData.data.data));
        try {
            if (responseData &&
                responseData.data && responseData.data.data &&
                Array.isArray(responseData.data.data) &&
                responseData.data.data.length > 0) {

                const firstOrder = responseData.data.data[0];
                const merchantCode = firstOrder.merchantCode;
                const merchantName = firstOrder.merchantName;

                if (merchantCode || merchantName) {
                    console.log('✅ [Injected] 提取到woaizuji商家信息:', { merchantCode, merchantName });
                    sendWoaizujiMerchantInfo(merchantCode || '', merchantName || '');
                }
            }
        } catch (e) {
            console.error('❌ [Injected] 解析woaizuji商家信息失败:', e);
        }
    }

    // 从 rrzu orderList 响应中提取商家信息
    function extractRrzuOrderMerchantInfo(responseData) {
        console.log('🔍 [Injected] 提取rrzu orderList商家信息');
        try {
            // rrzu orderList 的数据结构: data.order_list[0].base_info
            if (responseData &&
                responseData.data && responseData.data.order_list &&
                Array.isArray(responseData.data.order_list) &&
                responseData.data.order_list.length > 0) {

                const firstOrder = responseData.data.order_list[0];
                const baseInfo = firstOrder.base_info;

                if (baseInfo) {
                    // server_id 是店铺ID，shop_name 是店铺名称
                    const merchantCode = baseInfo.server_id ? String(baseInfo.server_id) : (baseInfo.shop_href || '');
                    const merchantName = baseInfo.shop_name || '';

                    if (merchantCode || merchantName) {
                        console.log('✅ [Injected] 提取到rrzu orderList商家信息:', { merchantCode, merchantName });
                        sendRrzuOrderMerchantInfo(merchantCode, merchantName);
                    }
                }
            }
        } catch (e) {
            console.error('❌ [Injected] 解析rrzu orderList商家信息失败:', e);
        }
    }

    // ============================================
    // 拦截 fetch
    // ============================================
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        console.log('🔍 [Injected] 拦截 fetch url:', url);

        // 特别检查 orderList 请求
        if (url.includes('orderList')) {
            console.log('🎯🎯🎯 [Fetch] 发现 orderList 请求!', url);
            console.log('🎯 isRrzuOrderListUrl 结果:', isRrzuOrderListUrl(url));
        }
        // 拦截 woaizuji orderList 请求
        if (isWoaizujiOrderListUrl(url)) {
            console.log('🎯🎯🎯 [Fetch] 匹配到woaizuji orderList请求!');
            console.log('🎯 请求URL:', url);

            return originalFetch.apply(this, args).then(response => {
                console.log('📥 [Fetch] 收到响应, status:', response.status);
                const clonedResponse = response.clone();
                clonedResponse.json().then(data => {
                    console.log('📦📦📦 [woaizuji orderList 完整响应] ↓↓↓');
                    console.log(JSON.stringify(data, null, 2));
                    console.log('📦📦📦 [woaizuji orderList 完整响应] ↑↑↑');
                    extractWoaizujiMerchantInfo(data);
                }).catch(e => console.error('❌ JSON解析失败:', e));
                return response;
            });
        }

        // 拦截 rrzu orderList 请求
        if (isRrzuOrderListUrl(url)) {
            console.log('🎯🎯🎯 [Fetch] 匹配到rrzu orderList请求!');
            console.log('🎯 请求URL:', url);

            return originalFetch.apply(this, args).then(response => {
                console.log('📥 [Fetch] 收到rrzu orderList响应, status:', response.status);
                const clonedResponse = response.clone();
                clonedResponse.json().then(data => {
                    console.log('📦📦📦 [rrzu orderList 完整响应] ↓↓↓');
                    console.log(JSON.stringify(data, null, 2).substring(0, 1000));
                    console.log('📦📦📦 [rrzu orderList 完整响应] ↑↑↑');
                    extractRrzuOrderMerchantInfo(data);
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
        this._isWoaizujiTarget = isWoaizujiOrderListUrl(url);
        this._isRrzuOrderListTarget = isRrzuOrderListUrl(url);

        // 打印所有 XHR 请求
        console.log('🔍 [XHR] 拦截 XHR url:', url);

        // 特别检查 orderList 请求
        if (url && url.includes('orderList')) {
            console.log('🎯🎯🎯 [XHR] 发现 orderList 请求!', url);
            console.log('🎯 isRrzuOrderListUrl 结果:', isRrzuOrderListUrl(url));
        }

        if (this._isWoaizujiTarget) {
            console.log('🎯🎯🎯 [XHR] 匹配到woaizuji orderList请求!');
            console.log('🎯 请求URL:', url);
        }
        if (this._isRrzuOrderListTarget) {
            console.log('🎯🎯🎯 [XHR] 匹配到rrzu orderList请求!');
            console.log('🎯 请求URL:', url);
        }

        return originalXHROpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        if (this._isWoaizujiTarget) {
            this.addEventListener('load', function() {
                try {
                    console.log('📥 [XHR] 收到woaizuji响应, status:', this.status);
                    console.log('📦📦📦 [woaizuji orderList 完整响应] ↓↓↓');
                    console.log(this.responseText);
                    console.log('📦📦📦 [woaizuji orderList 完整响应] ↑↑↑');
                    const data = JSON.parse(this.responseText);
                    extractWoaizujiMerchantInfo(data);
                } catch (e) {
                    console.error('❌ [XHR] 解析woaizuji失败:', e);
                }
            });
        }
        if (this._isRrzuOrderListTarget) {
            this.addEventListener('load', function() {
                try {
                    console.log('📥 [XHR] 收到rrzu orderList响应, status:', this.status);
                    console.log('📦📦📦 [rrzu orderList 完整响应] ↓↓↓');
                    console.log(this.responseText.substring(0, 1000));
                    console.log('📦📦📦 [rrzu orderList 完整响应] ↑↑↑');
                    const data = JSON.parse(this.responseText);
                    extractRrzuOrderMerchantInfo(data);
                } catch (e) {
                    console.error('❌ [XHR] 解析rrzu orderList失败:', e);
                }
            });
        }
        return originalXHRSend.apply(this, args);
    };

    console.log('✅ [Injected] Fetch 和 XHR 拦截已设置完成');
    console.log('✅ [Injected] 新的 fetch:', window.fetch.toString().substring(0, 100));

})();
