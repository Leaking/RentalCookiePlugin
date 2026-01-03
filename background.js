// background.js - 监听网络请求并提取多种header字段（支持多商家）
let extractedData = {
  woaizuji: [],  // 爱租机商家列表
  rrzu: []       // 人人租商家列表
};

// 从storage恢复数据
chrome.storage.local.get(['extractedData'], (result) => {
  if (result.extractedData) {
    // 兼容旧数据格式
    if (Array.isArray(result.extractedData.woaizuji)) {
      extractedData = result.extractedData;
    } else {
      // 转换旧格式到新格式
      extractedData = { woaizuji: [], rrzu: [] };
      if (result.extractedData.woaizuji && result.extractedData.woaizuji.merchantCode) {
        extractedData.woaizuji.push(result.extractedData.woaizuji);
      }
      if (result.extractedData.rrzu && result.extractedData.rrzu.merchantCode) {
        extractedData.rrzu.push(result.extractedData.rrzu);
      }
    }
  }
});

// 更新或添加商家数据
function upsertMerchant(platform, newData) {
  const list = extractedData[platform];
  const merchantCode = newData.merchantCode;

  if (merchantCode) {
    // 有 merchantCode，按 merchantCode 匹配
    const index = list.findIndex(m => m.merchantCode === merchantCode);
    if (index >= 0) {
      // 更新现有商家
      list[index] = { ...list[index], ...newData };
    } else {
      // 新增商家
      list.push(newData);
    }
  } else {
    // 没有 merchantCode，创建临时记录（等待后续补充）
    // 查找是否有未绑定 merchantCode 的临时记录
    const tempIndex = list.findIndex(m => !m.merchantCode);
    if (tempIndex >= 0) {
      list[tempIndex] = { ...list[tempIndex], ...newData };
    } else {
      list.push(newData);
    }
  }

  // 保存并通知
  saveAndNotify();
}

// 保存数据并通知
function saveAndNotify(tabId) {
  chrome.storage.local.set({ extractedData });

  // 通知所有tab
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'HEADER_EXTRACTED',
        data: extractedData
      }).catch(() => {});
    });
  });
}

// 监听网络请求
chrome.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    // 检查woaizuji网站的订单列表请求
    if (details.url.includes('external-gw.woaizuji.com/merchantTeamwork/inside_route_page/merchantOrder/orderList')) {
      console.log('检测到woaizuji订单请求:', details.url);

      if (details.requestHeaders) {
        for (let header of details.requestHeaders) {
          if (header.name.toLowerCase() === 'azjtk') {
            // 先查找是否有匹配此 token 的记录
            const existingIndex = extractedData.woaizuji.findIndex(m => m.azjtk === header.value);
            if (existingIndex >= 0) {
              // 更新时间戳
              extractedData.woaizuji[existingIndex].timestamp = new Date().toLocaleString('zh-CN');
              extractedData.woaizuji[existingIndex].url = details.url;
            } else {
              // 新增临时记录，等待商家信息
              extractedData.woaizuji.push({
                platform: 'aizuji',
                azjtk: header.value,
                timestamp: new Date().toLocaleString('zh-CN'),
                url: details.url,
                merchantCode: null,
                merchantName: null
              });
            }
            saveAndNotify();
            break;
          }
        }
      }
    }

    // 检查rrzu网站的请求
    if (details.url.includes('rrzu')) {
      console.log('检测到rrzu请求:', details.url);

      if (details.requestHeaders) {
        let authorization = null;
        let cookie = null;

        for (let header of details.requestHeaders) {
          const headerName = header.name.toLowerCase();
          if (headerName === 'authorization') {
            authorization = header.value;
          } else if (headerName === 'cookie') {
            cookie = header.value;
          }
        }

        if (authorization || cookie) {
          // 查找是否有匹配此 authorization 的记录
          const existingIndex = extractedData.rrzu.findIndex(m =>
            m.authorization && m.authorization === authorization
          );

          if (existingIndex >= 0) {
            // 更新现有记录
            extractedData.rrzu[existingIndex].timestamp = new Date().toLocaleString('zh-CN');
            extractedData.rrzu[existingIndex].url = details.url;
            if (cookie) extractedData.rrzu[existingIndex].cookie = cookie;
          } else if (authorization) {
            // 新增临时记录
            extractedData.rrzu.push({
              platform: 'renrenzu',
              authorization,
              cookie,
              timestamp: new Date().toLocaleString('zh-CN'),
              url: details.url,
              merchantCode: null,
              merchantName: null
            });
          }
          saveAndNotify();
        }
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

// 监听来自popup和content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_HEADER_DATA') {
    sendResponse(extractedData);
  } else if (request.type === 'MERCHANT_INFO_EXTRACTED') {
    const site = request.site;
    const { merchantCode, merchantName } = request.data;

    if (!merchantCode) return;

    if (site === 'woaizuji') {
      // 查找匹配的记录（优先按 merchantCode，其次按无 merchantCode 的临时记录）
      let index = extractedData.woaizuji.findIndex(m => m.merchantCode === merchantCode);
      if (index < 0) {
        index = extractedData.woaizuji.findIndex(m => !m.merchantCode);
      }

      if (index >= 0) {
        extractedData.woaizuji[index].merchantCode = merchantCode;
        extractedData.woaizuji[index].merchantName = merchantName;
        extractedData.woaizuji[index].timestamp = new Date().toLocaleString('zh-CN');
      } else {
        // 创建新记录
        extractedData.woaizuji.push({
          platform: 'aizuji',
          merchantCode,
          merchantName,
          azjtk: null,
          timestamp: new Date().toLocaleString('zh-CN'),
          url: null
        });
      }
      console.log('✅ 更新woaizuji商家:', merchantCode, merchantName);
    } else if (site === 'rrzu_order') {
      let index = extractedData.rrzu.findIndex(m => m.merchantCode === merchantCode);
      if (index < 0) {
        index = extractedData.rrzu.findIndex(m => !m.merchantCode);
      }

      if (index >= 0) {
        extractedData.rrzu[index].merchantCode = merchantCode;
        extractedData.rrzu[index].merchantName = merchantName;
        extractedData.rrzu[index].timestamp = new Date().toLocaleString('zh-CN');
      } else {
        extractedData.rrzu.push({
          platform: 'renrenzu',
          merchantCode,
          merchantName,
          authorization: null,
          cookie: null,
          timestamp: new Date().toLocaleString('zh-CN'),
          url: null
        });
      }
      console.log('✅ 更新rrzu商家:', merchantCode, merchantName);
    }

    saveAndNotify();
  } else if (request.type === 'CLEAR_DATA') {
    extractedData = { woaizuji: [], rrzu: [] };
    saveAndNotify();
    sendResponse({ success: true });
  }
});

// 插件安装时的初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('租赁信息提取插件已安装');
});
