// background.js - BV SHOP 出貨助手背景腳本

console.log('BV SHOP 出貨助手 - 背景腳本已載入');

// 監聽擴充功能安裝或更新
chrome.runtime.onInstalled.addListener((details) => {
  console.log('擴充功能事件:', details.reason);
  
  if (details.reason === 'install') {
    console.log('擴充功能已安裝');
    // 可以在這裡設置初始設定
    chrome.storage.local.set({
      bvInstallDate: new Date().toISOString(),
      bvVersion: chrome.runtime.getManifest().version
    });
  } else if (details.reason === 'update') {
    console.log('擴充功能已更新到版本:', chrome.runtime.getManifest().version);
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
    
    case 'captureFullPage':
      // 處理整頁截圖請求
      if (sender.tab) {
        captureFullPage(sender.tab, request.orderIds)
          .then(captures => {
            sendResponse({ captures: captures });
          })
          .catch(error => {
            sendResponse({ error: error.message });
          });
        return true; // 保持連線開啟
      }
      break;
      
    default:
      sendResponse({ status: 'unknown action' });
  }
  
  return true;
});

// 整頁截圖功能
async function captureFullPage(tab, orderIds) {
  try {
    const captures = [];
    
    // 取得頁面尺寸
    const dimensions = await chrome.tabs.sendMessage(tab.id, {
      action: 'getPageDimensions'
    });
    
    const pageHeight = dimensions?.height || tab.height;
    const viewportHeight = tab.height;
    const numCaptures = Math.ceil(pageHeight / viewportHeight);
    
    // 分段截圖
    for (let i = 0; i < numCaptures; i++) {
      // 滾動到對應位置
      await chrome.tabs.sendMessage(tab.id, {
        action: 'scrollTo',
        position: i * viewportHeight
      });
      
      // 等待滾動完成
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 截圖
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
        quality: 95
      });
      
      captures.push(dataUrl);
    }
    
    // 如果只需要一張完整圖片，可以在這裡合併
    // 暫時返回第一張截圖
    return [captures[0]];
    
  } catch (error) {
    console.error('截圖失敗:', error);
    throw error;
  }
}

// 監聽擴充功能圖標點擊
chrome.action.onClicked.addListener((tab) => {
  console.log('擴充功能圖標被點擊，當前頁面:', tab.url);
  
  // 可以在這裡執行特定操作
  chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
});

// 監聽標籤頁更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // 檢查是否為支援的網站
    const supportedSites = [
      'bvshop-manage.bvshop.tw',
      '7-11.com.tw',
      'family.com.tw',
      'hilife.com.tw',
      'okmart.com.tw'
    ];
    
    const isSupported = supportedSites.some(site => tab.url.includes(site));
    
    if (isSupported) {
      console.log('偵測到支援的網站:', tab.url);
    }
  }
});
