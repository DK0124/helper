// PDF.js 載入器 - 處理 ES Module 到全域變數的轉換
(async function() {
  try {
    // 如果使用的是 ES Module 版本的 PDF.js
    if (typeof pdfjsLib === 'undefined') {
      const module = await import(chrome.runtime.getURL('pdf.min.mjs'));
      window.pdfjsLib = module;
      
      // 設定 worker
      if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');
      }
    }
  } catch (error) {
    console.error('載入 PDF.js 模組失敗:', error);
  }
})();
