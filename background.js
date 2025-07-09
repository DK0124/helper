// BV SHOP 出貨助手 - 背景腳本
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
    // 傳送訊息給內容腳本
    chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
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
});
