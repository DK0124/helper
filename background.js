// 監聽擴充功能安裝事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('BV SHOP 出貨助手已安裝');
});

// 監聽來自 content script 的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background 收到訊息:', request.action);
  
  switch (request.action) {
    case 'contentScriptReady':
      sendResponse({ status: 'acknowledged' });
      break;
      
    case 'openKerryPanel':
      // 開啟嘉里大榮控制面板
      chrome.windows.create({
        url: chrome.runtime.getURL('kerry-panel.html'),
        type: 'popup',
        width: 420,
        height: 700,
        left: Math.round(sender.tab.windowId ? 100 : screen.width - 440),
        top: 20
      }, (window) => {
        // 儲存相關資訊
        chrome.storage.local.set({
          kerryPanelWindowId: window.id,
          kerrySourceTabId: sender.tab.id,
          kerrySourceUrl: sender.tab.url
        });
      });
      break;
      
    case 'kerryPdfDetected':
      // 轉發 PDF URL 到控制面板
      chrome.runtime.sendMessage({
        action: 'pdfUrlReady',
        pdfUrl: request.pdfUrl,
        sourceTabId: sender.tab.id
      });
      break;
      
    case 'processKerryPdf':
      // 處理嘉里大榮 PDF
      processKerryPdfOnline(request.pdfUrl)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // 保持訊息通道開啟
      
    case 'fetchPdfFromUrl':
      // 從 URL 取得 PDF 內容
      fetchPdfContent(request.url)
        .then(arrayBuffer => {
          sendResponse({ success: true, data: Array.from(new Uint8Array(arrayBuffer)) });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true;
  }
});

// 監聽擴充功能圖示點擊
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Content script 尚未載入，重新注入...');
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['pdf.js', 'content.js']
      }).then(() => {
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
        }, 500);
      });
    } else {
      chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
    }
  });
});

// 從 URL 取得 PDF 內容
async function fetchPdfContent(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return await response.arrayBuffer();
}

// 線上處理嘉里大榮 PDF
async function processKerryPdfOnline(pdfUrl) {
  try {
    console.log('開始處理 PDF:', pdfUrl);
    
    // 載入 PDF.js（在 service worker 中需要特殊處理）
    if (typeof pdfjsLib === 'undefined') {
      // 在 service worker 中動態載入 PDF.js
      importScripts(chrome.runtime.getURL('pdf.js'));
      pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.js');
    }
    
    // 取得 PDF 內容
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`無法取得 PDF: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    
    // 解析 PDF
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    
    console.log(`PDF 共有 ${numPages} 頁`);
    
    const processedPages = [];
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      console.log(`處理第 ${pageNum}/${numPages} 頁`);
      
      const page = await pdf.getPage(pageNum);
      
      // 使用高解析度
      const scale = 3.0;
      const viewport = page.getViewport({ scale });
      
      // 創建 canvas（在 service worker 中使用 OffscreenCanvas）
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
        quality: 0.95
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
    
    console.log('PDF 處理完成');
    
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
