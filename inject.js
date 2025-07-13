// inject.js - BV SHOP 出貨助手注入腳本 (支援 PDF.js)
(function() {
  'use strict';
  
  console.log('[BV Inject] 注入腳本開始執行');
  
  // 檢查是否已經注入過
  if (window.__bvShopInjected) {
    console.log('[BV Inject] 已經注入過，跳過');
    return;
  }
  window.__bvShopInjected = true;
  
  // 動態載入 PDF.js
  async function loadPDFJS() {
    return new Promise((resolve, reject) => {
      // 檢查是否已經載入
      if (window.pdfjsLib) {
        console.log('[BV Inject] PDF.js 已存在');
        resolve();
        return;
      }
      
      // 建立 module script
      const script = document.createElement('script');
      script.type = 'module';
      script.textContent = `
        import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.3.93/build/pdf.min.mjs";
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.3.93/build/pdf.worker.min.mjs";
        window.pdfjsLib = pdfjsLib;
        window.dispatchEvent(new Event('pdfjsLoaded'));
      `;
      
      window.addEventListener('pdfjsLoaded', () => {
        console.log('[BV Inject] PDF.js 載入完成');
        resolve();
      }, { once: true });
      
      document.head.appendChild(script);
      
      // 超時處理
      setTimeout(() => {
        reject(new Error('PDF.js 載入超時'));
      }, 10000);
    });
  }
  
  // 處理嘉里大榮 PDF 截圖
  async function captureKTJPDF() {
    try {
      console.log('[BV Inject] 開始處理嘉里大榮 PDF');
      
      // 尋找 PDF 元素
      const pdfElements = [
        document.querySelector('embed[type="application/pdf"]'),
        document.querySelector('iframe[src*=".pdf"]'),
        document.querySelector('object[type="application/pdf"]')
      ].filter(Boolean);
      
      if (pdfElements.length === 0) {
        throw new Error('找不到 PDF 元素');
      }
      
      const pdfElement = pdfElements[0];
      let pdfUrl = null;
      
      // 取得 PDF URL
      if (pdfElement.tagName === 'EMBED' || pdfElement.tagName === 'OBJECT') {
        pdfUrl = pdfElement.src || pdfElement.data;
      } else if (pdfElement.tagName === 'IFRAME') {
        pdfUrl = pdfElement.src;
      }
      
      if (!pdfUrl) {
        throw new Error('無法取得 PDF URL');
      }
      
      console.log('[BV Inject] PDF URL:', pdfUrl);
      
      // 載入 PDF.js
      await loadPDFJS();
      
      // 載入 PDF
      const loadingTask = window.pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      
      console.log('[BV Inject] PDF 載入成功，頁數:', pdf.numPages);
      
      // 建立 canvas 來渲染 PDF
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      // 取得第一頁
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 }); // 高解析度
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      // 渲染 PDF 頁面
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      console.log('[BV Inject] PDF 渲染完成');
      
      // 轉換為 base64
      const dataUrl = canvas.toDataURL('image/png', 0.95);
      
      return { 
        success: true, 
        dataUrl: dataUrl,
        pageCount: pdf.numPages,
        width: viewport.width,
        height: viewport.height
      };
      
    } catch (error) {
      console.error('[BV Inject] PDF 處理失敗:', error);
      
      // 如果 PDF.js 失敗，嘗試使用 html2canvas 作為備用
      try {
        await loadHtml2Canvas();
        const canvas = await html2canvas(document.body, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false
        });
        
        const dataUrl = canvas.toDataURL('image/png', 0.95);
        return { success: true, dataUrl: dataUrl, fallback: true };
        
      } catch (fallbackError) {
        console.error('[BV Inject] 備用方案也失敗:', fallbackError);
        return { success: false, error: error.message };
      }
    }
  }
  
  // 動態載入 html2canvas (備用)
  function loadHtml2Canvas() {
    return new Promise((resolve, reject) => {
      if (typeof html2canvas !== 'undefined') {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  
  // 監聽來自 content script 的訊息
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    
    if (event.data && event.data.type) {
      switch (event.data.type) {
        case 'BV_CAPTURE_KTJ':
          console.log('[BV Inject] 收到截圖請求');
          const result = await captureKTJPDF();
          
          // 如果成功，顯示預覽
          if (result.success && result.dataUrl) {
            const preview = document.createElement('div');
            preview.style.cssText = `
              position: fixed;
              bottom: 20px;
              left: 20px;
              z-index: 99999;
              background: white;
              border: 2px solid #10b981;
              border-radius: 8px;
              padding: 15px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.2);
              max-width: 300px;
            `;
            preview.innerHTML = `
              <h4 style="margin: 0 0 10px 0; color: #059669;">✅ PDF 截圖成功！</h4>
              <img src="${result.dataUrl}" style="width: 100%; border: 1px solid #e5e7eb; border-radius: 4px;">
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #6b7280;">
                ${result.pageCount ? `共 ${result.pageCount} 頁，已截取第 1 頁` : ''}
                ${result.width && result.height ? `<br>尺寸: ${result.width}×${result.height}px` : ''}
              </p>
              <button onclick="this.parentElement.remove()" style="
                margin-top: 10px;
                padding: 6px 12px;
                background: #f3f4f6;
                border: 1px solid #e5e7eb;
                border-radius: 4px;
                cursor: pointer;
              ">關閉</button>
            `;
            document.body.appendChild(preview);
            
            // 10秒後自動關閉
            setTimeout(() => preview.remove(), 10000);
          }
          
          // 回傳結果給 content script
          window.postMessage({
            type: 'BV_CAPTURE_RESULT',
            ...result
          }, '*');
          break;
          
        case 'BV_LOAD_PDFJS':
          console.log('[BV Inject] 收到載入 PDF.js 請求');
          loadPDFJS();
          break;
      }
    }
  });
  
  // 為嘉里大榮頁面自動載入 PDF.js
  if (window.location.href.includes('order_multi_print_ktj_logistics')) {
    console.log('[BV Inject] 偵測到嘉里大榮頁面，自動載入 PDF.js');
    loadPDFJS().catch(console.error);
  }
  
  // 建立全域函數供除錯使用
  window.bvShopDebug = window.bvShopDebug || {};
  window.bvShopDebug.inject = {
    captureNow: captureKTJPDF,
    loadPDFJS: loadPDFJS,
    testPDF: async () => {
      try {
        await loadPDFJS();
        console.log('PDF.js 版本:', window.pdfjsLib.version);
        return true;
      } catch (error) {
        console.error('PDF.js 測試失敗:', error);
        return false;
      }
    }
  };
  
  console.log('[BV Inject] 注入腳本載入完成');
  console.log('[BV Inject] 除錯功能可使用: window.bvShopDebug.inject');
  
})();
