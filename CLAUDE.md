# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension that extracts authentication credentials and merchant information from two rental platforms: 爱租机 (woaizuji.com) and 人人租 (rrzu.com). The extension intercepts API responses to extract tokens and merchant details, displaying them in a popup interface.

## Architecture

### Multi-Layer Interception System

The extension uses a **three-layer architecture** to bypass Content Security Policy (CSP) restrictions and extract data from network responses:

1. **background.js (Service Worker)**
   - Monitors network requests using `chrome.webRequest.onBeforeSendHeaders`
   - Extracts authentication headers (`azjtk`, `authorization`, `cookie`) from **request headers**
   - Stores incomplete merchant records (tokens without merchant info) temporarily
   - Manages the central data store (`extractedData`) with two arrays: `woaizuji[]` and `rrzu[]`

2. **content.js (Isolated Context)**
   - Runs in the page's isolated content script context
   - Injects `injected.js` into the page's main world using `chrome.runtime.getURL()`
   - Acts as a message relay between `injected.js` (main world) and `background.js` (service worker)
   - Manages localStorage storage for cross-domain data access (via `STORAGE_KEY: 'aizuji_plugin_merchant_data'`)
   - Handles `postMessage` events from both the page and injected script

3. **injected.js (Page Main World)**
   - Runs in the page's main JavaScript context (bypasses CSP)
   - Intercepts `fetch()` and `XMLHttpRequest` responses to read API response bodies
   - Extracts merchant information (`merchantCode`, `merchantName`) from response data
   - Sends extracted data to `content.js` via `window.postMessage()`

### Data Flow

```
Network Request → background.js (extracts token from headers)
                ↓
         Saves incomplete record {token: "xxx", merchantCode: null}
                ↓
API Response → injected.js (reads response body)
                ↓
         Extracts {merchantCode: "123", merchantName: "店铺名"}
                ↓
         postMessage → content.js → background.js
                ↓
         Merges data {token: "xxx", merchantCode: "123", merchantName: "店铺名"}
                ↓
         popup.js displays complete data
```

### Data Extraction Targets

**爱租机 (woaizuji):**
- API URL: `external-gw.woaizuji.com/merchantTeamwork/inside_route_page/merchantOrder/orderList`
- Token location: Request header `azjtk`
- Merchant info: `responseData.data.data[0].merchantCode` and `.merchantName`

**人人租 (rrzu):**
- API URL: `go-micro.rrzu.com/order/orderList`
- Token location: Request headers `authorization` and `cookie`
- Merchant info: `responseData.data.order_list[0].base_info.server_id` and `.shop_name`

### Key Data Structure

```javascript
extractedData = {
  woaizuji: [{
    platform: 'aizuji',
    azjtk: 'token-value',
    merchantCode: '123',
    merchantName: '商家名称',
    timestamp: '2024-01-06 12:00:00',
    url: 'request-url'
  }],
  rrzu: [{
    platform: 'renrenzu',
    authorization: 'xxx',
    merchantCode: '456',
    merchantName: '店铺名',
    timestamp: '2024-01-06 12:00:00',
    url: 'request-url'
  }]
}
```

### Partial Data Handling

The extension now **displays incomplete records** with "等待提取..." placeholders:
- If only token is extracted, show token + waiting state for merchant info
- When merchant info arrives later, automatically merge and update display
- Validation in `popup.js` accepts records with **any** useful data (token OR merchant info)

## External Communication Bridge

### Overview

The extension implements a **multi-layer communication system** to enable reliable data exchange with external web applications (like management systems). The system prioritizes reliability through multiple fallback methods.

### Architecture

**Primary Method: chrome.runtime.sendMessage (Recommended)**

```
External Website → chrome.runtime.sendMessage(extensionId, request)
                 ↓
         background.js receives via onMessageExternal
                 ↓
         Validates sender.origin against allowedOrigins
                 ↓
         Returns extractedData via sendResponse()
                 ↓
         Direct response to caller (most reliable)
```

**Fallback Methods:**
1. **localStorage** - Plugin writes to current page's localStorage
2. **postMessage** - Cross-document messaging (legacy support)

### Environment Variables

For multi-environment deployment (Dev/Staging/Prod), configure:

- `VITE_EXTENSION_ID` / `PROCESS.ENV.EXTENSION_ID` - Extension's public key ID
- `VITE_ALLOWED_DOMAIN` - Domain pattern for `externally_connectable`

### Implementation

**A. Manifest Configuration**

The manifest includes `externally_connectable` to allow external websites to communicate with the extension:

**Current Configuration** (manifest.json:48-55):
```json
{
  "manifest_version": 3,
  "permissions": ["storage"],
  "externally_connectable": {
    "matches": [
      "http://localhost:3000/*",
      "http://127.0.0.1:3000/*",
      "http://8.148.254.149/*",
      "http://8.148.254.149:*/*"
    ]
  }
}
```

Content script injection (manifest.json:27-36):
```json
"content_scripts": [
  {
    "matches": [
      "http://localhost:3000/*",
      "http://127.0.0.1:3000/*",
      "http://8.148.254.149/*",
      "http://8.148.254.149:*/*"
    ],
    "js": ["content.js"],
    "run_at": "document_start",
    "all_frames": true
  }
]
```

**B. Background Script Handler**

Current implementation in `background.js` (lines 229-276):

```javascript
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

  // 处理读取 storage 请求（用于读取 chrome.storage.local）
  if (message.action === 'READ_STORAGE') {
    const key = message.key;
    chrome.storage.local.get(key, (data) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, data: data[key] || null });
      }
    });
    return true; // CRITICAL: Keep async channel open
  }

  // 处理获取商家数据请求（直接返回 extractedData）
  if (message.action === 'GET_MERCHANT_DATA') {
    sendResponse({ success: true, data: extractedData });
    return true;
  }

  // 未知请求类型
  sendResponse({ success: false, error: 'UNKNOWN_ACTION' });
});
```

**C. Website Integration (External App)**

**Multi-Layer Communication Strategy:**

Current implementation in `MultiPlatformLoginForm.tsx` (lines 415-505):

```javascript
// 优先级1: chrome.runtime.sendMessage（最可靠）
const getPluginDataViaRuntime = async (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      reject('CHROME_RUNTIME_NOT_AVAILABLE');
      return;
    }

    // 如果配置了扩展ID，使用它；否则尝试直接调用
    const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || null;
    const sendMessageFn = EXTENSION_ID
      ? (msg: any, callback: any) => chrome.runtime.sendMessage(EXTENSION_ID, msg, callback)
      : (msg: any, callback: any) => chrome.runtime.sendMessage(msg, callback);

    sendMessageFn({ action: 'GET_MERCHANT_DATA' }, (response: any) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message);
      } else if (response && response.success) {
        resolve(response.data);
      } else {
        reject(response?.error || 'DATA_FETCH_FAILED');
      }
    });
  });
};

// 优先级2: localStorage（插件写入当前页面）
const getCachedPluginData = () => {
  const cached = localStorage.getItem('aizuji_plugin_merchant_data');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      return null;
    }
  }
  return null;
};

// 优先级3: postMessage（fallback）
window.postMessage({ type: 'AIZUJI_PLUGIN_REQUEST_DATA' }, '*');
```

**Usage Example:**

```javascript
// 请求插件数据（自动尝试所有方法）
const requestPluginData = async () => {
  // 1. 尝试 chrome.runtime.sendMessage
  try {
    const data = await getPluginDataViaRuntime();
    if (data) return data;
  } catch (error) {
    console.log('chrome.runtime 失败，尝试其他方式');
  }

  // 2. 尝试 localStorage
  const cached = getCachedPluginData();
  if (cached) return cached;

  // 3. 使用 postMessage（legacy）
  window.postMessage({ type: 'AIZUJI_PLUGIN_REQUEST_DATA' }, '*');
};
```

**D. Content Script Bridge (Current Implementation)**

The extension also supports `postMessage` communication (content.js:128-145):

```javascript
// External website sends request
window.postMessage({ type: 'AIZUJI_PLUGIN_REQUEST_DATA' }, '*');

// Extension responds with data
window.addEventListener('message', (event) => {
  if (event.data.type === 'AIZUJI_PLUGIN_DATA_RESPONSE') {
    const merchantData = event.data.data;
    // Use the data...
  }
});
```

### Security Considerations

1. **Extension ID Fixation**: Use the `key` field in manifest to fix extension ID in development (prevents ID drift breaking `chrome.runtime.sendMessage`)
2. **Origin Validation**: Always validate `sender.origin` in `onMessageExternal` handler
3. **Protocol Enforcement**:
   - Development: Allow `http://` for localhost
   - Production: Enforce `https://` only
4. **Data Access Control**: Only expose non-sensitive data or implement additional authentication

### Storage Key Reference

- `aizuji_plugin_merchant_data` - Unified merchant data (used by external apps via localStorage/chrome.storage)
- `extractedData` - Internal extension data store (woaizuji and rrzu arrays)

## Development Commands

### Loading the Extension

```bash
# 1. Open Chrome and navigate to chrome://extensions/
# 2. Enable "Developer mode" (top right)
# 3. Click "Load unpacked" and select this directory
```

### Reloading After Changes

```bash
# In chrome://extensions/, click the refresh icon on this extension
# Or use keyboard shortcut in the extensions page
```

### Building for Distribution

```bash
# Manual zip creation
zip -r aizuji-plugin.zip . \
  -x "*.git*" \
  -x "*.zip" \
  -x ".claude/*" \
  -x "references/*" \
  -x "create_icons.html" \
  -x "debug_background.js" \
  -x "README.md" \
  -x ".github/*"

# GitHub Actions automatically builds on push to main
# Artifact: aizuji-plugin.zip (retention: 30 days)
```

### Debugging

**Background Script Debugging:**
```bash
# Navigate to chrome://extensions/
# Click "Service worker" link under this extension
# OR open console: chrome://serviceworker-internals/
```

**Content Script Debugging:**
```bash
# Open DevTools on the target page (F12)
# Console shows logs prefixed with: [Content Script]
```

**Injected Script Debugging:**
```bash
# Open DevTools on the target page (F12)
# Console shows logs prefixed with: [Injected]
# Look for:
#   🚀 [Injected] 拦截器已注入到页面主世界
#   🎯 [Fetch] 匹配到orderList请求
#   📦 [完整响应] (shows intercepted data)
```

## Common Troubleshooting

### Data Not Extracting

1. **Check injection success:** Look for `🚀🚀🚀 [Injected] 拦截器已注入到页面主世界` in console
2. **Verify URL matching:** Check Network tab for actual API URLs, may need to update:
   - `WOAIZUJI_ORDER_LIST_URL` in `injected.js:10`
   - `RRZU_ORDER_LIST_URL` in `injected.js:12`
3. **Check response structure:** Look for `📦📦📦 [完整响应]` logs, verify data paths match code

### CSP Errors

If you see CSP errors blocking script injection:
- Verify `web_accessible_resources` in `manifest.json:45-49` includes `injected.js`
- Ensure `content.js` uses `chrome.runtime.getURL()` for injection
- The external script injection method should bypass most CSP restrictions

### API Structure Changed

If extraction fails after platform updates:
1. Check console for `📦 [完整响应]` to see new structure
2. Update extraction paths in `injected.js`:
   - `extractWoaizujiMerchantInfo()` at line 42
   - `extractRrzuOrderMerchantInfo()` at line 65

## File Reference

- `manifest.json` - Extension configuration (permissions, content scripts, background worker)
- `background.js` - Service worker, monitors request headers, manages central data store
- `content.js` - Injects `injected.js`, relays messages, manages localStorage sync
- `injected.js` - Main world script, intercepts fetch/XHR responses, extracts merchant info
- `popup.html/js/css` - UI for displaying extracted data with copy functionality
- `references/orderlist.json` - Sample API response data for reference
