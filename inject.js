// inject.js - 修正編碼問題版本
(function() {
  'use strict';
  
  console.log('[BV Inject] Script started');
  
  if (window.__bvShopInjected) {
    console.log('[BV Inject] Already injected');
    return;
  }
  window.__bvShopInjected = true;
  
  // 處理嘉里大榮 PDF
  async function captureKTJPDF() {
    try {
      console.log('[BV Inject] Starting KTJ PDF capture');
      
      // 更廣泛地尋找 PDF 元素
      const selectors = [
        'embed[type="application/pdf"]',
        'embed[src*=".pdf"]',
        'iframe[src*=".pdf"]',
        'iframe[src*="pdf"]',
        'object[type="application/pdf"]',
        'object[data*=".pdf"]',
        '#pdf-viewer',
        '.pdf-viewer',
        '[id*="pdfViewer"]',
        '[class*="pdf-container"]'
      ];
      
      let pdfElement = null;
      for (const selector of selectors) {
        pdfElement = document.querySelector(selector);
        if (pdfElement) {
          console.log('[BV Inject] Found PDF element:', selector);
          break;
        }
      }
      
      // 如果還是找不到，檢查所有 iframe
      if (!pdfElement) {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          if (iframe.src && !iframe.src.includes('about:blank')) {
            pdfElement = iframe;
            console.log('[BV Inject] Using iframe:', iframe.src);
            break;
          }
        }
      }
      
      // 如果完全找不到，嘗試截圖整個頁面
      if (!pdfElement) {
        console.log('[BV Inject] No PDF element found, capturing full page');
        
        // 載入 html2canvas
        await loadHtml2Canvas();
        
        const canvas = await html2canvas(document.body, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff'
        });
        
        const dataUrl = canvas.toDataURL('image/png', 0.95);
        return { 
          success: true, 
          dataUrl: dataUrl,
          method: 'fullpage'
        };
      }
      
      // 如果找到元素，取得 URL
      let pdfUrl = pdfElement.src || pdfElement.data || '';
      console.log('[BV Inject] PDF URL:', pdfUrl);
      
      // 如果是相對路徑，轉換為絕對路徑
      if (pdfUrl && !pdfUrl.startsWith('http')) {
        pdfUrl = new URL(pdfUrl, window.location.href).href;
      }
      
      // 嘗試使用 PDF.js
      try {
        await loadPDFJS();
        const pdf = await window.pdfjsLib.getDocument(pdfUrl).promise;
        console.log('[BV Inject] PDF loaded, pages:', pdf.numPages);
        
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({
          canvasContext: canvas.getContext('2d'),
          viewport: viewport
        }).promise;
        
        const dataUrl = canvas.toDataURL('image/png', 0.95);
        return { 
          success: true, 
          dataUrl: dataUrl,
          method: 'pdfjs',
          pageCount: pdf.numPages
        };
        
      } catch (pdfError) {
        console.error('[BV Inject] PDF.js failed:', pdfError);
        
        // 備用方案：截圖可見內容
        await loadHtml2Canvas();
        const canvas = await html2canvas(pdfElement || document.body, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false
        });
        
        const dataUrl = canvas.toDataURL('image/png', 0.95);
        return { 
          success: true, 
          dataUrl: dataUrl,
          method: 'html2canvas'
        };
      }
      
    } catch (error) {
      console.error('[BV Inject] Capture failed:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
  
  // 載入 html2canvas
  function loadHtml2Canvas() {
    return new Promise((resolve) => {
      if (typeof html2canvas !== 'undefined') {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = resolve;
      script.onerror = () => resolve(); // 繼續執行即使載入失敗
      document.head.appendChild(script);
    });
  }
  
  // 載入 PDF.js
  function loadPDFJS() {
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.type = 'module';
      script.textContent = `
        import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.3.93/build/pdf.min.mjs";
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.3.93/build/pdf.worker.min.mjs";
        window.pdfjsLib = pdfjsLib;
        window.dispatchEvent(new Event('pdfjsLoaded'));
      `;
      
      window.addEventListener('pdfjsLoaded', resolve, { once: true });
      document.head.appendChild(script);
      
      setTimeout(() => reject(new Error('PDF.js timeout')), 5000);
    });
  }
  
  // 監聽訊息
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data) return;
    
    if (event.data.type === 'BV_CAPTURE_KTJ') {
      console.log('[BV Inject] Capture request received');
      const result = await captureKTJPDF();
      
      window.postMessage({
        type: 'BV_CAPTURE_RESULT',
        ...result
      }, '*');
    }
  });
  
  // 除錯功能
  window.bvShopDebug = {
    captureNow: captureKTJPDF,
    checkElements: () => {
      return {
        embed: document.querySelectorAll('embed'),
        iframe: document.querySelectorAll('iframe'),
        object: document.querySelectorAll('object'),
        canvas: document.querySelectorAll('canvas')
      };
    }
  };
  
  console.log('[BV Inject] Script loaded');
})();
