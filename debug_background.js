// debug_background.js - 调试版本，用于排查问题
let extractedData = {
  woaizuji: {
    azjtk: null,
    timestamp: null,
    url: null
  },
  rrzu: {
    authorization: null,
    cookie: null,
    timestamp: null,
    url: null
  }
};

// 监听所有网络请求（调试用）
chrome.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    let dataUpdated = false;
    
    // 记录所有请求
    console.log('=== 请求详情 ===');
    console.log('URL:', details.url);
    console.log('方法:', details.method);
    console.log('类型:', details.type);
    console.log('发起者:', details.initiator);
    console.log('Tab ID:', details.tabId);
    
    // 特别关注rrzu相关请求
    if (details.url.includes('rrzu.com')) {
      console.log('🔍 RRZU域名请求详情:');
      console.log('完整URL:', details.url);
      console.log('是否包含orderList:', details.url.includes('orderList'));
      console.log('是否包含go-micro:', details.url.includes('go-micro'));
      console.log('Headers数量:', details.requestHeaders ? details.requestHeaders.length : 0);
      
      if (details.requestHeaders) {
        console.log('所有Headers:');
        details.requestHeaders.forEach(header => {
          console.log(`  ${header.name}: ${header.value.substring(0, 50)}${header.value.length > 50 ? '...' : ''}`);
        });
      }
    }

    // 检查woaizuji网站的订单列表请求
    if (details.url.includes('external-gw.woaizuji.com/merchantTeamwork/inside_route_page/merchantOrder/orderList')) {
      console.log('✅ 检测到woaizuji订单请求:', details.url);
      
      if (details.requestHeaders) {
        for (let header of details.requestHeaders) {
          if (header.name.toLowerCase() === 'azjtk') {
            extractedData.woaizuji = {
              azjtk: header.value,
              timestamp: new Date().toLocaleString('zh-CN'),
              url: details.url
            };
            
            console.log('✅ 提取到azjtk:', header.value);
            dataUpdated = true;
            break;
          }
        }
      }
    }
    
    // 检查rrzu网站的订单列表请求
    if (details.url.includes('go-micro.rrzu.com/order/orderList')) {
      console.log('✅ 检测到rrzu订单请求:', details.url);
      
      if (details.requestHeaders) {
        let tempData = {
          authorization: null,
          cookie: null,
          timestamp: new Date().toLocaleString('zh-CN'),
          url: details.url
        };
        
        console.log('🔍 开始提取headers...');
        for (let header of details.requestHeaders) {
          const headerName = header.name.toLowerCase();
          console.log(`检查header: ${headerName}`);
          
          if (headerName === 'authorization') {
            tempData.authorization = header.value;
            console.log('✅ 提取到authorization:', header.value);
          } else if (headerName === 'cookie') {
            tempData.cookie = header.value;
            console.log('✅ 提取到cookie:', header.value.substring(0, 100) + '...');
          }
        }
        
        // 只有当至少提取到一个字段时才更新数据
        if (tempData.authorization || tempData.cookie) {
          extractedData.rrzu = tempData;
          dataUpdated = true;
          console.log('✅ 数据已更新');
        } else {
          console.log('❌ 没有找到authorization或cookie字段');
        }
      } else {
        console.log('❌ 没有requestHeaders');
      }
    }
    
    console.log('==================');
    
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
    urls: ["<all_urls>"]  // 监听所有URL，用于调试
  },
  ["requestHeaders"]
);

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_HEADER_DATA') {
    sendResponse(extractedData);
  }
});

// 插件安装时的初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 多站点Header提取器（调试版）已安装');
});
