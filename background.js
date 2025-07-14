// BV SHOP 出貨助手 - Background Script
console.log('BV SHOP 出貨助手 Background Script 已載入');

// 監聽擴充功能安裝或更新
chrome.runtime.onInstalled.addListener((details) => {
  console.log('擴充功能已安裝/更新', details);
  
  if (details.reason === 'install') {
    console.log('首次安裝擴充功能');
    // 開啟歡迎頁面或設定頁面
  } else if (details.reason === 'update') {
    console.log('擴充功能已更新到版本', chrome.runtime.getManifest().version);
  }
});

// 監聽來自 content script 的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到訊息:', request.action, 'from', sender.tab?.url);
  
  switch (request.action) {
    case 'contentScriptReady':
      console.log('Content script 已就緒');
      sendResponse({ status: 'acknowledged' });
      break;
      
    case 'processKerryPdf':
      // 處理嘉里大榮 PDF
      processPdfInBackground(request.pdfUrl)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ 
          success: false, 
          error: error.message 
        }));
      return true; // 保持連線開啟以進行非同步回應
      
    case 'openKerryPanel':
      // 開啟嘉里大榮控制面板（如果需要）
      openKerryControlPanel();
      sendResponse({ status: 'panel opened' });
      break;
      
    case 'downloadData':
      // 下載資料（如果需要匯出功能）
      handleDataDownload(request.data, request.filename);
      sendResponse({ status: 'download started' });
      break;
      
    default:
      console.warn('未知的 action:', request.action);
      sendResponse({ status: 'unknown action' });
  }
  
  return false; // 同步回應
});

// 處理 PDF 的函數
async function processPdfInBackground(pdfUrl) {
  try {
    console.log('開始在 background 處理 PDF:', pdfUrl);
    
    // 驗證 URL
    if (!pdfUrl || !pdfUrl.startsWith('http')) {
      throw new Error('無效的 PDF URL');
    }
    
    // 使用 fetch 取得 PDF
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`無法載入 PDF: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    console.log('PDF 檔案大小:', (arrayBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB');
    
    // 檢查是否已載入 PDF.js
    if (typeof pdfjsLib === 'undefined') {
      console.log('載入 PDF.js...');
      try {
        importScripts('pdf.js');
      } catch (e) {
        console.error('無法載入 PDF.js:', e);
        throw new Error('PDF.js 載入失敗');
      }
    }
    
    // 設定 PDF.js - 禁用 worker 以避免載入問題
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    pdfjsLib.GlobalWorkerOptions.disableWorker = true;
    
    // 載入 PDF 文件
    console.log('開始解析 PDF...');
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      disableWorker: true,
      disableStream: true,
      disableAutoFetch: true,
      disableFontFace: true,
      isEvalSupported: false
    });
    
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    console.log(`PDF 共有 ${numPages} 頁`);
    
    const pages = [];
    const maxPages = Math.min(numPages, 50); // 限制最多處理 50 頁，避免記憶體問題
    
    // 處理每一頁
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      console.log(`處理第 ${pageNum}/${maxPages} 頁`);
      
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); // 使用 2x 解析度
        
        // 創建 OffscreenCanvas（在 Service Worker 中可用）
        const canvas = new OffscreenCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');
        
        if (!context) {
          throw new Error('無法創建 canvas context');
        }
        
        // 渲染 PDF 頁面
        await page.render({
          canvasContext: context,
          viewport: viewport,
          intent: 'display'
        }).promise;
        
        // 轉換為 blob
        const blob = await canvas.convertToBlob({
          type: 'image/png',
          quality: 0.9 // 稍微降低品質以減少檔案大小
        });
        
        // 轉換為 data URL
        const dataUrl = await blobToDataURL(blob);
        
        pages.push({
          pageNum: pageNum,
          dataUrl: dataUrl,
          width: viewport.width,
          height: viewport.height
        });
        
        // 清理記憶體
        page.cleanup();
        
      } catch (pageError) {
        console.error(`處理第 ${pageNum} 頁時發生錯誤:`, pageError);
        // 繼續處理下一頁
      }
    }
    
    // 清理 PDF 物件
    pdf.cleanup();
    pdf.destroy();
    
    console.log(`成功處理 ${pages.length} 頁`);
    
    if (pages.length === 0) {
      throw new Error('無法處理任何頁面');
    }
    
    return {
      success: true,
      pages: pages,
      totalPages: pages.length,
      originalPages: numPages
    };
    
  } catch (error) {
    console.error('處理 PDF 時發生錯誤:', error);
    return {
      success: false,
      error: error.message || '未知錯誤'
    };
  }
}

// 將 Blob 轉換為 Data URL
async function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// 開啟嘉里大榮控制面板（如果需要）
function openKerryControlPanel() {
  chrome.windows.create({
    url: chrome.runtime.getURL('kerry-panel.html'),
    type: 'popup',
    width: 400,
    height: 600,
    left: 100,
    top: 100
  });
}

// 處理資料下載
function handleDataDownload(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  });
  
  const url = URL.createObjectURL(blob);
  
  chrome.downloads.download({
    url: url,
    filename: filename || 'bv-shop-export.json',
    saveAs: true
  }, (downloadId) => {
    console.log('開始下載，ID:', downloadId);
    
    // 清理 blob URL
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10000);
  });
}

// 監聽分頁更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // 檢查是否為支援的網站
    const supportedSites = [
      'myship.7-11.com.tw',
      'epayment.7-11.com.tw',
      'eship.7-11.com.tw',
      'family.com.tw',
      'famiport.com.tw',
      'hilife.com.tw',
      'okmart.com.tw',
      'kerrytj.com',
      'bvshop-manage.bvshop.tw'
    ];
    
    const isSupported = supportedSites.some(site => tab.url.includes(site));
    
    if (isSupported) {
      console.log('偵測到支援的網站:', tab.url);
      
      // 可以在這裡設定圖示或其他視覺提示
      chrome.action.setIcon({
        tabId: tabId,
        path: {
          "16": "icon16.png",
          "48": "icon48.png",
          "128": "icon128.png"
        }
      });
    }
  }
});

// 處理擴充功能圖示點擊
chrome.action.onClicked.addListener((tab) => {
  console.log('擴充功能圖示被點擊', tab.url);
  
  // 向當前分頁發送切換面板的訊息
  chrome.tabs.sendMessage(tab.id, {
    action: 'togglePanel'
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('無法與內容腳本通訊:', chrome.runtime.lastError);
      
      // 可能需要重新注入內容腳本
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).then(() => {
        console.log('已重新注入內容腳本');
        // 再次嘗試發送訊息
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'togglePanel'
          });
        }, 100);
      }).catch(err => {
        console.error('無法注入內容腳本:', err);
      });
    } else {
      console.log('面板切換回應:', response);
    }
  });
});

// 監聽快捷鍵（如果有設定）
chrome.commands.onCommand.addListener((command) => {
  console.log('收到快捷鍵指令:', command);
  
  if (command === 'toggle-panel') {
    // 取得當前活動分頁
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'togglePanel'
        });
      }
    });
  }
});

// 錯誤處理
self.addEventListener('error', (event) => {
  console.error('Background script 錯誤:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('未處理的 Promise 拒絕:', event.reason);
});

// 保持 Service Worker 活著（Chrome 110+ 不再需要）
// 如果需要，可以使用以下程式碼
/*
const keepAlive = () => {
  chrome.runtime.getPlatformInfo(() => {
    if (chrome.runtime.lastError) {
      console.error('Keep-alive 錯誤:', chrome.runtime.lastError);
    }
  });
};

// 每 20 秒執行一次
setInterval(keepAlive, 20000);
*/

console.log('Background script 初始化完成');
