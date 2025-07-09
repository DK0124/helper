// BV SHOP 出貨助手 - 背景腳本 (Service Worker 版本)

// 監聽擴充功能圖示點擊
chrome.action.onClicked.addListener((tab) => {
  // 檢查是否為支援的頁面
  const supportedUrls = [
    'myship.7-11.com.tw',
    'epayment.7-11.com.tw',
    'eship.7-11.com.tw',
    'family.com.tw',
    'famiport.com.tw',
    'hilife.com.tw',
    'okmart.com.tw',
    'bvshop'
  ];
  
  const isSupported = supportedUrls.some(url => tab.url && tab.url.includes(url));
  
  if (isSupported) {
    // 先檢查 content script 是否已經注入
    chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script 尚未載入，先注入
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('無法注入 content script:', chrome.runtime.lastError);
            return;
          }
          
          // 注入 CSS
          chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['content.css']
          }, () => {
            if (chrome.runtime.lastError) {
              console.error('無法注入 CSS:', chrome.runtime.lastError);
              return;
            }
            
            // 稍等一下讓 content script 初始化
            setTimeout(() => {
              // 現在發送訊息
              chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error('無法與內容腳本通訊:', chrome.runtime.lastError);
                }
              });
            }, 100);
          });
        });
      } else {
        // Content script 已經存在，直接發送訊息
        chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('發送訊息失敗:', chrome.runtime.lastError);
          }
        });
      }
    });
  } else {
    // 不支援的頁面，簡單提示
    console.log('此頁面不支援 BV SHOP 出貨助手');
  }
});

// 監聽安裝事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('BV SHOP 出貨助手已安裝');
});

// 監聽來自 content script 的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'contentScriptReady') {
    console.log('Content script 已準備就緒:', sender.tab?.url);
    sendResponse({ status: 'acknowledged' });
  }
  return true;
});

// 監聽標籤更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // 檢查是否為支援的網站
    const supportedUrls = [
      'myship.7-11.com.tw',
      'epayment.7-11.com.tw', 
      'eship.7-11.com.tw',
      'family.com.tw',
      'famiport.com.tw',
      'hilife.com.tw',
      'okmart.com.tw',
      'bvshop'
    ];
    
    const isSupported = supportedUrls.some(url => tab.url.includes(url));
    
    if (isSupported) {
      // 檢查是否需要自動注入 content script（針對物流單頁面）
      const shippingUrls = [
        'myship.7-11.com.tw',
        'epayment.7-11.com.tw',
        'eship.7-11.com.tw',
        'family.com.tw',
        'famiport.com.tw',
        'hilife.com.tw',
        'okmart.com.tw'
      ];
      
      const isShippingPage = shippingUrls.some(url => tab.url.includes(url));
      
      if (isShippingPage) {
        // 物流單頁面自動注入
        chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
          if (chrome.runtime.lastError) {
            // Content script 尚未載入，注入它
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['content.js']
            }, () => {
              if (!chrome.runtime.lastError) {
                chrome.scripting.insertCSS({
                  target: { tabId: tabId },
                  files: ['content.css']
                });
              }
            });
          }
        });
      }
    }
  }
});

// 處理擴充功能更新或重新載入的情況
chrome.runtime.onStartup.addListener(() => {
  console.log('BV SHOP 出貨助手已啟動');
});
