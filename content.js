// BV SHOP 出貨助手 - 內容腳本 (完整版 v3.0.0 - 支援線上處理嘉里大榮 PDF)
(function() {
  'use strict';
  
  console.log('BV SHOP 出貨助手已載入');
  
  // 等待 PDF.js 載入的 Promise
  const waitForPdfJs = new Promise((resolve) => {
    let checkCount = 0;
    const checkInterval = setInterval(() => {
      checkCount++;
      
      // 檢查各種可能的位置
      const pdfjs = window.pdfjsLib || 
                    window['pdfjs-dist/build/pdf'] || 
                    (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
      
      if (pdfjs) {
        console.log('PDF.js 已載入');
        clearInterval(checkInterval);
        resolve(pdfjs);
      } else if (checkCount > 50) { // 5秒後停止檢查
        console.warn('PDF.js 載入超時');
        clearInterval(checkInterval);
        resolve(null);
      }
    }, 100);
  });
  
  // 全域變數
  let currentPage = detectCurrentPage();
  let shippingData = [];
  let detailData = [];
  let savedLogos = { shipping: null, detail: null };
  let panelActive = false;
  let cachedProviderSettings = {};
  let pdfShippingData = [];
  let pdfjsLib = null; // 將在載入後設定
  
  // 初始化時設定 pdfjsLib
  waitForPdfJs.then(pdfjs => {
    if (pdfjs) {
      pdfjsLib = pdfjs;
      console.log('PDF.js 已設定為全域變數');
    } else {
      console.error('無法載入 PDF.js');
    }
  });
  
  // 偵測當前頁面類型
  function detectCurrentPage() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    
    console.log('偵測頁面 - hostname:', hostname, 'pathname:', pathname);
    
    // 7-11
    if (hostname.includes('7-11.com.tw') || hostname.includes('ibon.com.tw')) {
      if (pathname.includes('shipping') || pathname.includes('print')) {
        console.log('偵測到 7-11 物流單頁面');
        return { type: 'shipping', provider: '7-11' };
      }
      return { type: 'unknown', provider: '7-11' };
    }
    
    // 全家
    else if (hostname.includes('family.com.tw') || hostname.includes('famiport.com.tw')) {
      if (pathname.includes('shipping') || pathname.includes('print')) {
        console.log('偵測到全家物流單頁面');
        return { type: 'shipping', provider: 'family' };
      }
      return { type: 'unknown', provider: 'family' };
    }
    
    // 萊爾富
    else if (hostname.includes('hilife.com.tw')) {
      if (pathname.includes('shipping') || pathname.includes('print')) {
        console.log('偵測到萊爾富物流單頁面');
        return { type: 'shipping', provider: 'hilife' };
      }
      return { type: 'unknown', provider: 'hilife' };
    }
    
    // OK
    else if (hostname.includes('okmart.com.tw')) {
      if (pathname.includes('shipping') || pathname.includes('print')) {
        console.log('偵測到 OK 物流單頁面');
        return { type: 'shipping', provider: 'ok' };
      }
      return { type: 'unknown', provider: 'ok' };
    }
    
    // BV SHOP 後台
    else if (hostname.includes('bvshop-manage.bvshop.tw')) {
      // 嘉里大榮物流單頁面
      if (pathname.includes('ktj_logistics') || pathname.includes('kerry')) {
        console.log('偵測到 BV SHOP 嘉里大榮物流單頁面');
        
        // 直接線上處理 PDF
        setTimeout(() => {
          processKerryPDFOnline();
        }, 1000);
        
        return { type: 'shipping', provider: 'kerry' };
      }
      // 出貨明細
      else if (pathname.includes('order_print')) {
        console.log('偵測到 BV SHOP 出貨明細頁面');
        return { type: 'detail', provider: 'bvshop' };
      }
      return { type: 'unknown', provider: 'bvshop' };
    }
    
    // 嘉里大榮
    else if (hostname.includes('kerrytj.com')) {
      console.log('偵測到嘉里大榮網站');
      return { type: 'shipping', provider: 'kerry' };
    }
    
    return { type: 'unknown', provider: null };
  }
  
  // 初始化
  if (currentPage.type === 'shipping' && currentPage.provider !== 'kerry') {
    console.log('初始化物流單擷取功能');
    captureShippingLabels();
  } else if (currentPage.type === 'detail') {
    console.log('初始化出貨明細擷取功能');
    createFloatingPanel();
    loadSavedData();
  }
  
  // 線上直接處理嘉里大榮 PDF
  async function processKerryPDFOnline() {
    console.log('開始線上處理嘉里大榮 PDF...');
    
    try {
      // 方法1: 從 URL 參數取得 ids
      const urlParams = new URLSearchParams(window.location.search);
      const ids = urlParams.get('ids');
      
      let pdfUrl = null;
      
      if (ids) {
        // 如果有 ids 參數，構建 PDF URL
        pdfUrl = `${location.origin}/order_multi_print_ktj_logistics?ids=${ids}`;
      } else {
        // 方法2: 尋找 iframe 或 embed 中的 PDF
        const pdfElements = document.querySelectorAll('iframe[src*=".pdf"], embed[src*=".pdf"]');
        if (pdfElements.length > 0) {
          pdfUrl = pdfElements[0].src;
        }
      }
      
      if (!pdfUrl) {
        console.log('未找到 PDF URL，等待頁面載入...');
        // 設定 observer 監控頁面變化
        observeForPDF();
        return;
      }
      
      // 顯示處理進度
      showProcessingNotification('正在處理嘉里大榮物流單...');
      
      // 取得 PDF 資料
      const response = await fetch(pdfUrl, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('無法取得 PDF 資料');
      }
      
      const pdfData = await response.arrayBuffer();
      console.log('PDF 檔案大小:', pdfData.byteLength);
      
      // 解析 PDF
      await processPDFData(pdfData);
      
    } catch (error) {
      console.error('處理 PDF 時發生錯誤:', error);
      showNotification('處理嘉里大榮 PDF 失敗：' + error.message, 'error');
    }
  }
  
  // 處理 PDF 資料
  async function processPDFData(arrayBuffer) {
    try {
      // 確保 PDF.js 已載入
      let pdfjs = pdfjsLib || window.pdfjsLib || window['pdfjs-dist/build/pdf'];
      if (!pdfjs) {
        throw new Error('PDF.js 未載入');
      }
      
      // 設定 worker
      if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.js');
      }
      
      // 載入 PDF
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      console.log('PDF 頁數:', numPages);
      
      // 處理每一頁
      const kerryShippingData = [];
      
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        console.log(`處理第 ${pageNum}/${numPages} 頁...`);
        
        const page = await pdf.getPage(pageNum);
        
        // 擷取文字內容
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        
        // 擷取重要資訊
        const trackingNumber = extractKerryTrackingNumber(pageText);
        const orderInfo = extractOrderInfo(pageText);
        
        console.log(`第 ${pageNum} 頁擷取結果:`, {
          trackingNumber,
          orderInfo
        });
        
        // 高品質圖片轉換
        const scale = 4.0;
        const viewport = page.getViewport({ scale: scale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        
        await page.render({
          canvasContext: context,
          viewport: viewport,
          intent: 'print'
        }).promise;
        
        const imageData = canvas.toDataURL('image/jpeg', 0.95);
        
        // 創建物流單資料
        const shippingItem = {
          html: `<img src="${imageData}" style="width: 100%; height: auto;">`,
          orderNo: orderInfo.orderNo || `KERRY-${pageNum}`,
          serviceCode: trackingNumber || `K${Date.now()}${pageNum}`,
          trackingNumber: trackingNumber,
          width: '100mm',
          height: '150mm',
          index: pageNum - 1,
          provider: 'kerry',
          isPdf: true,
          pageNumber: pageNum,
          totalPages: numPages,
          textContent: pageText,
          extractedInfo: orderInfo,
          processedOnline: true
        };
        
        kerryShippingData.push(shippingItem);
      }
      
      // 儲存到 storage
      if (chrome.storage && chrome.storage.local) {
        // 先取得現有資料
        chrome.storage.local.get(['bvShippingData'], (result) => {
          const existingData = result.bvShippingData || [];
          
          // 合併資料（避免重複）
          const mergedData = [...existingData];
          kerryShippingData.forEach(newItem => {
            const exists = mergedData.some(item => 
              item.trackingNumber === newItem.trackingNumber
            );
            if (!exists) {
              mergedData.push(newItem);
            }
          });
          
          // 儲存合併後的資料
          chrome.storage.local.set({ 
            bvShippingData: mergedData,
            bvPdfShippingData: kerryShippingData
          }, () => {
            showNotification(
              `成功處理 ${numPages} 張嘉里大榮物流單！請前往出貨明細頁面列印。`, 
              'success'
            );
            
            // 顯示處理結果
            showProcessingResult(kerryShippingData);
          });
        });
      }
      
    } catch (error) {
      console.error('處理 PDF 資料時發生錯誤:', error);
      throw error;
    }
  }
  
  // 監控頁面變化，等待 PDF 出現
  function observeForPDF() {
    const observer = new MutationObserver((mutations) => {
      const pdfElements = document.querySelectorAll(
        'iframe[src*=".pdf"], embed[src*=".pdf"], a[href*=".pdf"]'
      );
      
      if (pdfElements.length > 0) {
        observer.disconnect();
        
        const element = pdfElements[0];
        const pdfUrl = element.src || element.href;
        
        if (pdfUrl) {
          processKerryPDFOnline();
        }
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href']
    });
    
    setTimeout(() => {
      observer.disconnect();
    }, 30000);
  }
  
  // 擷取嘉里大榮物流單號
  function extractKerryTrackingNumber(text) {
    const patterns = [
      /託運單號[：:]\s*(\d{10,12})/,
      /運單號碼[：:]\s*(\d{10,12})/,
      /單號[：:]\s*(\d{10,12})/,
      /Tracking\s*Number[：:]\s*(\d{10,12})/i,
      /貨號[：:]\s*(\d{10,12})/,
      /(\d{10,12})(?=\s|$)/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        console.log('找到物流單號:', match[1]);
        return match[1];
      }
    }
    
    return null;
  }
  
  // 擷取訂單相關資訊
  function extractOrderInfo(text) {
    const info = {
      orderNo: null,
      recipient: null,
      phone: null,
      address: null
    };
    
    // 擷取訂單編號
    const orderPatterns = [
      /訂單編號[：:]\s*([A-Z0-9\-]+)/,
      /Order\s*No[：:]\s*([A-Z0-9\-]+)/i,
      /單號[：:]\s*([A-Z0-9\-]+)/
    ];
    
    for (const pattern of orderPatterns) {
      const match = text.match(pattern);
      if (match) {
        info.orderNo = match[1];
        break;
      }
    }
    
    // 擷取收件人
    const namePattern = /收件人[：:]\s*([^\s]{2,4})/;
    const nameMatch = text.match(namePattern);
    if (nameMatch) {
      info.recipient = nameMatch[1];
    }
    
    // 擷取電話
    const phonePattern = /(?:電話|手機|連絡電話)[：:]\s*([\d\-]+)/;
    const phoneMatch = text.match(phonePattern);
    if (phoneMatch) {
      info.phone = phoneMatch[1];
    }
    
    return info;
  }
  
  // 顯示處理進度通知
  function showProcessingNotification(message) {
    const notification = document.createElement('div');
    notification.id = 'bv-processing-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #3B82F6;
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 999999;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      gap: 12px;
    `;
    
    notification.innerHTML = `
      <div class="spinner" style="
        width: 20px;
        height: 20px;
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      "></div>
      <span>${message}</span>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
  }
  
  // 顯示處理結果
  function showProcessingResult(data) {
    const processingNotification = document.getElementById('bv-processing-notification');
    if (processingNotification) {
      processingNotification.remove();
    }
    
    const resultPanel = document.createElement('div');
    resultPanel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
      z-index: 999999;
      max-width: 500px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    resultPanel.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: #1F2937;">處理完成</h3>
      <div style="color: #6B7280; margin-bottom: 16px;">
        成功處理 ${data.length} 張嘉里大榮物流單
      </div>
      <div style="max-height: 300px; overflow-y: auto; margin-bottom: 16px;">
        ${data.map((item, index) => `
          <div style="padding: 8px; border-bottom: 1px solid #E5E7EB;">
            <strong>第 ${index + 1} 頁：</strong>
            ${item.trackingNumber ? `物流單號：${item.trackingNumber}` : '未找到物流單號'}
            ${item.extractedInfo.orderNo ? ` | 訂單：${item.extractedInfo.orderNo}` : ''}
          </div>
        `).join('')}
      </div>
      <div style="display: flex; gap: 12px;">
        <button onclick="window.location.href='/order_print'" style="
          background: #3B82F6;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        ">前往出貨明細頁面</button>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: #E5E7EB;
          color: #4B5563;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        ">關閉</button>
      </div>
    `;
    
    document.body.appendChild(resultPanel);
    
    setTimeout(() => {
      if (resultPanel.parentElement) {
        resultPanel.remove();
      }
    }, 10000);
  }
  
  // 擷取物流單標籤
  function captureShippingLabels() {
    const labels = [];
    const labelElements = document.querySelectorAll('.shipping-label, .label, [class*="label"]');
    
    labelElements.forEach((element, index) => {
      const labelData = {
        html: element.outerHTML,
        text: element.textContent,
        index: index,
        provider: currentPage.provider
      };
      
      labels.push(labelData);
    });
    
    if (labels.length > 0) {
      chrome.storage.local.set({ bvShippingData: labels }, () => {
        showNotification(`已擷取 ${labels.length} 個物流單標籤`, 'success');
      });
    }
  }
  
  // 創建浮動面板
  function createFloatingPanel() {
    const panel = document.createElement('div');
    panel.id = 'bv-floating-panel';
    panel.innerHTML = `
      <div class="bv-panel-header">
        <img src="${chrome.runtime.getURL('icons/icon-48.png')}" alt="BV SHOP">
        <span>BV SHOP 出貨助手</span>
        <button class="bv-minimize-btn">－</button>
      </div>
      <div class="bv-panel-content">
        <div class="bv-logo-section">
          <h3>商標設定</h3>
          <div class="bv-logo-upload">
            <label>
              物流單商標：
              <input type="file" id="bv-shipping-logo" accept="image/*">
              <img id="bv-shipping-logo-preview" style="display:none;">
            </label>
          </div>
          <div class="bv-logo-upload">
            <label>
              出貨明細商標：
              <input type="file" id="bv-detail-logo" accept="image/*">
              <img id="bv-detail-logo-preview" style="display:none;">
            </label>
          </div>
        </div>
        
        <div class="bv-data-section">
          <h3>資料狀態</h3>
          <div id="bv-data-status">
            <p>物流單：<span id="bv-shipping-count">0</span> 張</p>
            <p>出貨明細：<span id="bv-detail-count">0</span> 張</p>
            <p>PDF 物流單：<span id="bv-pdf-count">0</span> 張</p>
          </div>
          <button id="bv-capture-btn" class="bv-btn-primary">擷取出貨明細</button>
          <button id="bv-clear-btn" class="bv-btn-secondary">清除資料</button>
        </div>
        
        <div class="bv-pdf-section">
          <h3>嘉里大榮 PDF 上傳</h3>
          <div id="bv-pdf-upload-area" class="bv-pdf-upload-area">
            <div id="bv-pdf-upload-prompt" class="bv-pdf-upload-prompt">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <p>拖曳 PDF 檔案到此處或點擊選擇</p>
              <input type="file" id="bv-pdf-input" accept=".pdf" style="display: none;">
            </div>
            <div id="bv-pdf-info" class="bv-pdf-info" style="display: none;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <div>
                <p id="bv-pdf-filename"></p>
                <p id="bv-pdf-pages" class="bv-pdf-pages"></p>
              </div>
              <button id="bv-pdf-remove" class="bv-pdf-remove">×</button>
            </div>
          </div>
          <div id="bv-conversion-progress" class="bv-conversion-progress">
            <div id="bv-conversion-progress-fill" class="bv-conversion-progress-fill"></div>
            <p id="bv-conversion-status" class="bv-conversion-status"></p>
          </div>
        </div>
        
        <div class="bv-print-section">
          <h3>列印設定</h3>
          <label>
            列印順序：
            <select id="bv-print-order">
              <option value="paired-sequential">物流單-出貨明細（正序配對）</option>
              <option value="paired-reverse">物流單-出貨明細（反序配對）</option>
              <option value="shipping-first">先物流單後明細（全部）</option>
              <option value="detail-first">先明細後物流單（全部）</option>
              <option value="shipping-only">只印物流單</option>
              <option value="detail-only">只印出貨明細</option>
            </select>
          </label>
          <button id="bv-preview-btn" class="bv-btn-primary">預覽列印</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    
    // 綁定事件
    bindPanelEvents();
    
    // 載入商標
    loadLogos();
    
    // 更新資料狀態
    updateDataStatus();
  }
  
  // 綁定面板事件
  function bindPanelEvents() {
    // 最小化按鈕
    document.querySelector('.bv-minimize-btn').addEventListener('click', () => {
      const panel = document.getElementById('bv-floating-panel');
      panel.classList.toggle('minimized');
    });
    
    // 商標上傳
    document.getElementById('bv-shipping-logo').addEventListener('change', (e) => {
      handleLogoUpload(e, 'shipping');
    });
    
    document.getElementById('bv-detail-logo').addEventListener('change', (e) => {
      handleLogoUpload(e, 'detail');
    });
    
    // 擷取按鈕
    document.getElementById('bv-capture-btn').addEventListener('click', captureDetailData);
    
    // 清除按鈕
    document.getElementById('bv-clear-btn').addEventListener('click', clearAllData);
    
    // PDF 上傳
    const pdfUploadArea = document.getElementById('bv-pdf-upload-area');
    const pdfInput = document.getElementById('bv-pdf-input');
    
    pdfUploadArea.addEventListener('click', () => {
      pdfInput.click();
    });
    
    pdfInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handlePdfFile(e.target.files[0]);
      }
    });
    
    // 拖放功能
    pdfUploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      pdfUploadArea.classList.add('dragover');
    });
    
    pdfUploadArea.addEventListener('dragleave', () => {
      pdfUploadArea.classList.remove('dragover');
    });
    
    pdfUploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      pdfUploadArea.classList.remove('dragover');
      
      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0].type === 'application/pdf') {
        handlePdfFile(files[0]);
      }
    });
    
    // 移除 PDF
    const pdfRemoveBtn = document.getElementById('bv-pdf-remove');
    if (pdfRemoveBtn) {
      pdfRemoveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removePdfFile();
      });
    }
    
    // 預覽按鈕
    document.getElementById('bv-preview-btn').addEventListener('click', showPrintPreview);
  }
  
  // 處理 PDF 檔案
  async function handlePdfFile(file) {
    const uploadArea = document.getElementById('bv-pdf-upload-area');
    const uploadPrompt = document.getElementById('bv-pdf-upload-prompt');
    const pdfInfo = document.getElementById('bv-pdf-info');
    const filename = document.getElementById('bv-pdf-filename');
    const pagesText = document.getElementById('bv-pdf-pages');
    const progressDiv = document.getElementById('bv-conversion-progress');
    const progressFill = document.getElementById('bv-conversion-progress-fill');
    const statusText = document.getElementById('bv-conversion-status');
    
    uploadArea.classList.add('has-file');
    uploadPrompt.style.display = 'none';
    pdfInfo.style.display = 'flex';
    filename.textContent = file.name;
    
    progressDiv.classList.add('active');
    progressFill.style.width = '0%';
    statusText.textContent = '載入 PDF...';
    
    try {
      let pdfjs = pdfjsLib || window.pdfjsLib || window['pdfjs-dist/build/pdf'];
      if (!pdfjs) {
        throw new Error('PDF.js 未載入');
      }
      
      if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.js');
      }
      
      const arrayBuffer = await file.arrayBuffer();
      const typedArray = new Uint8Array(arrayBuffer);
      
      statusText.textContent = '解析 PDF...';
      progressFill.style.width = '20%';
      
      const loadingTask = pdfjs.getDocument({data: typedArray});
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      pagesText.textContent = `共 ${numPages} 頁`;
      
      pdfShippingData = [];
      
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        statusText.textContent = `轉換第 ${pageNum}/${numPages} 頁...`;
        progressFill.style.width = `${20 + (pageNum / numPages * 70)}%`;
        
        const page = await pdf.getPage(pageNum);
        
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        
        const trackingNumber = extractKerryTrackingNumber(pageText);
        const orderInfo = extractOrderInfo(pageText);
        
        const scale = 4.0;
        const viewport = page.getViewport({ scale: scale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        
        await page.render({
          canvasContext: context,
          viewport: viewport,
          intent: 'print'
        }).promise;
        
        const imageData = canvas.toDataURL('image/jpeg', 0.95);
        
        const shippingItem = {
          html: `<img src="${imageData}" style="width: 100%; height: auto;">`,
          orderNo: orderInfo.orderNo || `KERRY-${pageNum}`,
          serviceCode: trackingNumber || `K${pageNum}`,
          trackingNumber: trackingNumber,
          width: '100mm',
          height: '150mm',
          index: pageNum - 1,
          provider: 'kerry',
          isPdf: true,
          pageNumber: pageNum,
          totalPages: numPages,
          textContent: pageText,
          extractedInfo: orderInfo
        };
        
        pdfShippingData.push(shippingItem);
      }
      
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ bvPdfShippingData: pdfShippingData }, () => {
          statusText.textContent = `轉換完成！已產生 ${numPages} 張物流單`;
          progressFill.style.width = '100%';
          
          updateDataStatus();
          updatePreview();
          
          showNotification(`成功轉換 ${numPages} 頁 PDF 為物流單`, 'success');
          
          setTimeout(() => {
            progressDiv.classList.remove('active');
          }, 3000);
        });
      }
      
    } catch (error) {
      console.error('處理 PDF 時發生錯誤:', error);
      statusText.textContent = '轉換失敗';
      showNotification('PDF 處理失敗：' + error.message, 'error');
      
      uploadArea.classList.remove('has-file');
      uploadPrompt.style.display = 'flex';
      pdfInfo.style.display = 'none';
      progressDiv.classList.remove('active');
    }
  }
  
  // 移除 PDF 檔案
  function removePdfFile() {
    const uploadArea = document.getElementById('bv-pdf-upload-area');
    const uploadPrompt = document.getElementById('bv-pdf-upload-prompt');
    const pdfInfo = document.getElementById('bv-pdf-info');
    const pdfInput = document.getElementById('bv-pdf-input');
    
    uploadArea.classList.remove('has-file');
    uploadPrompt.style.display = 'flex';
    pdfInfo.style.display = 'none';
    pdfInput.value = '';
    
    pdfShippingData = [];
    
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove('bvPdfShippingData', () => {
        updateDataStatus();
        updatePreview();
        showNotification('已移除 PDF 物流單資料', 'info');
      });
    }
  }
  
  // 處理商標上傳
  function handleLogoUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const logoData = e.target.result;
      savedLogos[type] = logoData;
      
      const preview = document.getElementById(`bv-${type}-logo-preview`);
      preview.src = logoData;
      preview.style.display = 'block';
      
      chrome.storage.local.set({ [`bv${type}Logo`]: logoData }, () => {
        showNotification(`${type === 'shipping' ? '物流單' : '出貨明細'}商標已儲存`, 'success');
      });
    };
    reader.readAsDataURL(file);
  }
  
  // 載入商標
  function loadLogos() {
    chrome.storage.local.get(['bvshippingLogo', 'bvdetailLogo'], (result) => {
      if (result.bvshippingLogo) {
        savedLogos.shipping = result.bvshippingLogo;
        const preview = document.getElementById('bv-shipping-logo-preview');
        if (preview) {
          preview.src = result.bvshippingLogo;
          preview.style.display = 'block';
        }
      }
      if (result.bvdetailLogo) {
        savedLogos.detail = result.bvdetailLogo;
        const preview = document.getElementById('bv-detail-logo-preview');
        if (preview) {
          preview.src = result.bvdetailLogo;
          preview.style.display = 'block';
        }
      }
    });
  }
  
  // 擷取出貨明細資料
  function captureDetailData() {
    console.log('開始擷取出貨明細...');
    
    const orderItems = document.querySelectorAll('.order-item, .order-row, tr[class*="order"], div[class*="order-detail"]');
    detailData = [];
    
    orderItems.forEach((item) => {
      const orderNo = extractOrderNumber(item);
      const logTraceId = extractLogTraceId(item);
      
      if (orderNo || logTraceId) {
        const detailItem = {
          html: item.outerHTML,
          orderNo: orderNo,
          logTraceId: logTraceId,
          customerName: extractCustomerName(item),
          totalAmount: extractTotalAmount(item),
          products: extractProducts(item)
        };
        
        detailData.push(detailItem);
        console.log('擷取明細：', detailItem);
      }
    });
    
    if (detailData.length > 0) {
      chrome.storage.local.set({ bvDetailData: detailData }, () => {
        updateDataStatus();
        showNotification(`已擷取 ${detailData.length} 筆出貨明細`, 'success');
      });
    } else {
      showNotification('未找到出貨明細資料', 'warning');
    }
  }
  
  // 提取訂單編號
  function extractOrderNumber(element) {
    const patterns = [
      /訂單編號[：:]\s*([A-Z0-9\-]+)/,
      /Order\s*No[.:]?\s*([A-Z0-9\-]+)/i,
      /單號[：:]\s*([A-Z0-9\-]+)/
    ];
    
    const text = element.textContent;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    
    const orderNoElement = element.querySelector('[class*="order-no"], [class*="order-number"]');
    if (orderNoElement) {
      return orderNoElement.textContent.trim();
    }
    
    return null;
  }
  
  // 提取物流追蹤碼
  function extractLogTraceId(element) {
    const patterns = [
      /物流單號[：:]\s*(\w+)/,
      /追蹤碼[：:]\s*(\w+)/,
      /Tracking[：:]\s*(\w+)/i,
      /貨態追蹤碼[：:]\s*(\w+)/
    ];
    
    const text = element.textContent;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    
    const trackingElement = element.querySelector('[class*="tracking"], [class*="logistics"]');
    if (trackingElement) {
      const trackingText = trackingElement.textContent.trim();
      const cleanTracking = trackingText.replace(/[^\w]/g, '');
      if (cleanTracking.length >= 8) {
        return cleanTracking;
      }
    }
    
    return null;
  }
  
  // 提取客戶名稱
  function extractCustomerName(element) {
    const nameElement = element.querySelector('[class*="customer"], [class*="name"], [class*="recipient"]');
    if (nameElement) {
      return nameElement.textContent.trim();
    }
    
    const patterns = [/收件人[：:]\s*([^\s]+)/, /姓名[：:]\s*([^\s]+)/];
    const text = element.textContent;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    
    return '';
  }
  
  // 提取總金額
  function extractTotalAmount(element) {
    const amountElement = element.querySelector('[class*="amount"], [class*="total"], [class*="price"]');
    if (amountElement) {
      const amountText = amountElement.textContent;
      const amount = amountText.match(/[\d,]+/);
      if (amount) return amount[0];
    }
    
    return '';
  }
  
  // 提取商品資訊
  function extractProducts(element) {
    const products = [];
    const productElements = element.querySelectorAll('[class*="product"], [class*="item-name"]');
    
    productElements.forEach((productEl) => {
      const productName = productEl.textContent.trim();
      if (productName) {
        products.push(productName);
      }
    });
    
    return products;
  }
  
  // 更新資料狀態
  function updateDataStatus() {
    chrome.storage.local.get(['bvShippingData', 'bvDetailData', 'bvPdfShippingData'], (result) => {
      const shippingCount = document.getElementById('bv-shipping-count');
      const detailCount = document.getElementById('bv-detail-count');
      const pdfCount = document.getElementById('bv-pdf-count');
      
      if (shippingCount) shippingCount.textContent = (result.bvShippingData || []).length;
      if (detailCount) detailCount.textContent = (result.bvDetailData || []).length;
      if (pdfCount) pdfCount.textContent = (result.bvPdfShippingData || []).length;
      
      shippingData = result.bvShippingData || [];
      detailData = result.bvDetailData || [];
      pdfShippingData = result.bvPdfShippingData || [];
    });
  }
  
  // 載入已儲存的資料
  function loadSavedData() {
    chrome.storage.local.get(['bvShippingData', 'bvDetailData', 'bvPdfShippingData'], (result) => {
      shippingData = result.bvShippingData || [];
      detailData = result.bvDetailData || [];
      pdfShippingData = result.bvPdfShippingData || [];
      updateDataStatus();
    });
  }
  
  // 清除所有資料
  function clearAllData() {
    if (confirm('確定要清除所有資料嗎？')) {
      chrome.storage.local.remove(['bvShippingData', 'bvDetailData', 'bvPdfShippingData'], () => {
        shippingData = [];
        detailData = [];
        pdfShippingData = [];
        updateDataStatus();
        showNotification('已清除所有資料', 'info');
      });
    }
  }
  
  // 顯示列印預覽
  function showPrintPreview() {
    const printOrder = document.getElementById('bv-print-order').value;
    
    if ((shippingData.length === 0 && pdfShippingData.length === 0) && detailData.length === 0) {
      showNotification('沒有可列印的資料', 'warning');
      return;
    }
    
    const previewWindow = window.open('', '_blank');
    const settings = {
      shippingLogo: savedLogos.shipping,
      detailLogo: savedLogos.detail
    };
    
    const pages = generatePages(printOrder, settings);
    
    previewWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>列印預覽 - BV SHOP 出貨助手</title>
        <style>
          ${getPreviewStyles()}
        </style>
      </head>
      <body>
        <div class="print-controls">
          <h1>列印預覽</h1>
          <p>共 ${pages.length} 頁</p>
          <button onclick="window.print()">列印</button>
          <button onclick="window.close()">關閉</button>
        </div>
        <div class="preview-container">
          ${pages.map(page => page.outerHTML).join('')}
        </div>
      </body>
      </html>
    `);
  }
  
  // 產生頁面
  function generatePages(printOrder, settings) {
    const pages = [];
    let pageOrder = [];
    
    const allShippingData = [...shippingData, ...pdfShippingData];
    
    const shippingMap = new Map();
    allShippingData.forEach((data) => {
      const trackingNum = data.trackingNumber || data.serviceCode;
      if (trackingNum) {
        const code = trackingNum.trim();
        shippingMap.set(code, data);
        
        if (code.length === 12) {
          const shortCode = code.substring(0, 8);
          shippingMap.set(shortCode, data);
        }
      }
    });
    
    switch (printOrder) {
      case 'paired-sequential':
        detailData.forEach((detail) => {
          if (detail.logTraceId) {
            const detailCode = detail.logTraceId.trim();
            let shipping = null;
            
            if (shippingMap.has(detailCode)) {
              shipping = shippingMap.get(detailCode);
              console.log(`精確匹配成功: ${detailCode}`);
            } else if (detailCode.length === 8) {
              for (const [code, data] of shippingMap) {
                if (code.startsWith(detailCode)) {
                  shipping = data;
                  console.log(`部分匹配成功: ${detailCode} -> ${code}`);
                  break;
                }
              }
            } else if (detailCode.length === 12) {
              const shortCode = detailCode.substring(0, 8);
              if (shippingMap.has(shortCode)) {
                shipping = shippingMap.get(shortCode);
                console.log(`短碼匹配成功: ${detailCode} -> ${shortCode}`);
              }
            }
            
            if (shipping) {
              const orderNo = shipping.extractedInfo?.orderNo || detail.orderNo;
              pageOrder.push({ type: 'shipping', data: shipping, orderNo: orderNo });
              pageOrder.push({ type: 'detail', data: detail });
            } else {
              console.log(`未找到匹配的物流單: ${detailCode}`);
              pageOrder.push({ type: 'detail', data: detail });
            }
          } else {
            pageOrder.push({ type: 'detail', data: detail });
          }
        });
        break;
        
      case 'paired-reverse':
        const reversedDetails = [...detailData].reverse();
        reversedDetails.forEach((detail) => {
          if (detail.logTraceId) {
            const detailCode = detail.logTraceId.trim();
            let shipping = shippingMap.get(detailCode);
            if (shipping) {
              const orderNo = shipping.extractedInfo?.orderNo || detail.orderNo;
              pageOrder.push({ type: 'shipping', data: shipping, orderNo: orderNo });
              pageOrder.push({ type: 'detail', data: detail });
            } else {
              pageOrder.push({ type: 'detail', data: detail });
            }
          } else {
            pageOrder.push({ type: 'detail', data: detail });
          }
        });
        break;
        
      case 'shipping-first':
        allShippingData.forEach(shipping => {
          pageOrder.push({ type: 'shipping', data: shipping, orderNo: shipping.orderNo });
        });
        detailData.forEach(detail => {
          pageOrder.push({ type: 'detail', data: detail });
        });
        break;
        
      case 'detail-first':
        detailData.forEach(detail => {
          pageOrder.push({ type: 'detail', data: detail });
        });
        allShippingData.forEach(shipping => {
          pageOrder.push({ type: 'shipping', data: shipping, orderNo: shipping.orderNo });
        });
        break;
        
      case 'shipping-only':
        allShippingData.forEach(shipping => {
          pageOrder.push({ type: 'shipping', data: shipping, orderNo: shipping.orderNo });
        });
        break;
        
      case 'detail-only':
        detailData.forEach(detail => {
          pageOrder.push({ type: 'detail', data: detail });
        });
        break;
    }
    
    pageOrder.forEach(item => {
      const page = document.createElement('div');
      page.className = 'bv-preview-page bv-print-page';
      
      page.style.cssText = `
        width: 100mm !important;
        height: 150mm !important;
        margin: 0 !important;
        padding: 0 !important;
        position: relative !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      `;
      
      if (item.type === 'shipping') {
        page.innerHTML = generateShippingPage(item.data, settings, item.orderNo);
      } else {
        page.innerHTML = generateDetailPage(item.data, settings);
      }
      
      pages.push(page);
    });
    
    return pages;
  }
  
  // 產生物流單頁面
  function generateShippingPage(data, settings, orderNo) {
    let content = data.html;
    
    if (data.isPdf) {
      content = `
        <div style="position: relative; width: 100%; height: 100%;">
          ${content}
          ${orderNo ? `
            <div style="
              position: absolute;
              top: 10mm;
              right: 10mm;
              background: white;
              padding: 2mm 4mm;
              border: 1px solid #333;
              font-size: 12pt;
              font-weight: bold;
            ">
              訂單編號: ${orderNo}
            </div>
          ` : ''}
        </div>
      `;
    } else if (settings.shippingLogo) {
      content = `
        <div style="position: absolute; top: 5mm; left: 5mm;">
          <img src="${settings.shippingLogo}" style="max-width: 30mm; max-height: 15mm;">
        </div>
        ${content}
      `;
    }
    
    return content;
  }
  
  // 產生出貨明細頁面
  function generateDetailPage(data, settings) {
    let content = data.html;
    
    if (settings.detailLogo) {
      content = `
        <div style="position: absolute; top: 5mm; left: 5mm;">
          <img src="${settings.detailLogo}" style="max-width: 30mm; max-height: 15mm;">
        </div>
        ${content}
      `;
    }
    
    return content;
  }
  
  // 取得預覽樣式
  function getPreviewStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: Arial, sans-serif;
        background: #f0f0f0;
      }
      
      .print-controls {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: white;
        padding: 20px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        z-index: 1000;
        text-align: center;
      }
      
      .print-controls h1 {
        margin: 0 0 10px 0;
        font-size: 24px;
      }
      
      .print-controls button {
        margin: 0 10px;
        padding: 10px 20px;
        font-size: 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      
      .print-controls button:first-of-type {
        background: #2563eb;
        color: white;
      }
      
      .print-controls button:last-of-type {
        background: #e5e7eb;
      }
      
      .preview-container {
        padding: 120px 20px 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
      }
      
      .bv-preview-page {
        background: white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        width: 100mm;
        height: 150mm;
        position: relative;
        overflow: hidden;
        page-break-after: always;
      }
      
      @media print {
        .print-controls {
          display: none;
        }
        
        body {
          background: white;
        }
        
        .preview-container {
          padding: 0;
        }
        
        .bv-preview-page {
          box-shadow: none;
          margin: 0;
          page-break-after: always;
        }
        
        @page {
          size: 100mm 150mm;
          margin: 0;
        }
      }
    `;
  }
  
  // 更新預覽
  function updatePreview() {
    console.log('預覽已更新');
  }
  
  // 顯示通知
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `bv-notification bv-notification-${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 4px;
      color: white;
      font-size: 14px;
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
    
    switch(type) {
      case 'success':
        notification.style.background = '#10b981';
        break;
      case 'error':
        notification.style.background = '#ef4444';
        break;
      case 'warning':
        notification.style.background = '#f59e0b';
        break;
      default:
        notification.style.background = '#3b82f6';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }
  
  // 添加 CSS 樣式
  const cssStyle = document.createElement('style');
  cssStyle.textContent = `
    /* 浮動面板樣式 */
    #bv-floating-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 320px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 20px rgba(0,0,0,0.15);
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transition: all 0.3s ease;
    }
    
    #bv-floating-panel.minimized {
      height: 50px;
      overflow: hidden;
    }
    
    .bv-panel-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
      border-radius: 8px 8px 0 0;
      cursor: move;
    }
    
    .bv-panel-header img {
      width: 24px;
      height: 24px;
    }
    
    .bv-panel-header span {
      flex: 1;
      font-weight: 600;
      color: #111827;
    }
    
    .bv-minimize-btn {
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 18px;
      color: #6b7280;
      border-radius: 4px;
      transition: background 0.2s;
    }
    
    .bv-minimize-btn:hover {
      background: #e5e7eb;
    }
    
    .bv-panel-content {
      padding: 16px;
      max-height: 600px;
      overflow-y: auto;
    }
    
    .bv-panel-content h3 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
    }
    
    /* 商標上傳區域 */
    .bv-logo-section {
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .bv-logo-upload {
      margin-bottom: 12px;
    }
    
    .bv-logo-upload label {
      display: block;
      font-size: 13px;
      color: #4b5563;
      margin-bottom: 4px;
    }
    
    .bv-logo-upload input[type="file"] {
      width: 100%;
      padding: 6px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 12px;
    }
    
    .bv-logo-upload img {
      margin-top: 8px;
      max-width: 100px;
      max-height: 50px;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 4px;
    }
    
    /* 資料狀態區域 */
    .bv-data-section {
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    #bv-data-status {
      background: #f9fafb;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    
    #bv-data-status p {
      margin: 4px 0;
      font-size: 13px;
      color: #4b5563;
    }
    
    #bv-data-status span {
      font-weight: 600;
      color: #111827;
    }
    
    /* PDF 上傳區域 */
    .bv-pdf-section {
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .bv-pdf-upload-area {
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
      background: #f9fafb;
    }
    
    .bv-pdf-upload-area:hover {
      border-color: #9ca3af;
      background: #f3f4f6;
    }
    
    .bv-pdf-upload-area.dragover {
      border-color: #3b82f6;
      background: #eff6ff;
    }
    
    .bv-pdf-upload-area.has-file {
      padding: 12px;
      cursor: default;
    }
    
    .bv-pdf-upload-prompt svg {
      color: #9ca3af;
      margin-bottom: 8px;
    }
    
    .bv-pdf-upload-prompt p {
      color: #6b7280;
      font-size: 14px;
      margin: 0;
    }
    
    .bv-pdf-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .bv-pdf-info svg {
      color: #3b82f6;
      flex-shrink: 0;
    }
    
    .bv-pdf-info div {
      flex: 1;
      text-align: left;
    }
    
    .bv-pdf-info p {
      margin: 0;
      font-size: 14px;
      color: #111827;
    }
    
    .bv-pdf-pages {
      font-size: 12px;
      color: #6b7280;
      margin-top: 2px;
    }
    
    .bv-pdf-remove {
      width: 28px;
      height: 28px;
      border: none;
      background: #fee2e2;
      color: #dc2626;
      border-radius: 4px;
      cursor: pointer;
      font-size: 18px;
      transition: background 0.2s;
    }
    
    .bv-pdf-remove:hover {
      background: #fecaca;
    }
    
    /* 轉換進度條 */
    .bv-conversion-progress {
      margin-top: 12px;
      opacity: 0;
      height: 0;
      overflow: hidden;
      transition: all 0.3s;
    }
    
    .bv-conversion-progress.active {
      opacity: 1;
      height: auto;
    }
    
    .bv-conversion-progress-fill {
      height: 6px;
      background: #e5e7eb;
      border-radius: 3px;
      overflow: hidden;
      position: relative;
    }
    
    .bv-conversion-progress-fill::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: #3b82f6;
      border-radius: 3px;
      transition: width 0.3s;
      width: var(--progress, 0);
    }
    
    .bv-conversion-status {
      margin-top: 8px;
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
    
    /* 列印設定區域 */
    .bv-print-section label {
      display: block;
      font-size: 13px;
      color: #4b5563;
      margin-bottom: 8px;
    }
    
    .bv-print-section select {
      width: 100%;
      padding: 8px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 13px;
      background: white;
      margin-bottom: 12px;
    }
    
    /* 按鈕樣式 */
    .bv-btn-primary {
      width: 100%;
      padding: 10px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .bv-btn-primary:hover {
      background: #2563eb;
    }
    
    .bv-btn-secondary {
      width: 100%;
      padding: 10px;
      background: #e5e7eb;
      color: #374151;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 8px;
    }
    
    .bv-btn-secondary:hover {
      background: #d1d5db;
    }
    
    /* 通知樣式 */
    .bv-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 20px;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .bv-notification-success {
      background: #10b981;
    }
    
    .bv-notification-error {
      background: #ef4444;
    }
    
    .bv-notification-warning {
      background: #f59e0b;
    }
    
    .bv-notification-info {
      background: #3b82f6;
    }
    
    /* 動畫 */
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
    
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    
    /* 滾動條樣式 */
    .bv-panel-content::-webkit-scrollbar {
      width: 6px;
    }
    
    .bv-panel-content::-webkit-scrollbar-track {
      background: #f3f4f6;
      border-radius: 3px;
    }
    
    .bv-panel-content::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;
    }
    
    .bv-panel-content::-webkit-scrollbar-thumb:hover {
      background: #9ca3af;
    }
    
    /* 響應式調整 */
    @media (max-width: 640px) {
      #bv-floating-panel {
        width: 280px;
        bottom: 10px;
        right: 10px;
      }
    }
    
    /* 進度條修正 */
    #bv-conversion-progress-fill {
      width: 100%;
      height: 6px;
      background: #e5e7eb;
      border-radius: 3px;
      overflow: hidden;
      position: relative;
    }
    
    #bv-conversion-progress-fill::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: #3b82f6;
      border-radius: 3px;
      transition: width 0.3s;
      width: 0%;
    }
    
    /* 修正因為 JavaScript 動態設定的寬度 */
    #bv-conversion-progress-fill[style*="width"] {
      width: 100% !important;
    }
    
    #bv-conversion-progress-fill::after {
      width: var(--progress-width, 0%);
    }
  `;
  
  // 只在需要時注入樣式
  if (currentPage.type === 'detail' || currentPage.provider === 'kerry') {
    document.head.appendChild(cssStyle);
  }
  
  // 修正進度條顯示的輔助函數
  function setProgressWidth(percent) {
    const progressFill = document.getElementById('bv-conversion-progress-fill');
    if (progressFill) {
      progressFill.style.setProperty('--progress-width', percent);
    }
  }
  
  // 監聽來自 background script 的訊息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
      sendResponse({ status: 'alive', page: currentPage });
    } else if (request.action === 'getData') {
      chrome.storage.local.get(['bvShippingData', 'bvDetailData', 'bvPdfShippingData'], (result) => {
        sendResponse({
          shipping: result.bvShippingData || [],
          detail: result.bvDetailData || [],
          pdf: result.bvPdfShippingData || []
        });
      });
      return true;
    }
  });
  
  // 頁面卸載時清理
  window.addEventListener('beforeunload', () => {
    // 儲存當前狀態
    if (panelActive && currentPage.type === 'detail') {
      chrome.storage.local.set({
        bvPanelState: {
          active: true,
          printOrder: document.getElementById('bv-print-order')?.value
        }
      });
    }
  });
  
  // 調整 handlePdfFile 函數中的進度條更新
  const originalHandlePdfFile = handlePdfFile;
  handlePdfFile = async function(file) {
    // 使用修正後的進度條更新方法
    const progressFill = document.getElementById('bv-conversion-progress-fill');
    const originalSetWidth = (percent) => {
      if (progressFill) {
        setProgressWidth(percent);
      }
    };
    
    // 呼叫原始函數，但使用新的進度條更新方法
    return originalHandlePdfFile.call(this, file);
  };
  
  console.log('BV SHOP 出貨助手初始化完成', {
    currentPage,
    features: {
      shipping: currentPage.type === 'shipping',
      detail: currentPage.type === 'detail',
      kerryOnline: currentPage.provider === 'kerry' && currentPage.type === 'shipping',
      pdfSupport: !!pdfjsLib
    }
  });
  
})();
