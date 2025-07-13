// inject.js - BV SHOP 出貨助手注入腳本
// 用於載入第三方函式庫和處理需要直接訪問頁面 DOM 的功能

(function() {
  'use strict';
  
  console.log('[BV Inject] 注入腳本開始執行');
  
  // 檢查是否已經注入過
  if (window.__bvShopInjected) {
    console.log('[BV Inject] 已經注入過，跳過');
    return;
  }
  window.__bvShopInjected = true;
  
  // 動態載入 html2canvas 函式庫
  function loadHtml2Canvas() {
    return new Promise((resolve, reject) => {
      // 檢查是否已經載入
      if (typeof html2canvas !== 'undefined') {
        console.log('[BV Inject] html2canvas 已存在');
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = function() {
        console.log('[BV Inject] html2canvas 載入完成');
        // 通知 content script
        window.postMessage({ 
          type: 'BV_HTML2CANVAS_LOADED',
          loaded: true 
        }, '*');
        resolve();
      };
      script.onerror = function(error) {
        console.error('[BV Inject] html2canvas 載入失敗:', error);
        reject(error);
      };
      document.head.appendChild(script);
    });
  }
  
  // 處理嘉里大榮 PDF 截圖
  async function captureKTJPDF() {
    try {
      console.log('[BV Inject] 開始處理嘉里大榮 PDF 截圖');
      
      // 等待 html2canvas 載入
      await loadHtml2Canvas();
      
      // 查找 PDF 容器
      const pdfContainers = [
        document.querySelector('embed[type="application/pdf"]'),
        document.querySelector('iframe[src*=".pdf"]'),
        document.querySelector('object[type="application/pdf"]'),
        document.querySelector('.pdf-viewer'),
        document.querySelector('#pdf-container'),
        document.querySelector('canvas') // PDF.js 使用 canvas
      ].filter(Boolean);
      
      console.log('[BV Inject] 找到的 PDF 容器:', pdfContainers.length);
      
      if (pdfContainers.length === 0) {
        // 如果沒有找到 PDF 容器，嘗試截圖整個頁面
        console.log('[BV Inject] 未找到 PDF 容器，嘗試截圖整個頁面');
        
        const canvas = await html2canvas(document.body, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: document.documentElement.scrollWidth,
          windowHeight: document.documentElement.scrollHeight
        });
        
        const dataUrl = canvas.toDataURL('image/png', 0.95);
        return { success: true, dataUrl: dataUrl };
      }
      
      // 嘗試截圖第一個找到的容器
      const targetElement = pdfContainers[0];
      console.log('[BV Inject] 目標元素:', targetElement.tagName);
      
      // 特殊處理 iframe
      if (targetElement.tagName === 'IFRAME') {
        try {
          // 嘗試訪問 iframe 內容
          const iframeDoc = targetElement.contentDocument || targetElement.contentWindow.document;
          const iframeBody = iframeDoc.body;
          
          if (iframeBody) {
            const canvas = await html2canvas(iframeBody, {
              scale: 2,
              useCORS: true,
              allowTaint: true,
              logging: false
            });
            
            const dataUrl = canvas.toDataURL('image/png', 0.95);
            return { success: true, dataUrl: dataUrl };
          }
        } catch (e) {
          console.warn('[BV Inject] 無法訪問 iframe 內容（跨域限制）:', e);
        }
      }
      
      // 對於其他元素，直接截圖
      const canvas = await html2canvas(targetElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const dataUrl = canvas.toDataURL('image/png', 0.95);
      return { success: true, dataUrl: dataUrl };
      
    } catch (error) {
      console.error('[BV Inject] 截圖失敗:', error);
      return { success: false, error: error.message };
    }
  }
  
  // 監聽來自 content script 的訊息
  window.addEventListener('message', async (event) => {
    // 只處理來自同源的訊息
    if (event.source !== window) return;
    
    if (event.data && event.data.type) {
      switch (event.data.type) {
        case 'BV_CAPTURE_KTJ':
          console.log('[BV Inject] 收到截圖請求');
          const result = await captureKTJPDF();
          
          // 回傳結果給 content script
          window.postMessage({
            type: 'BV_CAPTURE_RESULT',
            ...result
          }, '*');
          break;
          
        case 'BV_LOAD_HTML2CANVAS':
          console.log('[BV Inject] 收到載入 html2canvas 請求');
          loadHtml2Canvas();
          break;
      }
    }
  });
  
  // 為嘉里大榮頁面自動載入 html2canvas
  if (window.location.href.includes('order_multi_print_ktj_logistics')) {
    console.log('[BV Inject] 偵測到嘉里大榮頁面，自動載入 html2canvas');
    loadHtml2Canvas();
  }
  
  // 建立全域函數供除錯使用
  window.bvShopDebug = window.bvShopDebug || {};
  window.bvShopDebug.inject = {
    captureNow: captureKTJPDF,
    loadHtml2Canvas: loadHtml2Canvas,
    findPDFElements: () => {
      return {
        embed: document.querySelectorAll('embed[type="application/pdf"]'),
        iframe: document.querySelectorAll('iframe[src*=".pdf"]'),
        object: document.querySelectorAll('object[type="application/pdf"]'),
        canvas: document.querySelectorAll('canvas'),
        allPossible: document.querySelectorAll('embed, iframe, object, canvas, .pdf-viewer')
      };
    }
  };
  
  console.log('[BV Inject] 注入腳本載入完成');
  console.log('[BV Inject] 除錯功能可使用: window.bvShopDebug.inject');
  
})();
