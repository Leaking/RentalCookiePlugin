// popup.js - 弹出窗口的交互逻辑
document.addEventListener('DOMContentLoaded', function() {
    const statusElement = document.getElementById('status');
    const statusIcon = statusElement.querySelector('.status-icon');
    const statusText = statusElement.querySelector('.status-text');
    
    // Woaizuji 元素
    const woaizujiSection = document.getElementById('woaizujiSection');
    const woaizujiStatus = document.getElementById('woaizujiStatus');
    const azjtkValue = document.getElementById('azjtkValue');
    const woaizujiTimestamp = document.getElementById('woaizujiTimestamp');
    const woaizujiUrl = document.getElementById('woaizujiUrl');
    
    // Woaizuji 商家信息元素
    const woaizujiMerchantCode = document.getElementById('woaizujiMerchantCode');
    const woaizujiMerchantName = document.getElementById('woaizujiMerchantName');

    // RRZU 元素
    const rrzuSection = document.getElementById('rrzuSection');
    const rrzuStatus = document.getElementById('rrzuStatus');
    const authorizationValue = document.getElementById('authorizationValue');
    const cookieValue = document.getElementById('cookieValue');
    const rrzuTimestamp = document.getElementById('rrzuTimestamp');
    const rrzuUrl = document.getElementById('rrzuUrl');
    
    const refreshBtn = document.getElementById('refreshBtn');
    const clearBtn = document.getElementById('clearBtn');

    // 更新状态显示
    function updateStatus(type, message) {
        statusElement.className = `status ${type}`;
        
        switch(type) {
            case 'waiting':
                statusIcon.textContent = '⏳';
                break;
            case 'success':
                statusIcon.textContent = '✅';
                break;
            case 'partial':
                statusIcon.textContent = '🔄';
                break;
            case 'error':
                statusIcon.textContent = '❌';
                break;
        }
        
        statusText.textContent = message;
    }

    // 显示Woaizuji数据
    function displayWoaizujiData(data) {
        if (data && (data.azjtk || data.merchantCode || data.merchantName)) {
            azjtkValue.value = data.azjtk || '';
            woaizujiMerchantCode.value = data.merchantCode || '';
            woaizujiMerchantName.value = data.merchantName || '';
            woaizujiTimestamp.textContent = data.timestamp || '未知';
            woaizujiUrl.textContent = data.url || '未知';
            woaizujiStatus.textContent = '✅ 已提取';
            woaizujiStatus.className = 'site-status success';
            woaizujiSection.style.display = 'block';
        } else {
            woaizujiStatus.textContent = '⏳ 等待数据';
            woaizujiStatus.className = 'site-status waiting';
            woaizujiSection.style.display = 'none';
        }
    }

    // 显示RRZU数据
    function displayRrzuData(data) {
        if (data && (data.authorization || data.cookie)) {
            authorizationValue.value = data.authorization || '';
            cookieValue.value = data.cookie || '';
            rrzuTimestamp.textContent = data.timestamp || '未知';
            rrzuUrl.textContent = data.url || '未知';
            rrzuStatus.textContent = '✅ 已提取';
            rrzuStatus.className = 'site-status success';
            rrzuSection.style.display = 'block';
        } else {
            rrzuStatus.textContent = '⏳ 等待数据';
            rrzuStatus.className = 'site-status waiting';
            rrzuSection.style.display = 'none';
        }
    }

    // 显示提取的数据
    function displayData(data) {
        let hasWoaizujiData = data && data.woaizuji && (data.woaizuji.azjtk || data.woaizuji.merchantCode || data.woaizuji.merchantName);
        let hasRrzuData = data && data.rrzu && (data.rrzu.authorization || data.rrzu.cookie);
        
        displayWoaizujiData(data ? data.woaizuji : null);
        displayRrzuData(data ? data.rrzu : null);
        
        // 更新总体状态
        if (hasWoaizujiData && hasRrzuData) {
            updateStatus('success', '已提取两个网站的数据');
        } else if (hasWoaizujiData || hasRrzuData) {
            updateStatus('partial', '已提取部分网站数据');
        } else {
            updateStatus('waiting', '等待请求...');
        }
    }

    // 加载数据
    function loadData() {
        // 从background script获取数据
        chrome.runtime.sendMessage({type: 'GET_HEADER_DATA'}, (response) => {
            if (chrome.runtime.lastError) {
                console.error('获取数据失败:', chrome.runtime.lastError);
                updateStatus('error', '获取数据失败');
                return;
            }
            
            displayData(response);
        });

        // 也从storage获取数据
        chrome.storage.local.get(['extractedData'], (result) => {
            if (result.extractedData) {
                displayData(result.extractedData);
            }
        });
    }

    // 为所有复制按钮添加事件监听器
    document.addEventListener('click', function(event) {
        if (event.target.classList.contains('copy-btn')) {
            const targetId = event.target.getAttribute('data-copy-target');
            if (targetId) {
                copyValue(targetId);
            }
        }
    });

    // 复制功能
    async function copyValue(elementId) {
        const element = document.getElementById(elementId);
        const value = element.value || element.textContent;
        
        if (!value || value.trim() === '') {
            alert('没有可复制的内容');
            return;
        }
        
        console.log('尝试复制内容:', value.substring(0, 50) + '...');
        
        try {
            // 首先尝试现代 Clipboard API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(value);
                console.log('使用 Clipboard API 复制成功');
            } else {
                throw new Error('Clipboard API 不可用');
            }
            
            // 显示复制成功反馈
            const copyBtn = element.parentNode.querySelector('.copy-btn');
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✅';
            copyBtn.style.backgroundColor = '#4CAF50';
            
            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.backgroundColor = '';
            }, 1000);
            
        } catch (err) {
            console.error('Clipboard API 复制失败:', err);
            
            // 降级方案1：使用 document.execCommand
            try {
                // 创建临时文本区域
                const tempTextArea = document.createElement('textarea');
                tempTextArea.value = value;
                tempTextArea.style.position = 'fixed';
                tempTextArea.style.left = '-999999px';
                tempTextArea.style.top = '-999999px';
                document.body.appendChild(tempTextArea);
                
                tempTextArea.focus();
                tempTextArea.select();
                
                const success = document.execCommand('copy');
                document.body.removeChild(tempTextArea);
                
                if (success) {
                    console.log('使用 execCommand 复制成功');
                    const copyBtn = element.parentNode.querySelector('.copy-btn');
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '✅';
                    copyBtn.style.backgroundColor = '#4CAF50';
                    
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.style.backgroundColor = '';
                    }, 1000);
                } else {
                    throw new Error('execCommand 复制失败');
                }
                
            } catch (e) {
                console.error('所有复制方法都失败了:', e);
                
                // 最后的降级方案：选中文本让用户手动复制
                element.focus();
                element.select();
                
                const copyBtn = element.parentNode.querySelector('.copy-btn');
                copyBtn.textContent = '⚠️';
                copyBtn.style.backgroundColor = '#ff9800';
                
                alert('自动复制失败，内容已选中，请按 Ctrl+C (或 Cmd+C) 手动复制');
                
                setTimeout(() => {
                    copyBtn.textContent = '📋';
                    copyBtn.style.backgroundColor = '';
                }, 2000);
            }
        }
    }

    // 刷新数据
    refreshBtn.addEventListener('click', () => {
        loadData();
    });

    // 清空数据
    clearBtn.addEventListener('click', () => {
        chrome.storage.local.remove(['extractedData'], () => {
            woaizujiSection.style.display = 'none';
            rrzuSection.style.display = 'none';
            updateStatus('waiting', '数据已清空，等待新请求...');
        });
    });

    // 监听来自background的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'HEADER_EXTRACTED') {
            displayData(message.data);
        }
    });

    // 初始加载
    loadData();
});