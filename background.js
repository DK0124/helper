// BV SHOP 出貨助手 - 背景腳本 (2025 優化版 - 支援嘉里大榮)

// 定義支援的網站列表
const SUPPORTED_HOSTS = [
  'myship.7-11.com.tw',
  'epayment.7-11.com.tw',
  'eship.7-11.com.tw',
  'family.com.tw',
  'famiport.com.tw',
  'hilife.com.tw',
  'okmart.com.tw',
  'bvshop-manage.bvshop.tw'
];

// 物流單網站列表（需要自動注入）
const SHIPPING_HOSTS = [
  'myship.7-11.com.tw',
  'epayment.7-11.com.tw',
  'eship.7-11.com.tw',
  'family.com.tw',
  'famiport.com.tw',
  'hilife.com.tw',
  'okmart.com.tw'
];

// 檢查 URL 是否為支援的網站
function isSupportedUrl(url) {
  if (!url) return false;
  return SUPPORTED_HOSTS.some(host => url.includes(host));
}

// 檢查是否為物流單網站
function isShippingUrl(url) {
  if (!url) return false;
  return SHIPPING_HOSTS.some(host => url.includes(host));
}

// 檢查是否為嘉里大榮頁面
function isKTJUrl(url) {
  if (!url) return false;
  return url.includes('bvshop-manage.bvshop.tw') && 
         url.includes('order_multi_print_ktj_logistics');
}

// 安全地發送訊息到 content script
async function sendMessageToTab(tabId, message) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    return response;
  } catch (error) {
    console.log('訊息發送失敗，可能需要注入 content script');
    return null;
  }
}

// 注入 content script 和 CSS
async function injectContentScript(tabId) {
  try {
    // 先注入 CSS
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ['content.css']
    });
    
    // 再注入 JavaScript
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    
    // 等待 content script 初始化
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return true;
  } catch (error) {
    console.error('注入腳本時發生錯誤:', error.message);
    return false;
  }
}

// 處理擴充功能圖示點擊
chrome.action.onClicked.addListener(async (tab) => {
  console.log('擴充功能圖示被點擊，當前頁面:', tab.url);
  
  // 檢查是否為支援的頁面
  if (!isSupportedUrl(tab.url)) {
    console.log('不支援的網站:', tab.url);
    return;
  }
  
  // 先嘗試發送 ping 訊息
  const pingResponse = await sendMessageToTab(tab.id, { action: 'ping' });
  
  if (!pingResponse) {
    // Content script 未載入，需要注入
    console.log('正在注入 content script...');
    const injected = await injectContentScript(tab.id);
    
    if (!injected) {
      console.error('無法注入 content script');
      return;
    }
  }
  
  // 發送切換面板的訊息
  const toggleResponse = await sendMessageToTab(tab.id, { action: 'togglePanel' });
  
  if (!toggleResponse) {
    console.error('無法與 content script 通訊');
  } else {
    console.log('切換面板回應:', toggleResponse);
  }
});

// 監聽擴充功能安裝或更新
chrome.runtime.onInstalled.addListener((details) => {
  console.log('BV SHOP 出貨助手已安裝/更新', details.reason);
  
  // 如果是更新，可能需要重新注入 content scripts
  if (details.reason === 'update') {
    // 獲取所有標籤頁
    chrome.tabs.query({}, async (tabs) => {
      for (const tab of tabs) {
        if (isSupportedUrl(tab.url) && (isShippingUrl(tab.url) || isKTJUrl(tab.url))) {
          // 嘗試為物流單頁面重新注入
          await injectContentScript(tab.id);
        }
      }
    });
  }
});

// 監聽標籤頁更新
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // 只在頁面完全載入時處理
  if (changeInfo.status !== 'complete') return;
  
  // 檢查是否為支援的網站
  if (!isSupportedUrl(tab.url)) return;
  
  // 如果是物流單網站或嘉里大榮，自動注入 content script
  if (isShippingUrl(tab.url) || isKTJUrl(tab.url)) {
    console.log('偵測到物流單頁面，準備自動注入...');
    
    // 先檢查是否已經有 content script
    const pingResponse = await sendMessageToTab(tabId, { action: 'ping' });
    
    if (!pingResponse) {
      // 需要注入
      await injectContentScript(tabId);
    }
  }
});

// 監聽來自 content script 的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到訊息:', request.action, '來自:', sender.tab?.url);
  
  switch (request.action) {
    case 'contentScriptReady':
      console.log('Content script 已就緒');
      sendResponse({ status: 'acknowledged' });
      break;
      
    case 'getTabInfo':
      sendResponse({ 
        tabId: sender.tab?.id,
        url: sender.tab?.url 
      });
      break;
    
    case 'captureKTJ':
      // 處理嘉里大榮截圖請求
      if (sender.tab) {
        chrome.tabs.captureVisibleTab(sender.tab.windowId, {
          format: 'png',
          quality: 95
        }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ dataUrl: dataUrl });
          }
        });
        return true; // 保持連線開啟
      }
      break;
      
    default:
      sendResponse({ status: 'unknown action' });
  }
  
  // 保持訊息通道開啟
  return true;
});

// Service Worker 啟動時執行
chrome.runtime.onStartup.addListener(() => {
  console.log('BV SHOP 出貨助手 Service Worker 已啟動');
});

// 處理 Service Worker 的生命週期
self.addEventListener('activate', event => {
  console.log('Service Worker 已啟動');
});
