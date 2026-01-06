// background.js - 监听网络请求并提取多种header字段（支持多商家）
let extractedData = {
  woaizuji: [],  // 爱租机商家列表
  rrzu: []       // 人人租商家列表
};

// 临时存储：等待商家信息的 token（避免显示不完整数据）
let pendingTokens = {
  woaizuji: null,  // { azjtk, url, timestamp, timeoutId }
  rrzu: null       // { authorization, cookie, url, timestamp, timeoutId }
};

// 超时时间：5秒后如果还没收到商家信息，就只保存 token（降级方案）
const PENDING_TIMEOUT = 5000;

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

// 更新或添加商家数据（仅当 merchantCode 和 merchantName 都存在时才保存）
function upsertMerchant(platform, newData) {
  const list = extractedData[platform];
  const merchantCode = newData.merchantCode;
  const merchantName = newData.merchantName;

  // 验证商家编码和名称都不为空
  if (!merchantCode || !merchantName) {
    console.log('⚠️ 商家编码或名称为空，暂存到临时记录:', newData);
    // 仅更新临时记录（用于后续合并 token 等信息）
    const tempIndex = list.findIndex(m => !m.merchantCode);
    if (tempIndex >= 0) {
      list[tempIndex] = { ...list[tempIndex], ...newData };
    } else {
      list.push(newData);
    }
    // 不调用 saveAndNotify，不保存到 storage
    return;
  }

  // 有 merchantCode 和 merchantName，按 merchantCode 匹配
  const index = list.findIndex(m => m.merchantCode === merchantCode);
  if (index >= 0) {
    // 更新现有商家
    list[index] = { ...list[index], ...newData };
  } else {
    // 查找临时记录并合并
    const tempIndex = list.findIndex(m => !m.merchantCode);
    if (tempIndex >= 0) {
      list[tempIndex] = { ...list[tempIndex], ...newData };
    } else {
      // 新增商家
      list.push(newData);
    }
  }

  // 保存并通知
  saveAndNotify();
}

// 保存等待中的 token（超时降级方案）
function savePendingToken(platform) {
  const pending = pendingTokens[platform];
  if (!pending) return;

  console.log(`💾 保存 ${platform} 的不完整数据（仅 token）`);

  // 清除超时
  if (pending.timeoutId) {
    clearTimeout(pending.timeoutId);
  }

  if (platform === 'woaizuji') {
    // 检查是否已存在相同 token 的记录
    const existingIndex = extractedData.woaizuji.findIndex(m => m.azjtk === pending.azjtk);
    if (existingIndex < 0) {
      extractedData.woaizuji.push({
        platform: 'aizuji',
        azjtk: pending.azjtk,
        url: pending.url,
        timestamp: pending.timestamp,
        merchantCode: null,
        merchantName: null
      });
    }
  } else if (platform === 'rrzu') {
    // 检查是否已存在相同 token 的记录
    const existingIndex = extractedData.rrzu.findIndex(m => m.authorization === pending.authorization);
    if (existingIndex < 0) {
      extractedData.rrzu.push({
        platform: 'renrenzu',
        authorization: pending.authorization,
        cookie: pending.cookie,
        url: pending.url,
        timestamp: pending.timestamp,
        merchantCode: null,
        merchantName: null
      });
    }
  }

  // 清除 pending 状态
  pendingTokens[platform] = null;

  // 保存并通知
  saveAndNotify();
}

// 合并 pending token 和商家信息（正常流程）
function mergePendingData(platform, merchantCode, merchantName) {
  const pending = pendingTokens[platform];
  if (!pending) {
    console.log(`⚠️ ${platform} 没有等待中的 token，创建新记录`);
    return null;
  }

  console.log(`✅ ${platform} token 和商家信息都到齐，合并保存`);

  // 清除超时
  if (pending.timeoutId) {
    clearTimeout(pending.timeoutId);
  }

  let mergedData;
  if (platform === 'woaizuji') {
    mergedData = {
      platform: 'aizuji',
      azjtk: pending.azjtk,
      merchantCode,
      merchantName,
      url: pending.url,
      timestamp: new Date().toLocaleString('zh-CN')
    };
  } else if (platform === 'rrzu') {
    mergedData = {
      platform: 'renrenzu',
      authorization: pending.authorization,
      cookie: pending.cookie,
      merchantCode,
      merchantName,
      url: pending.url,
      timestamp: new Date().toLocaleString('zh-CN')
    };
  }

  // 清除 pending 状态
  pendingTokens[platform] = null;

  return mergedData;
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
      console.log('🔍 检测到woaizuji订单请求:', details.url);

      if (details.requestHeaders) {
        for (let header of details.requestHeaders) {
          if (header.name.toLowerCase() === 'azjtk') {
            const tokenValue = header.value;

            // 检查是否已存在完整记录（有 token 和商家信息）
            const existingIndex = extractedData.woaizuji.findIndex(m =>
              m.azjtk === tokenValue && m.merchantCode && m.merchantName
            );

            if (existingIndex >= 0) {
              // 已有完整记录，只更新时间戳
              console.log('✅ woaizuji token 已存在完整记录，更新时间戳');
              extractedData.woaizuji[existingIndex].timestamp = new Date().toLocaleString('zh-CN');
              extractedData.woaizuji[existingIndex].url = details.url;
              saveAndNotify();
            } else {
              // 清除之前的超时（如果有）
              if (pendingTokens.woaizuji?.timeoutId) {
                clearTimeout(pendingTokens.woaizuji.timeoutId);
              }

              // 暂存 token，等待商家信息
              console.log('⏳ woaizuji token 已提取，等待商家信息...');
              const timeoutId = setTimeout(() => {
                console.log('⏱️ woaizuji 等待超时，保存不完整数据');
                savePendingToken('woaizuji');
              }, PENDING_TIMEOUT);

              pendingTokens.woaizuji = {
                azjtk: tokenValue,
                url: details.url,
                timestamp: new Date().toLocaleString('zh-CN'),
                timeoutId
              };
            }
            break;
          }
        }
      }
    }

    // 检查rrzu网站的请求
    if (details.url.includes('rrzu')) {
      console.log('🔍 检测到rrzu请求:', details.url);

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
          // 检查是否已存在完整记录
          const existingIndex = extractedData.rrzu.findIndex(m =>
            m.authorization === authorization && m.merchantCode && m.merchantName
          );

          if (existingIndex >= 0) {
            // 已有完整记录，只更新时间戳
            console.log('✅ rrzu token 已存在完整记录，更新时间戳');
            extractedData.rrzu[existingIndex].timestamp = new Date().toLocaleString('zh-CN');
            extractedData.rrzu[existingIndex].url = details.url;
            if (cookie) extractedData.rrzu[existingIndex].cookie = cookie;
            saveAndNotify();
          } else if (authorization) {
            // 清除之前的超时（如果有）
            if (pendingTokens.rrzu?.timeoutId) {
              clearTimeout(pendingTokens.rrzu.timeoutId);
            }

            // 暂存 token，等待商家信息
            console.log('⏳ rrzu token 已提取，等待商家信息...');
            const timeoutId = setTimeout(() => {
              console.log('⏱️ rrzu 等待超时，保存不完整数据');
              savePendingToken('rrzu');
            }, PENDING_TIMEOUT);

            pendingTokens.rrzu = {
              authorization,
              cookie,
              url: details.url,
              timestamp: new Date().toLocaleString('zh-CN'),
              timeoutId
            };
          }
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
      // 尝试从 pending 中合并数据
      const mergedData = mergePendingData('woaizuji', merchantCode, merchantName);

      if (mergedData) {
        // 有等待中的 token，合并后保存
        const existingIndex = extractedData.woaizuji.findIndex(m =>
          m.merchantCode === merchantCode || m.azjtk === mergedData.azjtk
        );

        if (existingIndex >= 0) {
          // 更新现有记录
          extractedData.woaizuji[existingIndex] = { ...extractedData.woaizuji[existingIndex], ...mergedData };
        } else {
          // 新增记录
          extractedData.woaizuji.push(mergedData);
        }
        console.log('✅ woaizuji 完整数据已保存:', mergedData);
      } else {
        // 没有等待中的 token，查找现有记录或创建新记录
        let index = extractedData.woaizuji.findIndex(m => m.merchantCode === merchantCode);

        if (index >= 0) {
          // 更新现有记录
          extractedData.woaizuji[index].merchantCode = merchantCode;
          extractedData.woaizuji[index].merchantName = merchantName;
          extractedData.woaizuji[index].timestamp = new Date().toLocaleString('zh-CN');
        } else {
          // 创建新记录（只有商家信息，没有 token）
          extractedData.woaizuji.push({
            platform: 'aizuji',
            merchantCode,
            merchantName,
            azjtk: null,
            timestamp: new Date().toLocaleString('zh-CN'),
            url: null
          });
        }
        console.log('✅ woaizuji 商家信息已保存（无 token）:', merchantCode, merchantName);
      }

      saveAndNotify();

    } else if (site === 'rrzu_order') {
      // 尝试从 pending 中合并数据
      const mergedData = mergePendingData('rrzu', merchantCode, merchantName);

      if (mergedData) {
        // 有等待中的 token，合并后保存
        const existingIndex = extractedData.rrzu.findIndex(m =>
          m.merchantCode === merchantCode || m.authorization === mergedData.authorization
        );

        if (existingIndex >= 0) {
          // 更新现有记录
          extractedData.rrzu[existingIndex] = { ...extractedData.rrzu[existingIndex], ...mergedData };
        } else {
          // 新增记录
          extractedData.rrzu.push(mergedData);
        }
        console.log('✅ rrzu 完整数据已保存:', mergedData);
      } else {
        // 没有等待中的 token，查找现有记录或创建新记录
        let index = extractedData.rrzu.findIndex(m => m.merchantCode === merchantCode);

        if (index >= 0) {
          // 更新现有记录
          extractedData.rrzu[index].merchantCode = merchantCode;
          extractedData.rrzu[index].merchantName = merchantName;
          extractedData.rrzu[index].timestamp = new Date().toLocaleString('zh-CN');
        } else {
          // 创建新记录（只有商家信息，没有 token）
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
        console.log('✅ rrzu 商家信息已保存（无 token）:', merchantCode, merchantName);
      }

      saveAndNotify();
    }

  } else if (request.type === 'CLEAR_DATA') {
    extractedData = { woaizuji: [], rrzu: [] };
    // 清除所有 pending tokens
    if (pendingTokens.woaizuji?.timeoutId) {
      clearTimeout(pendingTokens.woaizuji.timeoutId);
    }
    if (pendingTokens.rrzu?.timeoutId) {
      clearTimeout(pendingTokens.rrzu.timeoutId);
    }
    pendingTokens = { woaizuji: null, rrzu: null };
    saveAndNotify();
    sendResponse({ success: true });
  }
});

// 监听外部网页的消息请求（用于跨域通信）
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('📨 [External Message] 收到外部请求:', { message, sender: sender.origin });

  // 验证来源域名
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://8.148.254.149'
  ];

  const isAllowedOrigin = allowedOrigins.some(origin => sender.origin?.startsWith(origin));

  if (!isAllowedOrigin) {
    console.error('❌ [External Message] 未授权的域名:', sender.origin);
    sendResponse({ success: false, error: 'UNAUTHORIZED_ORIGIN' });
    return;
  }

  // 处理读取 storage 请求
  if (message.action === 'READ_STORAGE') {
    const key = message.key;
    console.log('🔍 [External Message] 读取存储:', key);

    chrome.storage.local.get(key, (data) => {
      if (chrome.runtime.lastError) {
        console.error('❌ [External Message] 读取失败:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('✅ [External Message] 读取成功:', data[key]);
        sendResponse({ success: true, data: data[key] || null });
      }
    });

    return true; // 保持异步通道开启
  }

  // 处理获取商家数据请求
  if (message.action === 'GET_MERCHANT_DATA') {
    console.log('🔍 [External Message] 获取商家数据');
    sendResponse({ success: true, data: extractedData });
    return true;
  }

  // 未知请求类型
  console.warn('⚠️ [External Message] 未知请求类型:', message.action);
  sendResponse({ success: false, error: 'UNKNOWN_ACTION' });
});

// 插件安装时的初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('租赁信息提取插件已安装');
});
