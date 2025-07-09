// BV SHOP 出貨助手 - 背景腳本 (改進版)
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
  
  const isSupported = supportedUrls.some(url => tab.url.includes(url));
  
  if (isSupported) {
    // 先檢查 content script 是否已經注入
    chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script 尚未載入，先注入
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }, () => {
          // 注入 CSS
          chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['content.css']
          }, () => {
            // 稍等一下讓 content script 初始化
            setTimeout(() => {
              // 現在發送訊息
              chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error('無法與內容腳本通訊:', chrome.runtime.lastError);
                  // 顯示錯誤通知
                  chrome.notifications.create({
                    type: 'basic',
                    iconUrl: chrome.runtime.getURL('icon48.png'),
                    title: 'BV SHOP 出貨助手',
                    message: '無法啟動擴充功能，請重新整理頁面後再試'
                  });
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
    // 顯示不支援的通知
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon48.png'),
      title: 'BV SHOP 出貨助手',
      message: '此頁面不支援 BV SHOP 出貨助手'
    });
  }
});

// 監聽安裝事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('BV SHOP 出貨助手已安裝');
  
  // 設定擴充功能規則（Manifest V3）
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostContains: 'myship.7-11.com.tw' }
          }),
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostContains: 'epayment.7-11.com.tw' }
          }),
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostContains: 'eship.7-11.com.tw' }
          }),
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostContains: 'family.com.tw' }
          }),
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostContains: 'famiport.com.tw' }
          }),
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostContains: 'hilife.com.tw' }
          }),
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostContains: 'okmart.com.tw' }
          }),
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostContains: 'bvshop' }
          })
        ],
        actions: [new chrome.declarativeContent.ShowAction()]
      }
    ]);
  });
});

// 監聽來自 content script 的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'contentScriptReady') {
    console.log('Content script 已準備就緒:', sender.tab.url);
    sendResponse({ status: 'acknowledged' });
  }
  return true;
});

// 監聽標籤更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
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
    
    const isSupported = supportedUrls.some(url => tab.url && tab.url.includes(url));
    
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
      
      const isShippingPage = shippingUrls.some(url => tab.url && tab.url.includes(url));
      
      if (isShippingPage) {
        // 物流單頁面自動注入
        chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
          if (chrome.runtime.lastError) {
            // Content script 尚未載入，注入它
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['content.js']
            }, () => {
              chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ['content.css']
              });
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

// 清理無效的通知
chrome.notifications.onClosed.addListener((notificationId) => {
  console.log('通知已關閉:', notificationId);
});
