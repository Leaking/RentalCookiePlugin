// background.js - 监听网络请求并提取多种header字段
let extractedData = {
  woaizuji: {
    azjtk: null,
    timestamp: null,
    url: null,
    merchantCode: null,
    merchantName: null
  },
  rrzu: {
    authorization: null,
    cookie: null,
    timestamp: null,
    url: null
  }
};

// 监听网络请求
chrome.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    let dataUpdated = false;
    
    // 记录所有请求（调试用）
    console.log('🌐 检测到请求:', details.url);
    
    // 特别关注包含orderList的所有请求
    if (details.url.includes('orderList')) {
      console.log('🎯 发现orderList请求!');
      console.log('完整URL:', details.url);
      console.log('请求方法:', details.method);
      console.log('请求类型:', details.type);
      console.log('发起者:', details.initiator);
      console.log('Tab ID:', details.tabId);
      console.log('Frame ID:', details.frameId);
      console.log('Headers数量:', details.requestHeaders ? details.requestHeaders.length : 0);
    }
    
    // 详细检查rrzu相关请求
    if (details.url.includes('rrzu.com')) {
      console.log('🏢 这是rrzu域名的请求:', details.url);
      console.log('请求方法:', details.method);
      console.log('请求类型:', details.type);
      console.log('是否包含orderList:', details.url.includes('orderList'));
    }

    // 检查woaizuji网站的订单列表请求
    if (details.url.includes('external-gw.woaizuji.com/merchantTeamwork/inside_route_page/merchantOrder/orderList')) {
      console.log('检测到woaizuji订单请求:', details.url);
      
      if (details.requestHeaders) {
        for (let header of details.requestHeaders) {
          if (header.name.toLowerCase() === 'azjtk') {
            extractedData.woaizuji = {
              azjtk: header.value,
              timestamp: new Date().toLocaleString('zh-CN'),
              url: details.url
            };
            
            console.log('提取到azjtk:', header.value);
            dataUpdated = true;
            break;
          }
        }
      }
    }
    
    // 检查rrzu网站的订单列表请求
    if (details.url.includes('rrzu')) {
      console.log('检测到rrzu订单请求:', details.url);
      
      if (details.requestHeaders) {
        let tempData = {
          authorization: null,
          cookie: null,
          timestamp: new Date().toLocaleString('zh-CN'),
          url: details.url
        };
        
        for (let header of details.requestHeaders) {
          const headerName = header.name.toLowerCase();
          if (headerName === 'authorization') {
            tempData.authorization = header.value;
            console.log('提取到authorization:', header.value);
          } else if (headerName === 'cookie') {
            tempData.cookie = header.value;
            console.log('提取到cookie:', header.value.substring(0, 100) + '...');
          }
        }
        
        // 只有当至少提取到一个字段时才更新数据
        if (tempData.authorization || tempData.cookie) {
          extractedData.rrzu = tempData;
          dataUpdated = true;
        }
      }
    }
    
    // 如果有数据更新，保存并通知
    if (dataUpdated) {
      // 保存到storage
      chrome.storage.local.set({ extractedData: extractedData });
      
      // 通知content script
      chrome.tabs.sendMessage(details.tabId, {
        type: 'HEADER_EXTRACTED',
        data: extractedData
      }).catch(() => {
        // 忽略错误，可能content script还未加载
      });
    }
  },
  {
    urls: ["<all_urls>"]  // 临时监听所有URL来调试
  },
  ["requestHeaders"]
);

// 添加额外的监听器来捕获可能遗漏的请求
chrome.webRequest.onSendHeaders.addListener(
  function(details) {
    if (details.url.includes('go-micro.rrzu.com/order/orderList')) {
      console.log('📤 onSendHeaders - 检测到rrzu订单请求:', details.url);
      console.log('📤 请求Headers:', details.requestHeaders);
    }
  },
  {
    urls: ["https://go-micro.rrzu.com/*"]
  },
  ["requestHeaders"]
);

chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (details.url.includes('go-micro.rrzu.com/order/orderList')) {
      console.log('📥 onBeforeRequest - 检测到rrzu订单请求:', details.url);
      console.log('📥 请求方法:', details.method);
      console.log('📥 请求体:', details.requestBody);
    }
  },
  {
    urls: ["https://go-micro.rrzu.com/*"]
  },
  ["requestBody"]
);

// 监听来自popup和content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_HEADER_DATA') {
    sendResponse(extractedData);
  } else if (request.type === 'MERCHANT_INFO_EXTRACTED') {
    // 处理来自 content script 的商家信息（仅 woaizuji）
    const site = request.site;
    const { merchantCode, merchantName } = request.data;

    if (site === 'woaizuji' && (merchantCode || merchantName)) {
      extractedData.woaizuji.merchantCode = merchantCode;
      extractedData.woaizuji.merchantName = merchantName;
      console.log('✅ 收到woaizuji商家信息:', { merchantCode, merchantName });

      // 保存到storage
      chrome.storage.local.set({ extractedData: extractedData });

      // 通知所有tab更新
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'HEADER_EXTRACTED',
            data: extractedData
          }).catch(() => {});
        });
      });
    }
  }
});

// 插件安装时的初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('多站点Header提取器已安装');
});
