// popup.js - 弹出窗口的交互逻辑
document.addEventListener('DOMContentLoaded', function() {
    const statusElement = document.getElementById('status');
    const statusIcon = statusElement.querySelector('.status-icon');
    const statusText = statusElement.querySelector('.status-text');
    const merchantList = document.getElementById('merchantList');
    const refreshBtn = document.getElementById('refreshBtn');
    const clearBtn = document.getElementById('clearBtn');

    // 更新状态显示
    function updateStatus(type, message) {
        statusElement.className = `status ${type}`;
        const icons = { waiting: '⏳', success: '✅', partial: '🔄', error: '❌' };
        statusIcon.textContent = icons[type] || '⏳';
        statusText.textContent = message;
    }

    // 生成商家卡片HTML
    function createMerchantCard(platform, data) {
        const platformNames = { woaizuji: '爱租机', rrzu: '人人租' };
        const platformName = platformNames[platform] || platform;

        // 获取认证字段
        let authField = '';
        if (platform === 'woaizuji' && data.azjtk) {
            authField = `
                <div class="info-row auth-row">
                    <span class="label">Token</span>
                    <div class="auth-value">
                        <span class="value secret" data-value="${escapeHtml(data.azjtk)}">••••••••</span>
                        <span class="toggle-eye" title="显示/隐藏">👁</span>
                        <span class="copy-btn" data-copy="${escapeHtml(data.azjtk)}" title="复制">📋</span>
                    </div>
                </div>`;
        } else if (platform === 'rrzu') {
            if (data.authorization) {
                authField += `
                <div class="info-row auth-row">
                    <span class="label">Auth</span>
                    <div class="auth-value">
                        <span class="value secret" data-value="${escapeHtml(data.authorization)}">••••••••</span>
                        <span class="toggle-eye" title="显示/隐藏">👁</span>
                        <span class="copy-btn" data-copy="${escapeHtml(data.authorization)}" title="复制">📋</span>
                    </div>
                </div>`;
            }
            if (data.cookie) {
                authField += `
                <div class="info-row auth-row">
                    <span class="label">Cookie</span>
                    <div class="auth-value">
                        <span class="value secret" data-value="${escapeHtml(data.cookie)}">••••••••</span>
                        <span class="toggle-eye" title="显示/隐藏">👁</span>
                        <span class="copy-btn" data-copy="${escapeHtml(data.cookie)}" title="复制">📋</span>
                    </div>
                </div>`;
            }
        }

        return `
            <div class="merchant-card" data-platform="${platform}">
                <div class="card-header">
                    <span class="platform-tag ${platform}">${platformName}</span>
                    <span class="merchant-name">${data.merchantName || '未知商家'}</span>
                </div>
                <div class="card-body">
                    <div class="info-row">
                        <span class="label">商家编码</span>
                        <span class="value">${data.merchantCode || '-'}</span>
                    </div>
                    ${authField}
                    <div class="info-row">
                        <span class="label">提取时间</span>
                        <span class="value time">${data.timestamp || '-'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // HTML转义
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;');
    }

    // 切换显示/隐藏 & 复制
    document.addEventListener('click', async function(e) {
        // 显示/隐藏切换
        if (e.target.classList.contains('toggle-eye')) {
            const secretSpan = e.target.parentElement.querySelector('.secret');
            if (secretSpan.classList.contains('visible')) {
                secretSpan.textContent = '••••••••';
                secretSpan.classList.remove('visible');
                e.target.textContent = '👁';
            } else {
                secretSpan.textContent = secretSpan.dataset.value;
                secretSpan.classList.add('visible');
                e.target.textContent = '🙈';
            }
        }

        // 复制功能
        if (e.target.classList.contains('copy-btn')) {
            const value = e.target.dataset.copy;
            if (!value) return;

            try {
                await navigator.clipboard.writeText(value);
                e.target.textContent = '✅';
                setTimeout(() => { e.target.textContent = '📋'; }, 1000);
            } catch (err) {
                // 降级方案
                const textarea = document.createElement('textarea');
                textarea.value = value;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                e.target.textContent = '✅';
                setTimeout(() => { e.target.textContent = '📋'; }, 1000);
            }
        }
    });

    // 显示提取的数据
    function displayData(data) {
        merchantList.innerHTML = '';

        // 验证商家对象：必须同时有 merchantCode 和 merchantName
        const isValidMerchant = (value) =>
            value && typeof value === 'object' && value.merchantCode && value.merchantName;

        const normalizeMerchants = (raw) => {
            if (!raw) return [];
            if (Array.isArray(raw)) return raw.filter(isValidMerchant);
            if (isValidMerchant(raw)) return [raw];
            if (typeof raw === 'object') {
                return Object.values(raw).filter(isValidMerchant);
            }
            return [];
        };

        const woaizujiList = normalizeMerchants(data?.woaizuji);
        const rrzuList = normalizeMerchants(data?.rrzu);

        if (woaizujiList.length > 0) {
            woaizujiList.forEach((merchant) => {
                merchantList.innerHTML += createMerchantCard('woaizuji', merchant);
            });
        }

        if (rrzuList.length > 0) {
            rrzuList.forEach((merchant) => {
                merchantList.innerHTML += createMerchantCard('rrzu', merchant);
            });
        }

        // 更新总体状态
        if (woaizujiList.length > 0 || rrzuList.length > 0) {
            const parts = [];
            if (woaizujiList.length > 0) {
                parts.push(`爱租机 ${woaizujiList.length} 个`);
            }
            if (rrzuList.length > 0) {
                parts.push(`人人租 ${rrzuList.length} 个`);
            }
            const statusType = woaizujiList.length > 0 && rrzuList.length > 0 ? 'success' : 'partial';
            updateStatus(statusType, `已提取 ${parts.join('，')}`);
        } else {
            updateStatus('waiting', '等待数据...');
        }
    }

    // 加载数据
    function loadData() {
        chrome.runtime.sendMessage({type: 'GET_HEADER_DATA'}, (response) => {
            if (chrome.runtime.lastError) {
                console.error('获取数据失败:', chrome.runtime.lastError);
                updateStatus('error', '获取数据失败');
                return;
            }
            displayData(response);
        });

        chrome.storage.local.get(['extractedData'], (result) => {
            if (result.extractedData) {
                displayData(result.extractedData);
            }
        });
    }

    // 刷新数据
    refreshBtn.addEventListener('click', loadData);

    // 清空数据
    clearBtn.addEventListener('click', () => {
        chrome.storage.local.remove(['extractedData'], () => {
            merchantList.innerHTML = '';
            updateStatus('waiting', '数据已清空');
        });
    });

    // 监听来自background的消息
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'HEADER_EXTRACTED') {
            displayData(message.data);
        }
    });

    // 初始加载
    loadData();
});
