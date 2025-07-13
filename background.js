// BV SHOP 出貨助手 - 背景腳本 (2025 優化版 + 嘉里大榮支援)

// 定義支援的網站列表
const SUPPORTED_HOSTS = [
  'myship.7-11.com.tw',
  'epayment.7-11.com.tw',
  'eship.7-11.com.tw',
  'family.com.tw',
  'famiport.com.tw',
  'hilife.com.tw',
  'okmart.com.tw',
  'kerrytj.com',
  'bvshop'
];

// 物流單網站列表（需要自動注入）
const SHIPPING_HOSTS = [
  'myship.7-11.com.tw',
  'epayment.7-11.com.tw',
  'eship.7-11.com.tw',
  'family.com.tw',
  'famiport.com.tw',
  'hilife.com.tw',
  'okmart.com.tw',
  'kerrytj.com'
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
    
    // 注入 PDF.js 庫
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['pdf.min.js']
    });
    
    // 再注入主要的 JavaScript
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
        if (isSupportedUrl(tab.url) && isShippingUrl(tab.url)) {
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
  
  // 如果是物流單網站，自動注入 content script
  if (isShippingUrl(tab.url)) {
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
      
    case 'downloadPDF':
      // 處理 PDF 下載請求
      chrome.downloads.download({
        url: request.url,
        filename: request.filename || 'kerry_shipping.pdf',
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('下載失敗:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('PDF 下載開始，ID:', downloadId);
          sendResponse({ success: true, downloadId: downloadId });
        }
      });
      return true; // 保持訊息通道開啟
      
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

// 處理嘉里大榮面板
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openKerryPanel') {
    // 創建一個新的面板視窗
    chrome.windows.create({
      url: chrome.runtime.getURL('kerry-panel.html'),
      type: 'popup',
      width: 400,
      height: 600,
      left: screen.width - 420,
      top: 20
    });
  } else if (request.action === 'processKerryPdf') {
    // 處理 PDF
    processKerryPdfOnline(request.pdfUrl).then(result => {
      sendResponse(result);
    });
    return true; // 保持訊息通道開啟
  }
});

// 線上處理嘉里大榮 PDF
async function processKerryPdfOnline(pdfUrl) {
  try {
    // 取得 PDF 內容
    const response = await fetch(pdfUrl);
    const arrayBuffer = await response.arrayBuffer();
    
    // 載入 PDF.js
    const pdfjsLib = await loadPdfJs();
    
    // 解析 PDF
    const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
    const numPages = pdf.numPages;
    
    const processedPages = [];
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      
      // 使用更高的解析度來獲得更好的圖片品質
      const scale = 3.0; // 提高到 3 倍解析度
      const viewport = page.getViewport({ scale });
      
      // 創建 canvas
      const canvas = new OffscreenCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');
      
      // 渲染 PDF 頁面
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      // 轉換為高品質 JPEG
      const blob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: 0.95 // 95% 品質
      });
      
      // 轉換為 data URL
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve) => {
        reader.onload = e => resolve(e.target.result);
        reader.readAsDataURL(blob);
      });
      
      processedPages.push({
        pageNum,
        dataUrl,
        width: viewport.width / scale,
        height: viewport.height / scale
      });
    }
    
    return {
      success: true,
      pages: processedPages,
      totalPages: numPages
    };
  } catch (error) {
    console.error('處理 PDF 失敗:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
  console.log('Service Worker 已啟動');
});
