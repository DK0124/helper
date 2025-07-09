// BV SHOP 出貨助手 - Service Worker 背景腳本
chrome.runtime.onInstalled.addListener(() => {
  console.log('BV SHOP 出貨助手已安裝');
  
  // 設定初始值
  chrome.storage.local.set({
    extensionEnabled: true,
    version: '2.0.0'
  });
  
  // 建立定期清理的鬧鐘
  chrome.alarms.create('cleanupOldData', { 
    periodInMinutes: 1440 // 每天執行一次
  });
});

// 監聽擴充功能圖示點擊
chrome.action.onClicked.addListener((tab) => {
  // 檢查是否為支援的網站
  const supportedDomains = [
    'myship.7-11.com.tw',
    'epayment.7-11.com.tw', 
    'eship.7-11.com.tw',
    'family.com.tw',
    'famiport.com.tw',
    'hilife.com.tw',
    'okmart.com.tw',
    'bvshop'
  ];
  
  const isSupported = supportedDomains.some(domain => 
    tab.url && tab.url.includes(domain)
  );
  
  if (isSupported) {
    // 向內容腳本發送切換訊息
    chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' }, (response) => {
      if (chrome.runtime.lastError) {
        // 如果內容腳本還未載入，嘗試注入
        injectContentScripts(tab.id);
      }
    });
  } else {
    // 不支援的網站，顯示說明頁面
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup.html')
    });
  }
});

// 注入內容腳本
function injectContentScripts(tabId) {
  chrome.scripting.insertCSS({
    target: { tabId: tabId },
    files: ['content.css']
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('CSS injection failed:', chrome.runtime.lastError);
      return;
    }
    
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Script injection failed:', chrome.runtime.lastError);
        return;
      }
      
      // 注入完成後再次發送切換訊息
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { action: 'togglePanel' });
      }, 100);
    });
  });
}

// 監聽來自內容腳本的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getVersion') {
    sendResponse({ version: chrome.runtime.getManifest().version });
    return true;
  } else if (request.action === 'openOptionsPage') {
    chrome.runtime.openOptionsPage();
    return true;
  } else if (request.action === 'reportError') {
    console.error('Content script error:', request.error);
    return true;
  }
});

// 監聽標籤頁更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // 檢查是否為物流單頁面（需要自動注入）
    const autoInjectDomains = [
      'myship.7-11.com.tw',
      'epayment.7-11.com.tw',
      'eship.7-11.com.tw',
      'family.com.tw',
      'famiport.com.tw',
      'hilife.com.tw',
      'okmart.com.tw'
    ];
    
    const shouldAutoInject = autoInjectDomains.some(domain => 
      tab.url.includes(domain)
    );
    
    if (shouldAutoInject) {
      // 自動注入內容腳本到物流單頁面
      chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['content.css']
      }, () => {
        if (!chrome.runtime.lastError) {
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          });
        }
      });
    }
    
    // 更新圖示提示
    updateActionTitle(tab);
  }
});

// 設定擴充功能的動態圖示提示
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!chrome.runtime.lastError && tab) {
      updateActionTitle(tab);
    }
  });
});

// 更新擴充功能圖示的提示文字
function updateActionTitle(tab) {
  if (!tab || !tab.url || !tab.id) return;
  
  let title = 'BV SHOP 出貨助手';
  
  if (tab.url.includes('7-11.com.tw')) {
    title = '點擊查看 7-11 物流單';
  } else if (tab.url.includes('family.com.tw') || tab.url.includes('famiport.com.tw')) {
    title = '點擊查看全家物流單';
  } else if (tab.url.includes('hilife.com.tw')) {
    title = '點擊查看萊爾富物流單';
  } else if (tab.url.includes('okmart.com.tw')) {
    title = '點擊查看 OK 超商物流單';
  } else if (tab.url.includes('bvshop') && tab.url.includes('order')) {
    title = '點擊啟動出貨助手';
  } else {
    title = '點擊查看使用說明';
  }
  
  chrome.action.setTitle({
    tabId: tab.id,
    title: title
  });
}

// 監聽鬧鐘事件
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanupOldData') {
    cleanupOldData();
  }
});

// 清理超過7天的資料
function cleanupOldData() {
  chrome.storage.local.get(['bvShippingData', 'bvDetailData'], (result) => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    
    // 檢查並清理過期資料
    let shouldClear = false;
    
    if (result.bvShippingData && result.bvShippingData.timestamp) {
      if (now - result.bvShippingData.timestamp > sevenDays) {
        shouldClear = true;
      }
    }
    
    if (shouldClear) {
      chrome.storage.local.remove(['bvShippingData', 'bvDetailData'], () => {
        console.log('已清理過期資料');
      });
    }
  });
}

// 監聽安裝/更新事件
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'update') {
    console.log('Extension updated to version:', chrome.runtime.getManifest().version);
  } else if (details.reason === 'install') {
    console.log('Extension installed successfully');
  }
});