// BV SHOP 出貨助手 - 嘉里大榮自動抓取專用（自動、無面板、有通知）
(function() {
  'use strict';

  // 載入狀態
  let isPdfJsLoading = false;
  let isPdfJsLoaded = false;

  // 1. 檢查是不是嘉里大榮物流單頁
  function isKTJPage() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    return (
      hostname.includes('bvshop-manage.bvshop.tw') &&
      pathname.includes('order_multi_print_ktj_logistics')
    );
  }

  // 2. 顯示通知
  function showNotification(msg) {
    alert(`[BV SHOP 出貨助手] ${msg}`);
  }

  // 3. 載入 PDF.js（回到原始方式，但改進檢測）
  function loadPdfJs() {
    return new Promise((resolve, reject) => {
      // 檢查是否已載入
      if (typeof pdfjsLib !== 'undefined' || typeof window.pdfjsLib !== 'undefined') {
        window.pdfjsLib = window.pdfjsLib || pdfjsLib;
        console.log('PDF.js 已經存在');
        resolve();
        return;
      }

      if (isPdfJsLoading) {
        // 等待載入完成
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if (typeof pdfjsLib !== 'undefined' || typeof window.pdfjsLib !== 'undefined') {
            window.pdfjsLib = window.pdfjsLib || pdfjsLib;
            clearInterval(checkInterval);
            resolve();
          } else if (attempts > 50) { // 5秒超時
            clearInterval(checkInterval);
            reject(new Error('等待 PDF.js 載入超時'));
          }
        }, 100);
        return;
      }

      isPdfJsLoading = true;
      
      // 創建 script 標籤
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('libs/pdf.js');
      script.type = 'text/javascript';
      
      // 設定載入成功處理
      script.onload = function() {
        console.log('Script 標籤載入完成，等待 pdfjsLib 初始化...');
        
        // 持續檢查 pdfjsLib 是否可用
        let checkAttempts = 0;
        const checkPdfLib = setInterval(() => {
          checkAttempts++;
          
          // 嘗試各種可能的位置
          const pdfLib = window.pdfjsLib || 
                        window['pdfjs-dist/build/pdf'] || 
                        (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null) ||
                        globalThis.pdfjsLib ||
                        globalThis['pdfjs-dist/build/pdf'];
          
          if (pdfLib) {
            clearInterval(checkPdfLib);
            window.pdfjsLib = pdfLib;
            
            // 設定 worker
            try {
              window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.js');
              console.log('PDF.js 初始化成功，版本:', window.pdfjsLib.version || '未知');
            } catch (e) {
              console.warn('設定 worker 失敗，但可能不影響使用:', e);
            }
            
            isPdfJsLoaded = true;
            isPdfJsLoading = false;
            resolve();
          } else if (checkAttempts > 30) { // 3秒超時
            clearInterval(checkPdfLib);
            isPdfJsLoading = false;
            
            // 列出所有可能的物件供除錯
            console.error('找不到 pdfjsLib，window 上的物件:', 
              Object.keys(window).filter(k => k.toLowerCase().includes('pdf')));
            console.error('typeof pdfjsLib:', typeof pdfjsLib);
            
            reject(new Error('PDF.js 載入後找不到 pdfjsLib'));
          }
        }, 100);
      };
      
      // 設定載入失敗處理
      script.onerror = function(error) {
        console.error('Script 載入失敗:', error);
        isPdfJsLoading = false;
        reject(new Error('無法載入 PDF.js 檔案'));
      };
      
      // 加入到頁面
      document.head.appendChild(script);
      console.log('已插入 script 標籤，等待載入...');
    });
  }

  // 4. 主要的 PDF 抓取函數
  async function grabPdfContent() {
    try {
      // 確認 pdfjsLib 存在
      if (!window.pdfjsLib) {
        throw new Error('pdfjsLib 不存在');
      }

      // 取得 PDF URL
      let pdfUrl = window.location.href;
      
      // 檢查 embed 或 object
      const embed = document.querySelector('embed[type="application/pdf"]');
      if (embed && embed.src) {
        pdfUrl = embed.src;
        console.log('從 embed 取得 PDF URL:', pdfUrl);
      } else {
        const object = document.querySelector('object[type="application/pdf"]');
        if (object && object.data) {
          pdfUrl = object.data;
          console.log('從 object 取得 PDF URL:', pdfUrl);
        }
      }

      console.log('準備抓取 PDF:', pdfUrl);

      // 下載 PDF
      const response = await fetch(pdfUrl, {
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/pdf'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const pdfData = await response.arrayBuffer();
      console.log('PDF 下載完成，大小:', (pdfData.byteLength / 1024).toFixed(2), 'KB');

      // 載入 PDF 文件
      console.log('開始解析 PDF...');
      const loadingTask = window.pdfjsLib.getDocument({ 
        data: pdfData,
        cMapUrl: chrome.runtime.getURL('libs/cmaps/'),
        cMapPacked: true
      });
      
      const pdf = await loadingTask.promise;
      console.log(`PDF 解析成功，共 ${pdf.numPages} 頁`);
      
      let shippingData = [];
      
      // 處理每一頁
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        console.log(`處理第 ${pageNum} 頁...`);
        const page = await pdf.getPage(pageNum);
        
        // 設定縮放比例
        const scale = 2;
        const viewport = page.getViewport({ scale });
        
        // 創建 canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        // 渲染頁面
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        // 轉換為圖片
        const imgDataUrl = canvas.toDataURL('image/png', 0.95);
        
        // 從 URL 取得訂單編號
        const urlParams = new URLSearchParams(window.location.search);
        const ids = urlParams.get('ids')?.split(',') || [];
        const orderNo = ids[pageNum - 1] || `KTJ-${Date.now()}-${pageNum}`;

        shippingData.push({
          html: `<div class="bv-shipping-wrapper" style="width: 100%; max-width: 105mm; margin: 0 auto; background: white; position: relative;">
                  <img src="${imgDataUrl}" style="width: 100%; height: auto; display: block;">
                </div>`,
          orderNo: orderNo,
          serviceCode: `KTJ${orderNo}`,
          width: '105mm',
          height: '148mm',
          index: pageNum - 1,
          provider: 'ktj',
          isImage: true
        });
        
        console.log(`第 ${pageNum} 頁處理完成`);
      }

      // 儲存資料
      console.log('準備儲存資料...');
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({
          bvShippingData: shippingData,
          lastProvider: 'ktj',
          timestamp: Date.now()
        }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            console.log('資料儲存成功');
            resolve();
          }
        });
      });

      showNotification(`成功！已抓取 ${shippingData.length} 張嘉里大榮物流單`);
      console.log('抓取完成！');
      
    } catch (err) {
      console.error('抓取過程發生錯誤:', err);
      throw err;
    }
  }

  // 5. 自動抓取入口
  async function autoGrabKTJShipping() {
    try {
      console.log('=== 開始自動抓取流程 ===');
      showNotification('開始自動抓取嘉里大榮物流單...');
      
      // 載入 PDF.js
      console.log('步驟 1: 載入 PDF.js');
      await loadPdfJs();
      console.log('PDF.js 載入成功');
      
      // 執行抓取
      console.log('步驟 2: 開始抓取 PDF');
      await grabPdfContent();
      
      console.log('=== 抓取流程完成 ===');
      
    } catch (err) {
      console.error('抓取失敗:', err);
      showNotification(`抓取失敗: ${err.message}`);
    }
  }

  // 6. 檢查函數
  window.bvCheckKTJ = function() {
    chrome.storage.local.get(['bvShippingData', 'lastProvider', 'timestamp'], (result) => {
      if (!result.bvShippingData || result.bvShippingData.length === 0) {
        alert('尚未抓到任何物流單');
        console.log('Storage 內容:', result);
      } else {
        const time = result.timestamp ? new Date(result.timestamp).toLocaleString() : '未知';
        alert(`已抓取 ${result.bvShippingData.length} 張物流單\n時間: ${time}`);
        console.log('物流單資料:', result.bvShippingData);
        console.log('抓取時間:', time);
      }
    });
  };

  // 7. 清除函數
  window.bvClearKTJ = function() {
    if (confirm('確定要清除所有物流單資料嗎？')) {
      chrome.storage.local.remove(['bvShippingData', 'lastProvider', 'timestamp'], () => {
        alert('已清除所有物流單資料');
        console.log('資料已清除');
      });
    }
  };

  // 8. 手動重新抓取
  window.bvReloadKTJ = function() {
    if (isKTJPage()) {
      console.log('手動重新抓取...');
      autoGrabKTJShipping();
    } else {
      alert('請在嘉里大榮物流單頁面使用此功能');
    }
  };

  // 9. 主程式入口
  if (isKTJPage()) {
    console.log('%c偵測到嘉里大榮物流單頁面', 'color: #5865F2; font-weight: bold; font-size: 14px;');
    
    setTimeout(() => {
      console.log('%c=== BV SHOP 出貨助手 ===', 'color: #5865F2; font-weight:bold; font-size: 16px;');
      console.log('%c可用指令：', 'color: #5865F2; font-weight:bold;');
      console.log('%c  bvCheckKTJ()  - 檢查抓取的物流單', 'color: green;');
      console.log('%c  bvClearKTJ()  - 清除所有資料', 'color: orange;');
      console.log('%c  bvReloadKTJ() - 手動重新抓取', 'color: blue;');
      
      // 自動開始抓取
      autoGrabKTJShipping();
    }, 1000);
  } else {
    // 非嘉里大榮頁面也提供檢查功能
    console.log('BV SHOP 出貨助手已載入（非嘉里大榮頁面）');
  }

})();
