// BV SHOP 出貨助手 - 內容腳本 (完整版 - 支援物流編號比對與排版調整 + 嘉里大榮支援)
(function() {
  'use strict';
  
  console.log('BV SHOP 出貨助手已載入');
  
  // 檢查 PDF.js 是否載入
  console.log('檢查 PDF.js 狀態:', {
    pdfjsLib: typeof pdfjsLib !== 'undefined' ? 'exists' : 'undefined',
    windowPdfjsLib: typeof window.pdfjsLib !== 'undefined' ? 'exists' : 'undefined',
    pdfjsDistBuildPdf: typeof window['pdfjs-dist/build/pdf'] !== 'undefined' ? 'exists' : 'undefined'
  });
  
  // 全域變數（提前定義）
  let currentPage = detectCurrentPage();
  let shippingData = [];
  let detailData = [];
  let savedLogos = { shipping: null, detail: null };
  let panelActive = false;
  let cachedProviderSettings = {};
  let pdfShippingData = []; // 儲存從 PDF 轉換的物流單
  
  // 立即通知 background script
  if (chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({ action: 'contentScriptReady' });
    } catch (e) {
      console.log('無法連接到 background script:', e.message);
    }
  }
  
  // 設定訊息監聽器（在全域變數定義之後）
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('收到訊息:', request.action);
      
      // 回應 ping
      if (request.action === 'ping') {
        sendResponse({ status: 'pong' });
        return true;
      }
      
      // 處理切換面板
      if (request.action === 'togglePanel') {
        try {
          if (currentPage.type === 'detail') {
            if (panelActive) {
              deactivateDetailPanel();
            } else {
              activateDetailPanel();
            }
            sendResponse({ status: 'success' });
          } else if (currentPage.type === 'shipping') {
            // 物流單頁面不需要切換，但回應成功
            sendResponse({ status: 'success', message: 'Shipping page panel is always visible' });
          } else {
            sendResponse({ status: 'error', message: 'Unsupported page type' });
          }
        } catch (error) {
          console.error('處理訊息時發生錯誤:', error);
          sendResponse({ status: 'error', message: error.message });
        }
        return true;
      }
      
      // 未知的 action
      sendResponse({ status: 'unknown action' });
      return true;
    });
  }

  // 偵測當前頁面類型
  function detectCurrentPage() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    
    console.log('偵測頁面 - hostname:', hostname, 'pathname:', pathname);
    
    // 7-11 物流單頁面
    if (hostname.includes('myship.7-11.com.tw') || 
        hostname.includes('epayment.7-11.com.tw') ||
        hostname.includes('eship.7-11.com.tw')) {
      return { type: 'shipping', provider: 'seven' };
    } 
    // 全家物流單
    else if (hostname.includes('family.com.tw') || 
             hostname.includes('famiport.com.tw')) {
      return { type: 'shipping', provider: 'family' };
    } 
    // 萊爾富物流單
    else if (hostname.includes('hilife.com.tw')) {
      return { type: 'shipping', provider: 'hilife' };
    } 
    // OK 超商
    else if (hostname.includes('okmart.com.tw')) {
      return { type: 'shipping', provider: 'okmart' };
    }
    // 嘉里大榮物流單 (外部網站)
    else if (hostname.includes('kerrytj.com')) {
      return { type: 'shipping', provider: 'kerry' };
    }
    // BV SHOP 後台
    else if (hostname.includes('bvshop-manage.bvshop.tw')) {
      // 嘉里大榮物流單頁面 (在 BV SHOP 後台內)
      if (pathname.includes('ktj_logistics') || pathname.includes('kerry')) {
        console.log('偵測到 BV SHOP 嘉里大榮物流單頁面');
        return { type: 'shipping', provider: 'kerry' };
      }
      // 出貨明細列印頁面
      else if (pathname === '/order_print' || 
               (pathname.includes('order_print') && !pathname.includes('ktj'))) {
        console.log('偵測到 BV SHOP 出貨明細列印頁面');
        return { type: 'detail', provider: 'bvshop' };
      }
    }
    
    return { type: 'unknown', provider: null };
  }
  
  // 修改 handleKerryShippingPage 函數
  function handleKerryShippingPage() {
    console.log('處理嘉里大榮物流單頁面');
    
    // 如果是 PDF 預覽頁面，直接開始處理
    if (isPdfPage()) {
      console.log('偵測到嘉里大榮 PDF 頁面，開始自動處理...');
      
      // 延遲一秒確保頁面載入完成
      setTimeout(() => {
        autoProcessKerryPdf();
      }, 1000);
    } else {
      // 非 PDF 頁面，顯示提示
      showKerryNotification();
    }
  }
  
  // 檢查是否為 PDF 頁面
  function isPdfPage() {
    // 檢查 URL
    if (window.location.href.includes('.pdf')) {
      return true;
    }
    
    // 檢查頁面內容
    const hasPdfEmbed = document.querySelector('embed[type="application/pdf"]') !== null;
    const hasPdfObject = document.querySelector('object[type="application/pdf"]') !== null;
    const hasPdfIframe = document.querySelector('iframe[src*=".pdf"]') !== null;
    
    // 檢查 content-type
    const isPdfContentType = document.contentType === 'application/pdf';
    
    return hasPdfEmbed || hasPdfObject || hasPdfIframe || isPdfContentType;
  }
  
  // 取得 PDF URL
  function getPdfUrl() {
    // 如果當前頁面就是 PDF
    if (window.location.href.includes('.pdf')) {
      return window.location.href;
    }
    
    // 尋找 embed 標籤
    const embed = document.querySelector('embed[src*=".pdf"]');
    if (embed) return embed.src;
    
    // 尋找 object 標籤
    const objectElement = document.querySelector('object[data*=".pdf"]');
    if (objectElement) return objectElement.data;
    
    // 尋找 iframe
    const iframe = document.querySelector('iframe[src*=".pdf"]');
    if (iframe) return iframe.src;
    
    return null;
  }
  
  // 自動處理嘉里大榮 PDF（簡化版，不需要傳入 URL）
  async function autoProcessKerryPdf() {
    try {
      // 取得 PDF URL
      const pdfUrl = getPdfUrl() || window.location.href;
      console.log('PDF URL:', pdfUrl);
      
      // 顯示處理中的提示（更簡潔）
      showProcessingNotification();
      
      // 發送到 background script 處理
      const result = await chrome.runtime.sendMessage({
        action: 'processKerryPdf',
        pdfUrl: pdfUrl
      });
      
      if (result.success) {
        // 儲存處理結果
        await chrome.storage.local.set({
          kerryProcessedPages: result.pages,
          kerryProcessTime: Date.now(),
          kerryAutoProcessed: true,
          kerryPdfUrl: pdfUrl
        });
        
        // 顯示成功訊息
        hideProcessingNotification();
        
        // 顯示完成通知並提供跳轉選項
        showCompletionNotification(result.totalPages);
        
      } else {
        throw new Error(result.error || '處理失敗');
      }
      
    } catch (error) {
      hideProcessingNotification();
      console.error('自動處理 PDF 失敗:', error);
      
      // 顯示錯誤但提供重試選項
      showErrorNotification(error.message);
    }
  }
  
  // 顯示處理中通知（更簡潔）
  function showProcessingNotification() {
    // 移除舊的通知
    const oldNotification = document.getElementById('bv-kerry-notification');
    if (oldNotification) oldNotification.remove();
    
    const notification = document.createElement('div');
    notification.id = 'bv-kerry-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #5865F2;
      color: white;
      padding: 20px 30px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 999999;
      max-width: 350px;
      display: flex;
      align-items: center;
      gap: 15px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    notification.innerHTML = `
      <div class="bv-spinner" style="
        width: 24px;
        height: 24px;
        border: 3px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      "></div>
      <div>
        <h4 style="margin: 0 0 5px 0; font-size: 16px;">正在處理嘉里大榮物流單</h4>
        <p style="margin: 0; font-size: 14px; opacity: 0.9;">請稍候，系統正在轉換 PDF...</p>
      </div>
    `;
    
    // 添加旋轉動畫
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
  }
  
  // 隱藏處理中通知
  function hideProcessingNotification() {
    const notification = document.getElementById('bv-kerry-notification');
    if (notification) {
      notification.style.transition = 'opacity 0.3s';
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }
  }
  
  // 顯示完成通知
  function showCompletionNotification(totalPages) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #10B981;
      color: white;
      padding: 20px 30px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 999999;
      max-width: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
        <span style="font-size: 24px;">✅</span>
        <div>
          <h4 style="margin: 0 0 5px 0; font-size: 16px;">處理完成！</h4>
          <p style="margin: 0; font-size: 14px;">成功處理 ${totalPages} 頁嘉里大榮物流單</p>
        </div>
      </div>
      <div style="display: flex; gap: 10px; margin-top: 15px;">
        <button onclick="window.location.href='https://bvshop-manage.bvshop.tw/order_print'" style="
          background: white;
          color: #10B981;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          font-size: 14px;
        ">前往出貨明細</button>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: rgba(255,255,255,0.2);
          color: white;
          border: 1px solid rgba(255,255,255,0.3);
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        ">關閉</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // 10秒後自動移除
    setTimeout(() => {
      if (notification.parentElement) {
        notification.style.transition = 'opacity 0.3s';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
      }
    }, 10000);
  }
  
  // 顯示錯誤通知
  function showErrorNotification(errorMessage) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #EF4444;
      color: white;
      padding: 20px 30px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 999999;
      max-width: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
        <span style="font-size: 24px;">❌</span>
        <div>
          <h4 style="margin: 0 0 5px 0; font-size: 16px;">處理失敗</h4>
          <p style="margin: 0; font-size: 14px;">${errorMessage}</p>
        </div>
      </div>
      <div style="display: flex; gap: 10px; margin-top: 15px;">
        <button onclick="location.reload()" style="
          background: white;
          color: #EF4444;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          font-size: 14px;
        ">重新整理</button>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: rgba(255,255,255,0.2);
          color: white;
          border: 1px solid rgba(255,255,255,0.3);
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        ">關閉</button>
      </div>
    `;
    
    document.body.appendChild(notification);
  }
  
  // 顯示嘉里大榮提示（當不是 PDF 頁面時）
  function showKerryNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #5865F2;
      color: white;
      padding: 20px 30px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 999999;
      max-width: 350px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    notification.innerHTML = `
      <h4 style="margin: 0 0 10px 0; font-size: 16px;">BV SHOP 出貨助手</h4>
      <p style="margin: 0; font-size: 14px; line-height: 1.5;">
        請開啟嘉里大榮物流單 PDF 檔案，系統將自動處理。
      </p>
      <button onclick="this.parentElement.remove()" style="
        margin-top: 15px;
        background: rgba(255,255,255,0.2);
        color: white;
        border: 1px solid rgba(255,255,255,0.3);
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      ">知道了</button>
    `;
    
    document.body.appendChild(notification);
    
    // 5秒後自動移除
    setTimeout(() => {
      if (notification.parentElement) {
        notification.style.transition = 'opacity 0.3s';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
      }
    }, 5000);
  }

  // 取得 PDF URL
  function getPdfUrl() {
    // 如果當前頁面就是 PDF
    if (window.location.href.includes('.pdf')) {
      return window.location.href;
    }
    
    // 尋找 embed 或 object 標籤
    const embed = document.querySelector('embed[src*=".pdf"]');
    if (embed) return embed.src;
    
    const object = document.querySelector('object[data*=".pdf"]');
    if (object) return object.data;
    
    // 尋找 iframe
    const iframe = document.querySelector('iframe[src*=".pdf"]');
    if (iframe) return iframe.src;
    
    return null;
  }

  // 開啟嘉里大榮控制面板
  function openKerryControlPanel() {
    // 發送訊息給 background script 開啟新視窗
    chrome.runtime.sendMessage({
      action: 'openKerryPanel'
    });
  }

  // 注入物流單面板
  function injectShippingPanel() {
    console.log('注入物流單面板');
    
    // 檢查是否已存在面板
    if (document.getElementById('bv-shipping-panel')) {
      console.log('面板已存在');
      return;
    }
    
    // 創建面板
    const panel = document.createElement('div');
    panel.id = 'bv-shipping-panel';
    panel.innerHTML = `
      <div class="bv-panel-content">
        <h3>BV SHOP 出貨助手</h3>
        <p>物流單抓取工具</p>
        
        <div class="bv-status">
          <span>已抓取：</span>
          <span id="bv-count">0</span>
          <span>張物流單</span>
        </div>
        
        <button id="bv-fetch-btn" class="bv-btn pulse">
          抓取物流單
        </button>
        
        <div class="bv-actions">
          <button id="bv-goto-detail" class="bv-action-btn">
            前往出貨明細頁面
          </button>
        </div>
        
        <div class="bv-footer">
          <small>v2.5.0</small>
        </div>
      </div>
    `;
    
    // 插入到頁面
    document.body.appendChild(panel);
    
    // 初始化事件監聽
    initializeShippingPanelEvents();
    
    // 更新狀態
    updateShippingPanelStatus();
  }

  // 初始化物流單面板事件
  function initializeShippingPanelEvents() {
    // 抓取按鈕
    const fetchBtn = document.getElementById('bv-fetch-btn');
    if (fetchBtn) {
      fetchBtn.addEventListener('click', fetchShippingData);
    }
    
    // 前往明細頁面按鈕
    const gotoDetailBtn = document.getElementById('bv-goto-detail');
    if (gotoDetailBtn) {
      gotoDetailBtn.addEventListener('click', () => {
        window.open('https://bvshop-manage.bvshop.tw/order_print', '_blank');
      });
    }
  }

  // 更新物流單面板狀態
  function updateShippingPanelStatus() {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['bvShippingData'], (result) => {
        const count = document.getElementById('bv-count');
        const fetchBtn = document.getElementById('bv-fetch-btn');
        if (count && result.bvShippingData) {
          count.textContent = result.bvShippingData.length;
          if (result.bvShippingData.length > 0 && fetchBtn) {
            fetchBtn.classList.remove('pulse');
          }
        }
      });
    }
  }

  // 抓取物流單 - 完整版本
  function fetchShippingData() {
    const btn = document.getElementById('bv-fetch-btn');
    btn.disabled = true;
    btn.innerHTML = '抓取中...';
    
    shippingData = [];
    
    // 根據不同超商使用不同的抓取邏輯
    switch (currentPage.provider) {
      case 'seven':
        fetch7ElevenShipping();
        break;
      case 'family':
        fetchFamilyShipping();
        break;
      case 'hilife':
        fetchHilifeShipping();
        break;
      case 'okmart':
        fetchOkmartShipping();
        break;
      default:
        showNotification('不支援的物流單類型', 'error');
        btn.disabled = false;
        btn.innerHTML = '重新抓取物流單';
        return;
    }
    
    // 儲存資料會在各個抓取函數中呼叫
  }
  
  // 7-11 物流單抓取
  function fetch7ElevenShipping() {
    console.log('開始抓取 7-11 物流單');
    
    let frames = document.querySelectorAll('.div_frame');
    console.log('找到的物流單框架數量:', frames.length);
    
    frames.forEach((frame, index) => {
      try {
        const computedStyle = window.getComputedStyle(frame);
        const wrapper = document.createElement('div');
        wrapper.className = 'bv-shipping-wrapper';
        
        // 複製樣式
        wrapper.style.cssText = frame.style.cssText;
        wrapper.style.width = computedStyle.width;
        wrapper.style.height = computedStyle.height;
        wrapper.innerHTML = frame.innerHTML;
        
        // 處理圖片
        processImages(wrapper, frame);
        
        // 處理所有的內部元素樣式
        const allElements = wrapper.querySelectorAll('*');
        const originalElements = frame.querySelectorAll('*');
        
        allElements.forEach((el, elIndex) => {
          if (originalElements[elIndex]) {
            const originalStyle = window.getComputedStyle(originalElements[elIndex]);
            // 複製重要的樣式屬性
            el.style.margin = originalStyle.margin;
            el.style.padding = originalStyle.padding;
            el.style.fontSize = originalStyle.fontSize;
            el.style.fontWeight = originalStyle.fontWeight;
            el.style.textAlign = originalStyle.textAlign;
            el.style.lineHeight = originalStyle.lineHeight;
            el.style.display = originalStyle.display;
            el.style.position = originalStyle.position;
            el.style.top = originalStyle.top;
            el.style.left = originalStyle.left;
            el.style.right = originalStyle.right;
            el.style.bottom = originalStyle.bottom;
          }
        });
        
        // 提取資訊
        const text = wrapper.textContent || '';
        let orderNo = '';
        let serviceCode = '';
        
        // 提取訂單編號
        const orderMatch = text.match(/(?:寄件)?訂單編號[：:]\s*(\w+)/);
        if (orderMatch) orderNo = orderMatch[1];
        
        // 提取服務代碼 - 支援多種格式
        const codePatterns = [
          /交貨便服務代碼[：:]\s*([FE]\d{7,11})/,
          /[FE]\d{7}(?:\d{4})?/
        ];
        
        for (const pattern of codePatterns) {
          const match = text.match(pattern);
          if (match) {
            serviceCode = match[1] || match[0];
            break;
          }
        }
        
        console.log(`物流單 ${index + 1} - 訂單編號: ${orderNo || '未找到'}, 服務代碼: ${serviceCode || '未找到'}`);
        
        shippingData.push({
          html: wrapper.outerHTML,
          orderNo: orderNo,
          serviceCode: serviceCode,
          width: computedStyle.width,
          height: computedStyle.height,
          index: index,
          provider: currentPage.provider
        });
        
      } catch (error) {
        console.error(`處理物流單 ${index + 1} 時發生錯誤:`, error);
      }
    });
    
    saveShippingData();
  }
  
  // 全家物流單抓取
  function fetchFamilyShipping() {
    console.log('開始抓取全家物流單');
    
    // 全家的選擇器可能不同，需要根據實際頁面調整
    const frames = document.querySelectorAll('.shipping-label, .print-area, [class*="label"]');
    
    frames.forEach((frame, index) => {
      try {
        const computedStyle = window.getComputedStyle(frame);
        const wrapper = frame.cloneNode(true);
        
        const text = wrapper.textContent || '';
        let orderNo = '';
        let serviceCode = '';
        
        // 全家的格式可能不同
        const orderMatch = text.match(/訂單[編號碼]*[：:]\s*(\w+)/);
        if (orderMatch) orderNo = orderMatch[1];
        
        // 全家通常使用 C 開頭的編號
        const codeMatch = text.match(/[C]\d{9,12}/);
        if (codeMatch) serviceCode = codeMatch[0];
        
        shippingData.push({
          html: wrapper.outerHTML,
          orderNo: orderNo,
          serviceCode: serviceCode,
          width: computedStyle.width,
          height: computedStyle.height,
          index: index,
          provider: currentPage.provider
        });
        
      } catch (error) {
        console.error(`處理全家物流單 ${index + 1} 時發生錯誤:`, error);
      }
    });
    
    saveShippingData();
  }
  
  // 萊爾富物流單抓取
  function fetchHilifeShipping() {
    console.log('開始抓取萊爾富物流單');
    // 實作萊爾富的抓取邏輯
    saveShippingData();
  }
  
  // OK超商物流單抓取
  function fetchOkmartShipping() {
    console.log('開始抓取OK超商物流單');
    // 實作OK超商的抓取邏輯
    saveShippingData();
  }
  
  // 處理圖片的輔助函數
  function processImages(wrapper, originalFrame) {
    const images = wrapper.querySelectorAll('img');
    const originalImages = originalFrame.querySelectorAll('img');
    
    images.forEach((img, imgIndex) => {
      const originalImg = originalImages[imgIndex];
      if (originalImg) {
        const imgStyle = window.getComputedStyle(originalImg);
        img.style.width = imgStyle.width;
        img.style.height = imgStyle.height;
        
        let srcUrl = originalImg.src || originalImg.getAttribute('src');
        if (srcUrl && !srcUrl.startsWith('data:') && !srcUrl.startsWith('http')) {
          srcUrl = new URL(srcUrl, window.location.href).href;
        }
        img.src = srcUrl;
      }
    });
  }
  
  // 簡化的圖片處理方式
  async function loadImageAsDataURL(url, imgElement) {
    try {
      console.log('嘗試載入圖片:', url);
      
      // 創建一個新的 Image 物件
      const img = new Image();
      
      // 設定載入成功的處理
      img.onload = function() {
        // 直接使用原始 URL
        imgElement.src = url;
        console.log('圖片載入成功:', url);
      };
      
      // 設定載入失敗的處理
      img.onerror = function() {
        console.error('圖片載入失敗:', url);
        // 保留原始 src
        imgElement.src = url;
      };
      
      // 開始載入
      img.src = url;
      
    } catch (error) {
      console.error('處理圖片時發生錯誤:', error);
    }
  }
  
  // 儲存物流單資料，加入錯誤處理
  function saveShippingData() {
    const btn = document.getElementById('bv-fetch-btn');
    
    try {
      // 先檢查 chrome.runtime 是否還有效
      if (!chrome.runtime || !chrome.runtime.id) {
        console.error('擴充功能上下文已失效，請重新整理頁面');
        showNotification('擴充功能需要重新載入，請按 F5 重新整理頁面', 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '重新抓取物流單';
        }
        return;
      }
      
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ 
          bvShippingData: shippingData,
          lastProvider: currentPage.provider,
          timestamp: Date.now()
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('儲存資料時發生錯誤:', chrome.runtime.lastError);
            
            // 如果是上下文失效錯誤
            if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
              showNotification('擴充功能需要重新載入，請按 F5 重新整理頁面', 'error');
            } else {
              showNotification('儲存資料失敗，請重試', 'error');
            }
            
            if (btn) {
              btn.disabled = false;
              btn.innerHTML = '重新抓取物流單';
            }
            return;
          }
          
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '重新抓取物流單';
            btn.classList.remove('pulse');
          }
          updateShippingPanelStatus();
          
          if (shippingData.length > 0) {
            showNotification(`成功抓取 ${shippingData.length} 張物流單`, 'success');
          } else {
            showNotification('未找到物流單，請確認頁面是否正確', 'warning');
          }
        });
      } else {
        throw new Error('Chrome storage API 不可用');
      }
    } catch (error) {
      console.error('儲存資料時發生錯誤:', error);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '重新抓取物流單';
      }
      showNotification('儲存資料失敗，請重新整理頁面後再試', 'error');
    }
  }
  
  // 檢查擴充功能是否有效
  function checkExtensionValid() {
    try {
      if (chrome.runtime && chrome.runtime.id) {
        return true;
      }
    } catch (e) {
      console.error('擴充功能已失效:', e);
    }
    
    // 顯示錯誤訊息
    const existingPanel = document.getElementById('bv-shipping-panel');
    if (existingPanel) {
      const errorMsg = document.createElement('div');
      errorMsg.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #ff4444;
        color: white;
        padding: 20px;
        border-radius: 8px;
        z-index: 999999;
        text-align: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      errorMsg.innerHTML = `
        <h3>擴充功能需要重新載入</h3>
        <p>請按 F5 重新整理頁面</p>
        <button onclick="location.reload()" style="
          background: white;
          color: #ff4444;
          border: none;
          padding: 8px 20px;
          border-radius: 4px;
          margin-top: 10px;
          cursor: pointer;
          font-weight: bold;
        ">立即重新整理</button>
      `;
      document.body.appendChild(errorMsg);
    }
    
    return false;
  }
   
  // === 明細頁面專用函數 ===
  
  function activateDetailPanel() {
    if (panelActive) return;
    
    // 移除物流單檢查，讓使用者可以直接使用
    
    // 載入資源
    loadExternalResources();
    
    // 隱藏原始控制區域
    const originalControls = document.querySelector('.ignore-print');
    if (originalControls) {
      originalControls.style.display = 'none';
    }
    
    // 建立面板
    const panel = document.createElement('div');
    panel.id = 'bv-shipping-assistant-panel';
    panel.innerHTML = getDetailPanelHTML();
    panel.style.display = 'block';
    document.body.appendChild(panel);
    
    // 設定預覽區域
    setupDetailPagePreview();
    
    // 初始化
    setTimeout(() => {
      initializeDetailEventListeners();
      loadSavedSettings();
      loadSavedData();
      
      // 如果頁面已有訂單，自動抓取
      if (document.querySelector('.order-content')) {
        setTimeout(fetchDetailData, 500);
      }
      
      // 第一次使用時顯示提示
      if (!localStorage.getItem('bv-print-tip-shown')) {
        showNotification('提示：如果列印預覽時內容太小，請在列印對話框中將「縮放」設定為「符合頁面大小」', 'info');
        localStorage.setItem('bv-print-tip-shown', 'true');
      }
      
      // 檢查是否需要顯示嘉里大榮提示
      checkAndShowKerryTip();
    }, 100);
    
    panelActive = true;
  }
  
  function checkAndShowKerryTip() {
    // 檢查是否已經有嘉里大榮的 PDF 資料
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['kerryProcessedPages'], (result) => {
        if (result.kerryProcessedPages && result.kerryProcessedPages.length > 0) {
          // 轉換為物流單格式
          const kerryShippingData = result.kerryProcessedPages.map((page, index) => ({
            html: `<img src="${page.dataUrl}" style="width: 100%; height: auto;">`,
            orderNo: `KERRY-${page.pageNum}`, // 暫時編號，稍後會配對
            serviceCode: `K${Date.now()}${page.pageNum}`,
            width: '100mm',
            height: '150mm',
            index: index,
            provider: 'kerry',
            isPdf: true,
            isOnlineProcessed: true,
            pageNumber: page.pageNum,
            originalWidth: page.width,
            originalHeight: page.height
          }));
          
          // 儲存到 pdfShippingData
          pdfShippingData = kerryShippingData;
          
          // 更新狀態
          updateDataStatus();
          
          // 自動配對訂單編號
          autoMatchKerryOrders();
          
          showNotification(`已載入 ${kerryShippingData.length} 張嘉里大榮物流單`, 'success');
        }
      });
    }
  }

  // 自動配對嘉里大榮訂單編號（移到外部）
  function autoMatchKerryOrders() {
    // 如果已有明細資料，立即配對
    if (detailData.length > 0 && pdfShippingData.length > 0) {
      matchKerryOrderNumbers();
    } else {
      // 等待明細資料載入後再配對
      setTimeout(() => {
        if (detailData.length > 0) {
          matchKerryOrderNumbers();
        }
      }, 2000);
    }
  }

  // 配對嘉里大榮訂單編號（移到外部）
  function matchKerryOrderNumbers() {
    // 確保數量相符
    if (pdfShippingData.length === detailData.length) {
      // 按順序配對
      pdfShippingData.forEach((shipping, index) => {
        if (detailData[index]) {
          shipping.orderNo = detailData[index].orderNo;
          shipping.matchedDetailIndex = index;
        }
      });
      
      // 更新預覽
      updatePreview();
      
      showNotification('已自動配對訂單編號', 'success');
    } else {
      showNotification(`物流單數量(${pdfShippingData.length})與明細數量(${detailData.length})不符，請手動調整`, 'warning');
    }
  }
      
  function deactivateDetailPanel() {
    if (!panelActive) return;
    
    // 移除面板
    const panel = document.getElementById('bv-shipping-assistant-panel');
    if (panel) panel.remove();
    
    // 移除預覽容器
    const container = document.getElementById('bv-preview-container');
    if (container) container.remove();
    
    // 恢復原始控制區域
    const originalControls = document.querySelector('.ignore-print');
    if (originalControls) {
      originalControls.style.display = '';
    }
    
    // 恢復隱藏的元素
    document.querySelectorAll('.order-content').forEach(content => {
      content.style.display = '';
    });
    
    panelActive = false;
  }
  
  function loadExternalResources() {
    if (!document.querySelector('link[href*="Material+Icons"]')) {
      const iconLink = document.createElement('link');
      iconLink.rel = 'stylesheet';
      iconLink.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
      document.head.appendChild(iconLink);
    }
    
    if (!document.querySelector('link[href*="Noto+Sans+TC"]')) {
      const fontLink = document.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap';
      document.head.appendChild(fontLink);
    }
  }
  
  function getDetailPanelHTML() {
    return `
      <div class="bv-panel-header">
        <h3>
          <span class="material-icons">local_shipping</span>
          BV SHOP 出貨助手
        </h3>
        <div class="bv-panel-controls">
          <button class="bv-icon-btn" id="bv-exit-btn" title="退出擴充程式">
            <span class="material-icons">exit_to_app</span>
          </button>
        </div>
      </div>
      
      <div class="bv-panel-body">
        <!-- 設定檔區塊 -->
        <div class="bv-preset-section">
          <div class="bv-preset-row">
            <select id="bv-preset-select">
              <option value="">-- 選擇設定檔 --</option>
            </select>
            <button class="bv-icon-button" id="bv-save-preset" title="儲存設定">
              <span class="material-icons">save</span>
            </button>
            <button class="bv-icon-button" id="bv-delete-preset" title="刪除設定">
              <span class="material-icons">delete</span>
            </button>
            <button class="bv-icon-button reset-button" id="bv-reset-format" title="清除格式">
              <span class="material-icons">restart_alt</span>
            </button>
          </div>
          <div class="bv-preset-row" id="bv-save-preset-row" style="display:none; margin-top: 10px;">
            <input type="text" id="bv-new-preset-name" placeholder="輸入設定檔名稱" style="width: 100%;">
            <button class="bv-small-button primary" id="bv-confirm-save">確認</button>
            <button class="bv-small-button" id="bv-cancel-save">取消</button>
          </div>
        </div>
        
        <!-- 資料狀態區 -->
        <div class="bv-section">
          <div class="bv-section-header">
            <h4>
              <span class="material-icons bv-section-icon">inventory</span>
              資料狀態
            </h4>
          </div>
          <div class="bv-section-content">
            <div class="bv-status-display">
              <div class="bv-status-item">
                <span>物流單：</span>
                <span id="bv-shipping-count" class="bv-status-badge">未抓取</span>
              </div>
              <div class="bv-status-item">
                <span>出貨明細：</span>
                <span id="bv-detail-count" class="bv-status-badge">未抓取</span>
              </div>
            </div>
            
            <!-- 嘉里大榮狀態顯示 -->
            <div class="bv-kerry-status" id="bv-kerry-status" style="display:none;">
              <div class="bv-info-box">
                <span class="material-icons" style="color: #f44336;">local_shipping</span>
                <span>嘉里大榮物流單已自動處理</span>
              </div>
            </div>
            
            <!-- 操作按鈕 -->
            <div class="bv-action-buttons" style="margin-top: 15px;">
              <button class="bv-small-button" id="bv-clear-data">
                <span class="material-icons" style="font-size: 16px;">delete_sweep</span>
                清除所有資料
              </button>
            </div>
          </div>
        </div>
        
        <!-- 基本設定 -->
        <div class="bv-section">
          <div class="bv-section-header" data-section="basic">
            <h4>
              <span class="material-icons bv-section-icon">tune</span>
              基本設定
            </h4>
            <span class="material-icons bv-section-toggle">expand_more</span>
          </div>
          <div class="bv-section-content" id="basic-content">
            <div class="bv-control-group">
              <div class="bv-control-group-title">紙張設定</div>
              <div class="bv-control-label">
                <span>紙張寬度</span>
                <span class="bv-value-badge" id="bv-paper-width-value">100mm</span>
              </div>
              <input type="range" id="bv-paper-width" min="50" max="300" value="100" class="bv-range">
              
              <div class="bv-control-label" style="margin-top: 20px;">
                <span>紙張高度</span>
                <span class="bv-value-badge" id="bv-paper-height-value">150mm</span>
              </div>
              <input type="range" id="bv-paper-height" min="50" max="400" value="150" class="bv-range">
              
              <div class="bv-control-label" style="margin-top: 20px;">
                <span>出貨明細縮放</span>
                <span class="bv-value-badge" id="bv-scale-value">100%</span>
              </div>
              <input type="range" id="bv-scale" min="50" max="150" value="100" class="bv-range">
              
              <div class="bv-control-label" style="margin-top: 20px;">
                <span>出貨明細邊距</span>
                <span class="bv-value-badge" id="bv-margin-value">5mm</span>
              </div>
              <input type="range" id="bv-margin" min="0" max="20" value="5" class="bv-range">
            </div>
          </div>
        </div>
        
        <!-- 物流單設定 -->
        <div class="bv-section">
          <div class="bv-section-header" data-section="shipping">
            <h4>
              <span class="material-icons bv-section-icon">receipt</span>
              物流單設定
            </h4>
            <span class="material-icons bv-section-toggle">expand_more</span>
          </div>
          <div class="bv-section-content collapsed" id="shipping-content">
            <!-- 現有的訂單編號設定 -->
            <div class="bv-control-group">
              <div class="bv-control-label">
                <span>顯示訂單編號</span>
                <input type="checkbox" id="bv-shipping-order" checked>
              </div>
              
              <div class="bv-order-label-controls" id="bv-order-label-controls">
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>上方距離</span>
                  <span class="bv-value-badge" id="bv-order-label-top-value">5mm</span>
                </div>
                <input type="range" id="bv-order-label-top" min="0" max="50" value="5" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>文字大小</span>
                  <span class="bv-value-badge" id="bv-order-label-size-value">14px</span>
                </div>
                <input type="range" id="bv-order-label-size" min="10" max="24" value="14" class="bv-range">
              </div>
            </div>
            
            <!-- 新增：物流單排版調整 -->
            <div class="bv-control-group">
              <div class="bv-control-group-title">物流單排版調整</div>
              
              <div class="bv-control-label">
                <span>超商類型</span>
              </div>
              <select id="bv-shipping-provider" class="bv-select">
                <option value="default">通用設定</option>
                <option value="seven">7-11</option>
                <option value="family">全家</option>
                <option value="hilife">萊爾富</option>
                <option value="okmart">OK超商</option>
                <option value="kerry">嘉里大榮</option>
              </select>
              
              <div class="bv-control-label" style="margin-top: 20px;">
                <span>整體縮放</span>
                <span class="bv-value-badge" id="bv-shipping-scale-value">100%</span>
              </div>
              <input type="range" id="bv-shipping-scale" min="80" max="120" value="100" class="bv-range">
              
              <div class="bv-control-label" style="margin-top: 20px;">
                <span>水平位移</span>
                <span class="bv-value-badge" id="bv-shipping-offset-x-value">0mm</span>
              </div>
              <input type="range" id="bv-shipping-offset-x" min="-20" max="20" value="0" class="bv-range">
              
              <div class="bv-control-label" style="margin-top: 20px;">
                <span>垂直位移</span>
                <span class="bv-value-badge" id="bv-shipping-offset-y-value">0mm</span>
              </div>
              <input type="range" id="bv-shipping-offset-y" min="-20" max="20" value="0" class="bv-range">
              
              <div class="bv-control-label" style="margin-top: 20px;">
                <span>內部邊距</span>
                <span class="bv-value-badge" id="bv-shipping-padding-value">0mm</span>
              </div>
              <input type="range" id="bv-shipping-padding" min="0" max="10" value="0" class="bv-range">
              
              <button class="bv-small-button secondary" id="bv-save-provider-settings" style="margin-top: 10px;">
                <span class="material-icons" style="font-size: 16px;">save</span>
                儲存此超商設定
              </button>
            </div>
            
            <!-- Logo 設定 -->
            <div class="bv-control-group">
              <div class="bv-control-group-title">底圖設定</div>
              <div class="bv-logo-upload-area" id="bv-shipping-logo-upload">
                <input type="file" id="bv-shipping-logo-input" accept="image/png,image/jpeg,image/jpg" style="display:none;">
                <img id="bv-shipping-logo-preview" class="bv-logo-preview" style="display:none;">
                <div id="bv-shipping-upload-prompt">
                  <span class="material-icons" style="font-size:36px; color: #5865F2;">add_photo_alternate</span>
                  <div class="bv-upload-hint">點擊上傳底圖（支援 PNG/JPG）</div>
                </div>
              </div>
              
              <div class="bv-logo-controls" id="bv-shipping-logo-controls">
                <div class="bv-control-label">
                  <span>底圖大小</span>
                  <span class="bv-value-badge" id="bv-shipping-logo-size-value">30mm</span>
                </div>
                <input type="range" id="bv-shipping-logo-size" min="10" max="80" value="30" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>水平位置</span>
                  <span class="bv-value-badge" id="bv-shipping-logo-x-value">50%</span>
                </div>
                <input type="range" id="bv-shipping-logo-x" min="0" max="100" value="50" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>垂直位置</span>
                  <span class="bv-value-badge" id="bv-shipping-logo-y-value">50%</span>
                </div>
                <input type="range" id="bv-shipping-logo-y" min="0" max="100" value="50" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>淡化程度</span>
                  <span class="bv-value-badge" id="bv-shipping-logo-opacity-value">20%</span>
                </div>
                <input type="range" id="bv-shipping-logo-opacity" min="0" max="100" value="20" class="bv-range">
                
                <button class="bv-remove-logo-btn" id="bv-shipping-logo-remove">
                  <span class="material-icons" style="font-size: 16px;">delete</span>
                  移除底圖
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 出貨明細設定 -->
        <div class="bv-section">
          <div class="bv-section-header" data-section="detail">
            <h4>
              <span class="material-icons bv-section-icon">description</span>
              出貨明細設定
            </h4>
            <span class="material-icons bv-section-toggle">expand_more</span>
          </div>
          <div class="bv-section-content collapsed" id="detail-content">
            <div class="bv-control-group">
              <div class="bv-control-group-title">文字設定</div>
              <div class="bv-control-label">
                <span>文字大小</span>
              </div>
              <select id="bv-detail-text-size" class="bv-select">
                <option value="12px">12 px</option>
                <option value="14px" selected>14 px</option>
                <option value="16px">16 px</option>
                <option value="18px">18 px</option>
              </select>
            </div>
            
            <!-- 欄位顯示設定 -->
            <div class="bv-control-group">
              <div class="bv-control-group-title">顯示設定</div>
              <div class="bv-field-list">
                <div class="bv-field-item">
                  <input type="checkbox" id="bv-field-productImage">
                  <label for="bv-field-productImage" class="bv-field-label">顯示商品圖片</label>
                </div>
                <div class="bv-field-item">
                  <input type="checkbox" id="bv-field-remark">
                  <label for="bv-field-remark" class="bv-field-label">顯示顧客備註</label>
                </div>
                <div class="bv-field-item">
                  <input type="checkbox" id="bv-field-manageRemark">
                  <label for="bv-field-manageRemark" class="bv-field-label">顯示後台備註</label>
                </div>
                <div class="bv-field-item">
                  <input type="checkbox" id="bv-field-printRemark" checked>
                  <label for="bv-field-printRemark" class="bv-field-label">顯示列印備註</label>
                </div>
                <div class="bv-field-item">
                  <input type="checkbox" id="bv-field-deliveryTime">
                  <label for="bv-field-deliveryTime" class="bv-field-label">顯示指定配送時段</label>
                </div>
                <div class="bv-field-item">
                  <input type="checkbox" id="bv-field-shippingTime" checked>
                  <label for="bv-field-shippingTime" class="bv-field-label">顯示預計出貨日</label>
                </div>
                <div class="bv-field-item">
                  <input type="checkbox" id="bv-field-hideInfo" checked>
                  <label for="bv-field-hideInfo" class="bv-field-label">隱藏個人資訊</label>
                </div>
                <div class="bv-field-item">
                  <input type="checkbox" id="bv-field-hidePrice" checked>
                  <label for="bv-field-hidePrice" class="bv-field-label">隱藏價格</label>
                </div>
                <div class="bv-field-item">
                  <input type="checkbox" id="bv-field-showLogTraceId" checked>
                  <label for="bv-field-showLogTraceId" class="bv-field-label">顯示物流編號</label>
                </div>
              </div>
            </div>
            
            <!-- Logo 設定 -->
            <div class="bv-control-group">
              <div class="bv-control-group-title">底圖設定</div>
              <div class="bv-logo-upload-area" id="bv-detail-logo-upload">
                <input type="file" id="bv-detail-logo-input" accept="image/png,image/jpeg,image/jpg" style="display:none;">
                <img id="bv-detail-logo-preview" class="bv-logo-preview" style="display:none;">
                <div id="bv-detail-upload-prompt">
                  <span class="material-icons" style="font-size:36px; color: #5865F2;">add_photo_alternate</span>
                  <div class="bv-upload-hint">點擊上傳底圖（支援 PNG/JPG）</div>
                </div>
              </div>
              
              <div class="bv-logo-controls" id="bv-detail-logo-controls">
                <div class="bv-control-label">
                  <span>底圖大小</span>
                  <span class="bv-value-badge" id="bv-detail-logo-size-value">50mm</span>
                </div>
                <input type="range" id="bv-detail-logo-size" min="20" max="100" value="50" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>水平位置</span>
                  <span class="bv-value-badge" id="bv-detail-logo-x-value">50%</span>
                </div>
                <input type="range" id="bv-detail-logo-x" min="0" max="100" value="50" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>垂直位置</span>
                  <span class="bv-value-badge" id="bv-detail-logo-y-value">50%</span>
                </div>
                <input type="range" id="bv-detail-logo-y" min="0" max="100" value="50" class="bv-range">
                
                <div class="bv-control-label" style="margin-top: 20px;">
                  <span>淡化程度</span>
                  <span class="bv-value-badge" id="bv-detail-logo-opacity-value">20%</span>
                </div>
                <input type="range" id="bv-detail-logo-opacity" min="0" max="100" value="20" class="bv-range">
                
                <button class="bv-remove-logo-btn" id="bv-detail-logo-remove">
                  <span class="material-icons" style="font-size: 16px;">delete</span>
                  移除底圖
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 列印設定 -->
        <div class="bv-section">
          <div class="bv-section-header" data-section="print">
            <h4>
              <span class="material-icons bv-section-icon">print</span>
              列印設定
            </h4>
            <span class="material-icons bv-section-toggle">expand_more</span>
          </div>
          <div class="bv-section-content collapsed" id="print-content">
            <div class="bv-control-group">
              <div class="bv-control-label">
                <span>列印順序</span>
              </div>
              <select id="bv-print-order" class="bv-select">
                <option value="paired-sequential">物流單-出貨明細（正序）</option>
                <option value="paired-reverse">物流單-出貨明細（反序）</option>
                <option value="shipping-only">純物流單（正序）</option>
                <option value="shipping-only-reverse">純物流單（反序）</option>
                <option value="detail-only">純出貨明細（正序）</option>
                <option value="detail-only-reverse">純出貨明細（反序）</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 固定在底部的列印按鈕 -->
      <div class="bv-panel-footer">
        <button class="bv-action-button" id="bv-apply-print">
          <span class="material-icons">print</span>
          <span>套用並列印</span>
        </button>
      </div>
    `;
  }
  
  function setupDetailPagePreview() {
    let container = document.getElementById('bv-preview-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'bv-preview-container';
      
      // 隱藏原始內容
      document.querySelectorAll('.order-content').forEach(content => {
        content.style.display = 'none';
      });
      
      // 插入預覽容器
      const body = document.body;
      const firstOrderContent = document.querySelector('.order-content');
      if (firstOrderContent && firstOrderContent.parentNode) {
        firstOrderContent.parentNode.insertBefore(container, firstOrderContent);
      } else {
        body.appendChild(container);
      }
    }
  }
  
  function initializeDetailEventListeners() {
    // 面板控制
    document.getElementById('bv-exit-btn')?.addEventListener('click', () => {
      if (confirm('確定要退出擴充程式嗎？')) {
        deactivateDetailPanel();
      }
    });
    
    // 清除重抓
    document.getElementById('bv-clear-data')?.addEventListener('click', () => {
      if (confirm('確定要清除所有資料嗎？這將清除物流單和明細資料。')) {
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.remove(['bvShippingData', 'bvDetailData', 'bvPdfShippingData', 'kerryProcessedPages'], () => {
            shippingData = [];
            detailData = [];
            pdfShippingData = [];
            updateDataStatus();
            updatePreview();
            showNotification('已清除所有資料', 'success');
          });
        }
      }
    });
    
    // 套用並列印
    document.getElementById('bv-apply-print')?.addEventListener('click', handlePrint);
    
    // 區塊折疊
    document.querySelectorAll('.bv-section-header').forEach(header => {
      const toggle = header.querySelector('.bv-section-toggle');
      if (toggle) {
        header.addEventListener('click', () => {
          const section = header.dataset.section;
          const content = document.getElementById(`${section}-content`);
          if (content) {
            content.classList.toggle('collapsed');
            toggle.textContent = content.classList.contains('collapsed') ? 'expand_more' : 'expand_less';
          }
        });
      }
    });
    
    // 訂單編號顯示控制
    document.getElementById('bv-shipping-order')?.addEventListener('change', (e) => {
      const controls = document.getElementById('bv-order-label-controls');
      if (controls) {
        controls.style.display = e.target.checked ? 'block' : 'none';
      }
      saveSettings();
      updatePreview();
    });
    
    // 列印順序變更時更新預覽
    document.getElementById('bv-print-order')?.addEventListener('change', updatePreview);
    
    // 設定監聽
    setupSettingsListeners();
    setupLogoUpload('shipping');
    setupLogoUpload('detail');
    
    // 初始化預設系統
    initPresetSystem();
  
    // 載入所有超商設定
    loadAllProviderSettings();
  }
  
  function fetchDetailData() {
    console.log('開始抓取明細');
    detailData = [];
    
    // 抓取所有 order-content
    const orderContents = document.querySelectorAll('.order-content');
    
    orderContents.forEach((content, index) => {
      // 跳過只有圖片的容器
      if (!content.querySelector('.order-info')) return;
      
      const clone = content.cloneNode(true);
      
      // 移除浮水印和底圖
      clone.querySelectorAll('.baseImage, .watermark').forEach(img => img.remove());
      
      // 處理圖片
      clone.querySelectorAll('img').forEach(img => {
        if (img.src && !img.src.startsWith('data:')) {
          img.src = new URL(img.src, window.location.href).href;
        }
      });
      
      // 提取訂單資訊
      const orderInfo = extractDetailOrderInfo(clone);
      
      // 提取物流編號 - 支援 8 碼或 12 碼
      let logTraceId = '';
      const logTraceElement = clone.querySelector('.showLogTraceID');
      if (logTraceElement) {
        const text = logTraceElement.textContent;
        // 修改正則：F 或 E 開頭，後面跟 7 位數字（總共 8 碼）或 11 位數字（總共 12 碼）
        const match = text.match(/物流編號[:\s]*([FE]\d{7}(?:\d{4})?)/);
        if (match) {
          logTraceId = match[1];
        }
      }
      
      detailData.push({
        html: clone.innerHTML,
        orderNo: orderInfo.orderNo,
        orderInfo: orderInfo,
        logTraceId: logTraceId,
        index: index
      });
      
      console.log(`明細 ${index + 1} - 訂單編號: ${orderInfo.orderNo}, 物流編號: ${logTraceId}`);
    });
    
    console.log('抓取到的明細數量:', detailData.length);
    
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ bvDetailData: detailData }, () => {
        updateDataStatus();
        if (detailData.length > 0) {
          showNotification(`成功抓取 ${detailData.length} 張出貨明細`, 'success');
          updatePreview();
        } else {
          showNotification('未找到明細資料', 'warning');
        }
      });
    }
  }
    
  function extractDetailOrderInfo(element) {
    const info = {
      orderNo: '',
      orderDate: '',
      customer: '',
      customerAccount: '',
      phone: '',
      paymentMethod: '',
      shippingMethod: '',
      recipient: '',
      recipientPhone: '',
      address: '',
      storeName: '',
      deliveryTime: '',
      shippingTime: '',
      items: [],
      totalQty: '',
      extraShipping: '',
      total: '',
      remark: '',
      manageRemark: '',
      printRemark: ''
    };
    
    // 提取訂單資訊
    const orderInfoDiv = element.querySelector('.order-info');
    if (orderInfoDiv) {
      const paragraphs = orderInfoDiv.querySelectorAll('p');
      paragraphs.forEach(p => {
        const text = p.textContent;
        if (text.includes('訂單編號：')) info.orderNo = text.split('：')[1]?.trim();
        if (text.includes('訂購日期：')) info.orderDate = text.split('：')[1]?.trim();
        if (text.includes('訂購人：') && !text.includes('訂購人帳號')) {
          info.customer = text.split('：')[1]?.trim();
        }
        if (text.includes('訂購人帳號：')) info.customerAccount = text.split('：')[1]?.trim();
        if (text.includes('聯絡電話：')) info.phone = text.split('：')[1]?.trim();
        if (text.includes('付款方式：')) info.paymentMethod = text.split('：')[1]?.trim();
        if (text.includes('送貨方式：')) info.shippingMethod = text.split('：')[1]?.trim();
        if (text.includes('收件人：') && !text.includes('收件人電話')) {
          info.recipient = text.split('：')[1]?.trim();
        }
        if (text.includes('收件人電話：')) info.recipientPhone = text.split('：')[1]?.trim();
        if (text.includes('送貨地址：')) info.address = text.split('：')[1]?.trim();
        if (text.includes('門市名稱：')) info.storeName = text.split('：')[1]?.trim();
        if (text.includes('指定配送時段：')) info.deliveryTime = text.split('：')[1]?.trim();
        if (text.includes('預計出貨日：')) info.shippingTime = text.split('：')[1]?.trim();
      });
    }
    
    // 提取商品資訊
    const itemRows = element.querySelectorAll('.list-item');
    itemRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3) {
        const item = {
          name: cells[0]?.textContent.trim() || '',
          image: cells[0]?.querySelector('img')?.src || '',
          price: cells[1]?.textContent.trim() || '',
          qty: cells[cells.length - 2]?.textContent.trim() || '',
          subtotal: cells[cells.length - 1]?.textContent.trim() || ''
        };
        info.items.push(item);
      }
    });
    
    // 提取總計資訊
    const feeTable = element.querySelector('.order-fee');
    if (feeTable) {
      const rows = feeTable.querySelectorAll('tr');
      rows.forEach(row => {
        const text = row.textContent;
        if (text.includes('商品總數量：')) info.totalQty = row.querySelector('.total')?.textContent.trim();
        if (text.includes('額外運費：')) info.extraShipping = row.querySelector('.total')?.textContent.trim();
        if (text.includes('總計：')) info.total = row.querySelector('.total')?.textContent.trim();
      });
    }
    
    // 提取備註
    const remarkDivs = element.querySelectorAll('.order-remark');
    remarkDivs.forEach(div => {
      const title = div.querySelector('.remark-title')?.textContent || '';
      const content = div.textContent.replace(title, '').trim();
      if (title.includes('顧客備註')) info.remark = content;
      if (title.includes('後台備註')) info.manageRemark = content;
      if (title.includes('列印備註')) info.printRemark = content;
    });
    
    return info;
  }
  
  function setupSettingsListeners() {
    // 統一紙張設定
    ['paper-width', 'paper-height', 'scale', 'margin'].forEach(id => {
      const element = document.getElementById('bv-' + id);
      if (element) {
        element.addEventListener('input', () => {
          updateValueDisplay(id);
          updateRangeProgress(element);
          saveSettings();
          updatePreview();
        });
      }
    });
    
    // 訂單標籤設定
    ['order-label-top', 'order-label-size'].forEach(id => {
      const element = document.getElementById('bv-' + id);
      if (element) {
        element.addEventListener('input', () => {
          updateValueDisplay(id);
          updateRangeProgress(element);
          saveSettings();
          updatePreview();
        });
      }
    });
    
    // Logo設定
    ['shipping-logo-size', 'shipping-logo-x', 'shipping-logo-y', 'shipping-logo-opacity',
     'detail-logo-size', 'detail-logo-x', 'detail-logo-y', 'detail-logo-opacity'].forEach(id => {
      const element = document.getElementById('bv-' + id);
      if (element) {
        element.addEventListener('input', () => {
          updateValueDisplay(id);
          updateRangeProgress(element);
          saveSettings();
          updatePreview();
        });
      }
    });
    
    // 文字大小
    document.getElementById('bv-detail-text-size')?.addEventListener('change', () => {
      saveSettings();
      updatePreview();
    });
    
    // 欄位設定
    document.querySelectorAll('.bv-field-list input').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        saveSettings();
        updatePreview();
      });
    });

    // 新增物流單排版調整的監聽器
    ['shipping-scale', 'shipping-offset-x', 'shipping-offset-y', 'shipping-padding'].forEach(id => {
      const element = document.getElementById('bv-' + id);
      if (element) {
        element.addEventListener('input', () => {
          updateValueDisplay(id);
          updateRangeProgress(element);
          updatePreview(); // 即時預覽
        });
      }
    });
    
    // 確保在切換超商類型時立即更新預覽
    document.getElementById('bv-shipping-provider')?.addEventListener('change', (e) => {
      loadProviderSettings(e.target.value);
      // 立即更新預覽
      setTimeout(() => updatePreview(), 100);
    });
    
    // 確保拖動滑桿時儲存設定
    ['shipping-scale', 'shipping-offset-x', 'shipping-offset-y', 'shipping-padding'].forEach(id => {
      const element = document.getElementById('bv-' + id);
      if (element) {
        element.addEventListener('input', () => {
          updateValueDisplay(id);
          updateRangeProgress(element);
          // 更新當前超商的快取設定
          const provider = document.getElementById('bv-shipping-provider')?.value || 'default';
          cachedProviderSettings[provider] = {
            scale: parseInt(document.getElementById('bv-shipping-scale').value),
            offsetX: parseInt(document.getElementById('bv-shipping-offset-x').value),
            offsetY: parseInt(document.getElementById('bv-shipping-offset-y').value),
            padding: parseInt(document.getElementById('bv-shipping-padding').value)
          };
          updatePreview(); // 即時預覽
        });
      }
    });
    
    // 儲存超商設定
    document.getElementById('bv-save-provider-settings')?.addEventListener('click', () => {
      saveProviderSettings();
    });
    
    // 初始化所有 range input 的進度條
    document.querySelectorAll('input[type="range"]').forEach(updateRangeProgress);
  }
  
  // 載入特定超商的設定
  function loadProviderSettings(provider) {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([`bvProviderSettings_${provider}`], (result) => {
        const settings = result[`bvProviderSettings_${provider}`] || {
          scale: 100,
          offsetX: 0,
          offsetY: 0,
          padding: 0
        };
        
        // 更新快取
        cachedProviderSettings[provider] = settings;
        
        // 更新控制項
        document.getElementById('bv-shipping-scale').value = settings.scale;
        document.getElementById('bv-shipping-offset-x').value = settings.offsetX;
        document.getElementById('bv-shipping-offset-y').value = settings.offsetY;
        document.getElementById('bv-shipping-padding').value = settings.padding;
        
        // 更新顯示值
        ['shipping-scale', 'shipping-offset-x', 'shipping-offset-y', 'shipping-padding'].forEach(id => {
          updateValueDisplay(id);
          const element = document.getElementById('bv-' + id);
          if (element) updateRangeProgress(element);
        });
        
        updatePreview();
      });
    }
  }
  
  // 修改 saveProviderSettings 函數，同時更新快取
  function saveProviderSettings() {
    const provider = document.getElementById('bv-shipping-provider').value;
    const settings = {
      scale: parseInt(document.getElementById('bv-shipping-scale').value),
      offsetX: parseInt(document.getElementById('bv-shipping-offset-x').value),
      offsetY: parseInt(document.getElementById('bv-shipping-offset-y').value),
      padding: parseInt(document.getElementById('bv-shipping-padding').value)
    };
    
    // 更新快取
    cachedProviderSettings[provider] = settings;
    
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        [`bvProviderSettings_${provider}`]: settings
      }, () => {
        showNotification(`已儲存 ${provider === 'default' ? '通用' : provider} 的排版設定`, 'success');
      });
    }
  }
  
  function setupLogoUpload(type) {
    const uploadArea = document.getElementById(`bv-${type}-logo-upload`);
    const input = document.getElementById(`bv-${type}-logo-input`);
    const preview = document.getElementById(`bv-${type}-logo-preview`);
    const prompt = document.getElementById(`bv-${type}-upload-prompt`);
    const controls = document.getElementById(`bv-${type}-logo-controls`);
    const removeBtn = document.getElementById(`bv-${type}-logo-remove`);
    
    if (!uploadArea || !input) return;
    
    uploadArea.addEventListener('click', () => input.click());
    
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && (file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          savedLogos[type] = event.target.result;
          preview.src = savedLogos[type];
          preview.style.display = 'block';
          prompt.style.display = 'none';
          uploadArea.classList.add('has-logo');
          controls.classList.add('active');
          saveSettings();
          updatePreview();
        };
        reader.readAsDataURL(file);
      } else {
        showNotification('請上傳 PNG 或 JPG 格式的圖片', 'warning');
      }
    });
    
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        savedLogos[type] = null;
        preview.style.display = 'none';
        prompt.style.display = 'flex';
        uploadArea.classList.remove('has-logo');
        controls.classList.remove('active');
        input.value = '';
        saveSettings();
        updatePreview();
      });
    }
  }
  
  function updatePreview() {
    const container = document.getElementById('bv-preview-container');
    if (!container) return;
    
    const settings = getSettings();
    const printOrder = document.getElementById('bv-print-order')?.value || 'paired-sequential';
    const pages = generatePages(printOrder, settings);
    
    container.innerHTML = '';
    pages.forEach(page => container.appendChild(page));
  }
  
  function generatePages(printOrder, settings) {
    const pages = [];
    let pageOrder = [];
    
    // 合併所有物流單資料（包含 PDF 轉換的）
    const allShippingData = [...shippingData, ...pdfShippingData];
    
    // 建立物流單的映射
    const shippingMap = new Map();
    
    console.log('=== 開始建立物流單映射 ===');
    console.log('一般物流單資料:', shippingData);
    console.log('PDF 物流單資料:', pdfShippingData);
    
    allShippingData.forEach((data, index) => {
      if (data.serviceCode) {
        const code = data.serviceCode.trim();
        shippingMap.set(code, data);
        console.log(`物流單 ${index + 1}: 服務代碼 = ${code} (${code.length}碼), 類型 = ${data.provider}`);
        
        // 如果是 12 碼，也儲存前 8 碼版本
        if (code.length === 12) {
          const shortCode = code.substring(0, 8);
          shippingMap.set(shortCode, data);
          console.log(`  - 也儲存 8 碼版本: ${shortCode}`);
        }
      }
    });
    
    console.log('=== 開始配對明細 ===');
    console.log('明細資料:', detailData);
    
    // 根據列印順序產生頁面順序
    switch (printOrder) {
      case 'paired-sequential': // 物流單-出貨明細（正序）
        detailData.forEach((detail, index) => {
          console.log(`\n處理明細 ${index + 1}: 訂單 = ${detail.orderNo}`);
          
          if (detail.logTraceId) {
            const detailCode = detail.logTraceId.trim();
            console.log(`  物流編號: ${detailCode} (${detailCode.length}碼)`);
            
            let shipping = null;
            
            // 1. 直接匹配
            if (shippingMap.has(detailCode)) {
              shipping = shippingMap.get(detailCode);
              console.log(`  ✓ 直接配對成功`);
            } 
            // 2. 如果明細是 8 碼，嘗試找對應的 12 碼物流單
            else if (detailCode.length === 8) {
              for (const [code, data] of shippingMap) {
                if (code.startsWith(detailCode)) {
                  shipping = data;
                  console.log(`  ✓ 配對成功: 明細 8 碼 ${detailCode} 匹配物流單 ${code}`);
                  break;
                }
              }
            }
            // 3. 如果明細是 12 碼，嘗試用前 8 碼匹配
            else if (detailCode.length === 12) {
              const shortCode = detailCode.substring(0, 8);
              if (shippingMap.has(shortCode)) {
                shipping = shippingMap.get(shortCode);
                console.log(`  ✓ 配對成功: 明細前 8 碼 ${shortCode} 匹配物流單`);
              }
            }
            
            if (shipping) {
              pageOrder.push({ type: 'shipping', data: shipping, orderNo: detail.orderNo });
              pageOrder.push({ type: 'detail', data: detail });
            } else {
              console.warn(`  ✗ 找不到對應的物流單`);
              console.log(`  已有的物流單編號:`, Array.from(shippingMap.keys()));
              pageOrder.push({ type: 'detail', data: detail });
            }
          } else {
            console.log(`  - 沒有物流編號`);
            pageOrder.push({ type: 'detail', data: detail });
          }
        });
        break;
        
      case 'paired-reverse': // 物流單-出貨明細（反序）
        const reversedDetails = [...detailData].reverse();
        reversedDetails.forEach((detail, index) => {
          console.log(`\n處理明細 ${index + 1}: 訂單 = ${detail.orderNo}`);
          
          if (detail.logTraceId) {
            const detailCode = detail.logTraceId.trim();
            console.log(`  物流編號: ${detailCode} (${detailCode.length}碼)`);
            
            let shipping = null;
            
            // 使用相同的配對邏輯
            if (shippingMap.has(detailCode)) {
              shipping = shippingMap.get(detailCode);
            } else if (detailCode.length === 8) {
              for (const [code, data] of shippingMap) {
                if (code.startsWith(detailCode)) {
                  shipping = data;
                  break;
                }
              }
            } else if (detailCode.length === 12) {
              const shortCode = detailCode.substring(0, 8);
              if (shippingMap.has(shortCode)) {
                shipping = shippingMap.get(shortCode);
              }
            }
            
            if (shipping) {
              pageOrder.push({ type: 'shipping', data: shipping, orderNo: detail.orderNo });
              pageOrder.push({ type: 'detail', data: detail });
            } else {
              pageOrder.push({ type: 'detail', data: detail });
            }
          } else {
            pageOrder.push({ type: 'detail', data: detail });
          }
        });
        break;
        
      case 'shipping-only': // 純物流單（正序）
        allShippingData.forEach(data => {
          pageOrder.push({ type: 'shipping', data: data });
        });
        break;
        
      case 'shipping-only-reverse': // 純物流單（反序）
        [...allShippingData].reverse().forEach(data => {
          pageOrder.push({ type: 'shipping', data: data });
        });
        break;
        
      case 'detail-only': // 純出貨明細（正序）
        detailData.forEach(data => {
          pageOrder.push({ type: 'detail', data: data });
        });
        break;
        
      case 'detail-only-reverse': // 純出貨明細（反序）
        [...detailData].reverse().forEach(data => {
          pageOrder.push({ type: 'detail', data: data });
        });
        break;
    }
    
    console.log(`\n=== 配對結果 ===`);
    console.log(`總共 ${pageOrder.length} 頁`);
    console.log(`物流單: ${pageOrder.filter(p => p.type === 'shipping').length} 張`);
    console.log(`明細: ${pageOrder.filter(p => p.type === 'detail').length} 張`);
    
    // 產生頁面
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

  // 修改 generateShippingPage 函數以支援 PDF 圖片
  function generateShippingPage(data, settings, customOrderNo) {
    if (!data) return '';
    
    const displayOrderNo = customOrderNo || data.orderNo;
    
    // 取得當前的超商類型
    const provider = data.provider || detectProviderFromHTML(data.html) || 'default';
    
    // 使用當前超商的設定
    const layoutSettings = settings.shipping.currentProviderSettings || 
                          settings.shipping.providerSettings?.[provider] || {
      scale: 100,
      offsetX: 0,
      offsetY: 0,
      padding: 0
    };
    
    // 如果是 PDF 轉換的物流單，使用特殊處理
    if (data.isPdf) {
      return `
        <div class="bv-shipping-content" style="
          width: 100mm;
          height: 150mm;
          position: relative;
          overflow: hidden;
          background: white;
          margin: 0;
          padding: ${layoutSettings.padding}mm;
          box-sizing: border-box;
        ">
          <!-- 底圖（最底層） -->
          ${settings.shipping.logo ? `
            <img src="${settings.shipping.logo}" 
                 class="bv-watermark-logo"
                 style="
                   position: absolute;
                   top: ${settings.shipping.logoY}%;
                   left: ${settings.shipping.logoX}%;
                   transform: translate(-50%, -50%);
                   width: ${settings.shipping.logoSize}mm;
                   opacity: ${settings.shipping.logoOpacity / 100};
                   --opacity: ${settings.shipping.logoOpacity / 100};
                   pointer-events: none;
                   z-index: 1;
                 ">
          ` : ''}
          
          <!-- PDF 物流單內容 -->
          <div style="
            z-index: 2;
            position: relative;
            transform: scale(${layoutSettings.scale / 100}) translate(${layoutSettings.offsetX}mm, ${layoutSettings.offsetY}mm);
            transform-origin: center center;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            ${data.html}
          </div>
          
          <!-- 頁碼標示（可選） -->
          ${data.pageNumber && data.totalPages ? `
            <div style="
              position: absolute;
              bottom: 5mm;
              right: 5mm;
              font-size: 10px;
              color: #666;
              z-index: 1000;
            ">
              ${data.pageNumber} / ${data.totalPages}
            </div>
          ` : ''}
          
          <!-- 訂單編號標籤（最上層） -->
          ${settings.showOrderNumber && displayOrderNo && !displayOrderNo.startsWith('KERRY-') ? `
            <div style="
              position: absolute;
              top: ${settings.orderLabelTop}mm;
              left: 50%;
              transform: translateX(-50%);
              background: white;
              padding: 4px 12px;
              border: 1px solid #333;
              border-radius: 4px;
              font-size: ${settings.orderLabelSize}px;
              font-weight: bold;
              z-index: 1000;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              white-space: nowrap;
            ">
              訂單編號：${displayOrderNo}
            </div>
          ` : ''}
        </div>
      `;
    }
    
    // 原有的物流單處理邏輯
    return `
      <div class="bv-shipping-content" style="
        width: 100mm;
        height: 150mm;
        position: relative;
        overflow: hidden;
        background: white;
        margin: 0;
        padding: ${layoutSettings.padding}mm;
        box-sizing: border-box;
      ">
        <!-- 底圖（最底層） -->
        ${settings.shipping.logo ? `
          <img src="${settings.shipping.logo}" 
               class="bv-watermark-logo"
               style="
                 position: absolute;
                 top: ${settings.shipping.logoY}%;
                 left: ${settings.shipping.logoX}%;
                 transform: translate(-50%, -50%);
                 width: ${settings.shipping.logoSize}mm;
                 opacity: ${settings.shipping.logoOpacity / 100};
                 --opacity: ${settings.shipping.logoOpacity / 100};
                 pointer-events: none;
                 z-index: 1;
               ">
        ` : ''}
        
        <!-- 物流單內容 - 加入排版調整 -->
        <div style="
          z-index: 2;
          position: relative;
          transform: scale(${layoutSettings.scale / 100}) translate(${layoutSettings.offsetX}mm, ${layoutSettings.offsetY}mm);
          transform-origin: center center;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div class="bv-shipping-wrapper-inner">
            ${data.html}
          </div>
        </div>
        
        <!-- 訂單編號標籤（最上層） -->
        ${settings.showOrderNumber && displayOrderNo ? `
          <div style="
            position: absolute;
            top: ${settings.orderLabelTop}mm;
            left: 50%;
            transform: translateX(-50%);
            background: white;
            padding: 4px 12px;
            border: 1px solid #333;
            border-radius: 4px;
            font-size: ${settings.orderLabelSize}px;
            font-weight: bold;
            z-index: 1000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            white-space: nowrap;
          ">
            訂單編號：${displayOrderNo}
          </div>
        ` : ''}
      </div>
    `;
  }

  // 在初始化時載入所有超商的設定
  function loadAllProviderSettings() {
    ['default', 'seven', 'family', 'hilife', 'okmart', 'kerry'].forEach(provider => {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([`bvProviderSettings_${provider}`], (result) => {
          if (result[`bvProviderSettings_${provider}`]) {
            cachedProviderSettings[provider] = result[`bvProviderSettings_${provider}`];
          }
        });
      }
    });
  }
    
  // 新增：從 HTML 內容偵測超商類型
  function detectProviderFromHTML(html) {
    if (html.includes('統一超商') || html.includes('7-ELEVEN')) return 'seven';
    if (html.includes('全家便利商店') || html.includes('FamilyMart')) return 'family';
    if (html.includes('萊爾富') || html.includes('Hi-Life')) return 'hilife';
    if (html.includes('OK超商') || html.includes('OK·MART')) return 'okmart';
    if (html.includes('嘉里大榮') || html.includes('Kerry')) return 'kerry';
    return 'default';
  }
  
  function generateDetailPage(data, settings) {
    if (!data || !data.orderInfo) return '';
    
    const fields = getFieldSettings();
    const info = data.orderInfo;
    const scale = settings.paper.scale / 100;
    
    // 始終使用 100mm x 150mm，但內部邊距仍可調整
    const actualMargin = Math.min(settings.paper.margin, 10); // 限制最大邊距為 10mm
    const availableWidth = (100 - (actualMargin * 2)) / scale;
    
    return `
      <div class="bv-detail-content" style="
        width: 100mm;
        height: 150mm;
        position: relative;
        overflow: hidden;
        background: white;
        padding: ${actualMargin}mm;
        box-sizing: border-box;
      ">
        <!-- 底圖 -->
        ${settings.detail.logo ? `
          <img src="${settings.detail.logo}" 
               class="bv-watermark-logo"
               style="
                 position: absolute;
                 top: ${settings.detail.logoY}%;
                 left: ${settings.detail.logoX}%;
                 transform: translate(-50%, -50%);
                 width: ${settings.detail.logoSize}mm;
                 opacity: ${settings.detail.logoOpacity / 100};
                 --opacity: ${settings.detail.logoOpacity / 100};
                 pointer-events: none;
                 z-index: 1;
               ">
        ` : ''}
        
        <!-- 明細內容 -->
        <div style="
          transform: scale(${scale});
          transform-origin: top left;
          width: ${availableWidth}mm;
          position: relative;
          z-index: 2;
          font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif;
          font-size: ${settings.detail.textSize};
        ">
          <h2 style="text-align: center; margin: 0 0 8px 0; font-size: 18px;">出貨明細</h2>
          
          <!-- 基本資訊 -->
          <div style="font-size: ${settings.detail.textSize}; line-height: 1.4;">
            <div style="margin-bottom: 8px;">
              <p style="margin: 2px 0;"><strong>訂單編號：</strong>${info.orderNo}</p>
              <p style="margin: 2px 0;"><strong>訂購日期：</strong>${info.orderDate}</p>
              ${fields.showLogTraceId && data.logTraceId ? `<p style="margin: 2px 0;"><strong>物流編號：</strong>${data.logTraceId}</p>` : ''}
            </div>
            
            <div style="margin-bottom: 8px;">
              <p style="margin: 2px 0;"><strong>訂購人：</strong>${fields.hideInfo ? maskName(info.customer) : info.customer}</p>
              <p style="margin: 2px 0;"><strong>收件人：</strong>${fields.hideInfo ? maskName(info.recipient) : info.recipient}</p>
              <p style="margin: 2px 0;"><strong>電話：</strong>${fields.hideInfo ? maskPhone(info.recipientPhone) : info.recipientPhone}</p>
              <p style="margin: 2px 0;"><strong>地址：</strong>${info.address}</p>
              ${info.storeName ? `<p style="margin: 2px 0;"><strong>門市：</strong>${info.storeName}</p>` : ''}
              ${fields.deliveryTime && info.deliveryTime ? `<p style="margin: 2px 0;"><strong>指定配送時段：</strong>${info.deliveryTime}</p>` : ''}
              ${fields.shippingTime && info.shippingTime ? `<p style="margin: 2px 0;"><strong>預計出貨日：</strong>${info.shippingTime}</p>` : ''}
            </div>
          </div>
          
          <!-- 商品明細表格 -->
          <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: ${settings.detail.textSize};">
            <thead>
              <tr style="border-top: 1px solid black; border-bottom: 1px solid black;">
                <th style="text-align: left; padding: 4px; width: 60%;">品名</th>
                ${!fields.hidePrice ? '<th style="text-align: right; padding: 4px; width: 20%;">單價</th>' : ''}
                <th style="text-align: center; padding: 4px; width: ${fields.hidePrice ? '40%' : '10%'};">數量</th>
                ${!fields.hidePrice ? '<th style="text-align: right; padding: 4px; width: 10%;">小計</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${info.items.map(item => `
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 3px; font-size: 12px;">
                    ${fields.productImage && item.image ? `<img src="${item.image}" style="width: 20px; height: 20px; object-fit: cover; vertical-align: middle; margin-right: 4px;">` : ''}
                    <span>${item.name}</span>
                  </td>
                  ${!fields.hidePrice ? `<td style="text-align: right; padding: 3px; font-size: 12px;">${item.price}</td>` : ''}
                  <td style="text-align: center; padding: 3px; font-size: 12px;">${item.qty}</td>
                  ${!fields.hidePrice ? `<td style="text-align: right; padding: 3px; font-size: 12px;">${item.subtotal}</td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <!-- 總計 -->
          ${!fields.hidePrice ? `
            <div style="margin-top: 8px; text-align: right; font-size: ${settings.detail.textSize};">
              <p style="margin: 2px 0;">商品總數量：${info.totalQty}</p>
              ${info.extraShipping ? `<p style="margin: 2px 0;">額外運費：${info.extraShipping}</p>` : ''}
              <p style="margin: 2px 0; font-weight: bold;">總計：${info.total}</p>
            </div>
          ` : ''}
          
          <!-- 備註 -->
          ${fields.remark && info.remark ? `
            <div style="margin-top: 8px; padding: 4px; background: #f5f5f5; font-size: 12px;">
              <strong>顧客備註：</strong>${info.remark}
            </div>
          ` : ''}
          
          ${fields.manageRemark && info.manageRemark ? `
            <div style="margin-top: 4px; padding: 4px; background: #f5f5f5; font-size: 12px;">
              <strong>後台備註：</strong>${info.manageRemark}
            </div>
          ` : ''}
          
          ${fields.printRemark && info.printRemark ? `
            <div style="margin-top: 4px; padding: 4px; background: #f5f5f5; font-size: 12px;">
              <strong>列印備註：</strong>${info.printRemark}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
  
  // 遮罩函數
  function maskName(name) {
    if (!name) return '';
    if (name.length <= 1) return name;
    return name[0] + '＊'.repeat(name.length - 1);
  }
  
  function maskPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 7) return phone;
    return phone.substring(0, 4) + '***' + phone.substring(phone.length - 3);
  }
  
  function handlePrint() {
    const settings = getSettings();
    const printOrder = document.getElementById('bv-print-order').value;
    const pages = generatePages(printOrder, settings);
    
    if (pages.length === 0) {
      showNotification('沒有可列印的資料', 'warning');
      return;
    }
    
    // 移除之前的列印樣式
    const existingStyle = document.getElementById('bv-print-specific-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // 添加列印專用樣式 - 強制覆蓋所有原始樣式
    const printStyleElement = document.createElement('style');
    printStyleElement.id = 'bv-print-specific-styles';
    printStyleElement.textContent = `
      /* 強制覆蓋原始的列印樣式 */
      @media print {
        /* 最高優先級的頁面設定 */
        @page {
          size: 100mm 150mm !important;
          margin: 0 !important;
        }
        
        /* 覆蓋所有 html 和 body 的設定 */
        html {
          width: auto !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          font-size: 16px !important;
        }
        
        body {
          width: auto !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          /* 移除原始的 20cm 寬度限制 */
          max-width: none !important;
          min-width: auto !important;
        }
        
        /* 隱藏所有非列印內容 */
        #bv-shipping-assistant-panel,
        #bv-shipping-panel,
        .bv-notification,
        .ignore-print,
        .order-content,
        body > *:not(#bv-preview-container) {
          display: none !important;
          visibility: hidden !important;
        }
        
        /* 只顯示預覽容器 */
        #bv-preview-container {
          display: block !important;
          visibility: visible !important;
          width: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          position: static !important;
        }
        
        /* 每頁固定 100mm x 150mm */
        .bv-preview-page,
        .bv-print-page {
          display: block !important;
          visibility: visible !important;
          width: 100mm !important;
          height: 150mm !important;
          min-width: 100mm !important;
          min-height: 150mm !important;
          max-width: 100mm !important;
          max-height: 150mm !important;
          margin: 0 !important;
          padding: 0 !important;
          page-break-after: always !important;
          page-break-inside: avoid !important;
          position: relative !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          background: white !important;
          border: none !important;
          box-shadow: none !important;
        }
        
        .bv-preview-page:last-child {
          page-break-after: auto !important;
        }
        
        /* 內容容器也固定尺寸 */
        .bv-shipping-content,
        .bv-detail-content {
          display: block !important;
          visibility: visible !important;
          width: 100mm !important;
          height: 150mm !important;
          margin: 0 !important;
          position: relative !important;
          box-sizing: border-box !important;
        }
        
        /* 確保物流單正確顯示 */
        .bv-shipping-wrapper,
        .div_frame {
          margin: 0 auto !important;
          transform: none !important;
        }

        /* 確保圖片正確顯示 */
        img {
          display: inline-block !important;
          visibility: visible !important;
          max-width: none !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        
        /* 特別處理 QR Code */
        img[src*="QRCode"],
        img[src*="qrcode"],
        img[src*="SendQRCode"],
        img#ctl00_Bill1_sendQRCode,
        img#ctl00_Bill1_QRCODE {
          display: inline-block !important;
          visibility: visible !important;
          opacity: 1 !important;
          width: auto !important;
          height: auto !important;
        }
        
        /* 確保圖片和顏色正確顯示 */
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        
        /* 確保所有內容可見 */
        .bv-preview-page *,
        .bv-print-page * {
          visibility: visible !important;
        }
        
        /* 隱藏底圖外的其他元素 */
        .bv-watermark-logo {
          opacity: var(--opacity) !important;
        }
      }
      
      /* 添加到普通樣式區，避免被覆蓋 */
      @media all {
        #bv-print-specific-styles {
          display: none !important;
        }
      }
    `;
    
    // 插入到 head 最後，確保優先級最高
    document.head.appendChild(printStyleElement);
    
    // 暫時移除原始的 style 標籤
    const originalStyles = document.querySelectorAll('style');
    const styleStates = [];
    originalStyles.forEach(style => {
      if (style.id !== 'bv-print-specific-styles' && style.textContent.includes('@page')) {
        styleStates.push({
          element: style,
          disabled: style.disabled
        });
        style.disabled = true;
      }
    });
    
    // 延遲執行列印
    setTimeout(() => {
      window.print();
      
      // 列印後恢復原始樣式
      setTimeout(() => {
        // 移除我們的列印樣式
        const tempStyle = document.getElementById('bv-print-specific-styles');
        if (tempStyle) {
          tempStyle.remove();
        }
        
        // 恢復原始樣式
        styleStates.forEach(state => {
          state.element.disabled = state.disabled;
        });
      }, 2000);
    }, 100);
  }
  
  // 工具函數
  function updateValueDisplay(id) {
    const element = document.getElementById('bv-' + id);
    const valueElement = document.getElementById('bv-' + id + '-value');
    if (element && valueElement) {
      if (id.includes('scale') || id.includes('opacity')) {
        valueElement.textContent = element.value + '%';
      } else if (id.includes('offset-x') || id.includes('offset-y') || id.includes('padding')) {
        valueElement.textContent = element.value + 'mm';
      } else if (id.includes('size') || id.includes('margin') || id.includes('width') || id.includes('height') || id.includes('top')) {
        valueElement.textContent = element.value + (id.includes('label-size') ? 'px' : 'mm');
      }
    }
  }
  
  function updateRangeProgress(input) {
    const value = (input.value - input.min) / (input.max - input.min) * 100;
    input.style.setProperty('--value', value + '%');
  }
  
  // 修改 getSettings 函數
  function getSettings() {
    // 取得當前選擇的超商
    const currentProvider = document.getElementById('bv-shipping-provider')?.value || 'default';
    
    // 從快取或即時設定取得
    const currentProviderSettings = cachedProviderSettings[currentProvider] || {
      scale: parseInt(document.getElementById('bv-shipping-scale')?.value || 100),
      offsetX: parseInt(document.getElementById('bv-shipping-offset-x')?.value || 0),
      offsetY: parseInt(document.getElementById('bv-shipping-offset-y')?.value || 0),
      padding: parseInt(document.getElementById('bv-shipping-padding')?.value || 0)
    };
    
    return {
      paper: {
        width: parseInt(document.getElementById('bv-paper-width')?.value || 100),
        height: parseInt(document.getElementById('bv-paper-height')?.value || 150),
        scale: parseInt(document.getElementById('bv-scale')?.value || 100),
        margin: parseInt(document.getElementById('bv-margin')?.value || 5)
      },
      showOrderNumber: document.getElementById('bv-shipping-order')?.checked ?? true,
      orderLabelTop: parseInt(document.getElementById('bv-order-label-top')?.value || 5),
      orderLabelSize: parseInt(document.getElementById('bv-order-label-size')?.value || 14),
      shipping: {
        logo: savedLogos.shipping,
        logoSize: parseInt(document.getElementById('bv-shipping-logo-size')?.value || 30),
        logoX: parseInt(document.getElementById('bv-shipping-logo-x')?.value || 50),
        logoY: parseInt(document.getElementById('bv-shipping-logo-y')?.value || 50),
        logoOpacity: parseInt(document.getElementById('bv-shipping-logo-opacity')?.value || 20),
        providerSettings: cachedProviderSettings,
        currentProviderSettings: currentProviderSettings // 當前超商的設定
      },
      detail: {
        textSize: document.getElementById('bv-detail-text-size')?.value || '14px',
        logo: savedLogos.detail,
        logoSize: parseInt(document.getElementById('bv-detail-logo-size')?.value || 50),
        logoX: parseInt(document.getElementById('bv-detail-logo-x')?.value || 50),
        logoY: parseInt(document.getElementById('bv-detail-logo-y')?.value || 50),
        logoOpacity: parseInt(document.getElementById('bv-detail-logo-opacity')?.value || 20)
      }
    };
  }
  
  function getFieldSettings() {
    const fields = {};
    document.querySelectorAll('.bv-field-list input').forEach(checkbox => {
      const fieldName = checkbox.id.replace('bv-field-', '');
      fields[fieldName] = checkbox.checked;
    });
    return fields;
  }
  
  function saveSettings() {
    const settings = getSettings();
    const fieldSettings = getFieldSettings();
    
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        bvShippingSettings: settings,
        bvFieldSettings: fieldSettings,
        bvShippingLogos: savedLogos
      });
    }
  }
  
  function loadSavedSettings() {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['bvShippingSettings', 'bvFieldSettings', 'bvShippingLogos'], (result) => {
        if (result.bvShippingSettings) {
          const settings = result.bvShippingSettings;
          
          // 載入紙張設定
          if (settings.paper) {
            document.getElementById('bv-paper-width').value = settings.paper.width;
            document.getElementById('bv-paper-height').value = settings.paper.height;
            document.getElementById('bv-scale').value = settings.paper.scale;
            document.getElementById('bv-margin').value = settings.paper.margin;
            updateValueDisplay('paper-width');
            updateValueDisplay('paper-height');
            updateValueDisplay('scale');
            updateValueDisplay('margin');
          }
          
          // 載入訂單標籤設定
          document.getElementById('bv-shipping-order').checked = settings.showOrderNumber;
          document.getElementById('bv-order-label-top').value = settings.orderLabelTop;
          document.getElementById('bv-order-label-size').value = settings.orderLabelSize;
          updateValueDisplay('order-label-top');
          updateValueDisplay('order-label-size');
          
          // 載入物流單Logo設定
          if (settings.shipping) {
            document.getElementById('bv-shipping-logo-size').value = settings.shipping.logoSize;
            document.getElementById('bv-shipping-logo-x').value = settings.shipping.logoX;
            document.getElementById('bv-shipping-logo-y').value = settings.shipping.logoY;
            document.getElementById('bv-shipping-logo-opacity').value = settings.shipping.logoOpacity;
            updateValueDisplay('shipping-logo-size');
            updateValueDisplay('shipping-logo-x');
            updateValueDisplay('shipping-logo-y');
            updateValueDisplay('shipping-logo-opacity');
          }
          
          // 載入明細設定
          if (settings.detail) {
            document.getElementById('bv-detail-text-size').value = settings.detail.textSize;
            document.getElementById('bv-detail-logo-size').value = settings.detail.logoSize;
            document.getElementById('bv-detail-logo-x').value = settings.detail.logoX;
            document.getElementById('bv-detail-logo-y').value = settings.detail.logoY;
            document.getElementById('bv-detail-logo-opacity').value = settings.detail.logoOpacity;
            updateValueDisplay('detail-logo-size');
            updateValueDisplay('detail-logo-x');
            updateValueDisplay('detail-logo-y');
            updateValueDisplay('detail-logo-opacity');
          }
          
          // 更新訂單標籤控制顯示
          const controls = document.getElementById('bv-order-label-controls');
          if (controls) {
            controls.style.display = settings.showOrderNumber ? 'block' : 'none';
          }
          
          // 更新所有 range 的進度條
          document.querySelectorAll('input[type="range"]').forEach(updateRangeProgress);
        }
        
        if (result.bvFieldSettings) {
          Object.keys(result.bvFieldSettings).forEach(field => {
            const checkbox = document.getElementById('bv-field-' + field);
            if (checkbox) checkbox.checked = result.bvFieldSettings[field];
          });
        }
        
        // 載入Logo
        if (result.bvShippingLogos) {
          savedLogos = result.bvShippingLogos;
          
          // 物流單Logo
          if (savedLogos.shipping) {
            const preview = document.getElementById('bv-shipping-logo-preview');
            const prompt = document.getElementById('bv-shipping-upload-prompt');
            const uploadArea = document.getElementById('bv-shipping-logo-upload');
            const controls = document.getElementById('bv-shipping-logo-controls');
            
            if (preview) {
              preview.src = savedLogos.shipping;
              preview.style.display = 'block';
            }
            if (prompt) prompt.style.display = 'none';
            if (uploadArea) uploadArea.classList.add('has-logo');
            if (controls) controls.classList.add('active');
          }
          
          // 明細Logo
          if (savedLogos.detail) {
            const preview = document.getElementById('bv-detail-logo-preview');
            const prompt = document.getElementById('bv-detail-upload-prompt');
            const uploadArea = document.getElementById('bv-detail-logo-upload');
            const controls = document.getElementById('bv-detail-logo-controls');
            
            if (preview) {
              preview.src = savedLogos.detail;
              preview.style.display = 'block';
            }
            if (prompt) prompt.style.display = 'none';
            if (uploadArea) uploadArea.classList.add('has-logo');
            if (controls) controls.classList.add('active');
          }
        }
      });
    }
  }
  
  function loadSavedData() {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['bvShippingData', 'bvDetailData', 'bvPdfShippingData'], (result) => {
        if (result.bvShippingData) shippingData = result.bvShippingData;
        if (result.bvDetailData) detailData = result.bvDetailData;
        if (result.bvPdfShippingData) pdfShippingData = result.bvPdfShippingData;
        updateDataStatus();
        if (shippingData.length > 0 || detailData.length > 0 || pdfShippingData.length > 0) {
          updatePreview();
        }
      });
    }
  }
  
  function updateDataStatus() {
    const shippingCount = document.getElementById('bv-shipping-count');
    const detailCount = document.getElementById('bv-detail-count');
    const kerryStatus = document.getElementById('bv-kerry-status');
    
    // 計算總物流單數量（包含 PDF）
    const totalShippingCount = shippingData.length + pdfShippingData.length;
    
    if (shippingCount) {
      if (totalShippingCount > 0) {
        let statusText = `已抓取 ${totalShippingCount} 張`;
        if (pdfShippingData.length > 0) {
          statusText += ` (含 ${pdfShippingData.length} 張 PDF)`;
        }
        shippingCount.textContent = statusText;
        shippingCount.className = 'bv-status-badge success';
      } else {
        shippingCount.textContent = '未抓取';
        shippingCount.className = 'bv-status-badge';
      }
    }
    
    if (detailCount) {
      detailCount.textContent = detailData.length > 0 ? `已抓取 ${detailData.length} 張` : '未抓取';
      detailCount.className = detailData.length > 0 ? 'bv-status-badge success' : 'bv-status-badge';
    }
    
    // 顯示嘉里大榮狀態
    if (kerryStatus && pdfShippingData.length > 0) {
      kerryStatus.style.display = 'block';
    }
  }
  
  // 預設系統功能 - 改用 chrome.storage
  function initPresetSystem() {
    const presetSelect = document.getElementById('bv-preset-select');
    const savePresetBtn = document.getElementById('bv-save-preset');
    const deletePresetBtn = document.getElementById('bv-delete-preset');
    const resetFormatBtn = document.getElementById('bv-reset-format');
    const savePresetRow = document.getElementById('bv-save-preset-row');
    const newPresetName = document.getElementById('bv-new-preset-name');
    const confirmSaveBtn = document.getElementById('bv-confirm-save');
    const cancelSaveBtn = document.getElementById('bv-cancel-save');
    
    if (!presetSelect) return;
    
    // 載入預設檔列表
    loadPresetList();
    
    // 選擇設定檔時載入設定
    presetSelect.addEventListener('change', function() {
      const selectedPreset = presetSelect.value;
      if (selectedPreset && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([`preset_${selectedPreset}`], (result) => {
          const settings = result[`preset_${selectedPreset}`];
          if (settings) {
            applySavedSettings(settings);
            chrome.storage.local.set({ lastSelectedPreset: selectedPreset });
            showNotification(`已載入設定檔「${selectedPreset}」`, 'success');
          }
        });
      }
    });
    
    // 儲存設定按鈕
    if (savePresetBtn) {
      savePresetBtn.addEventListener('click', function() {
        if (savePresetRow) {
          savePresetRow.style.display = 'flex';
        }
        if (newPresetName) {
          newPresetName.value = presetSelect.value || '';
          newPresetName.focus();
        }
      });
    }
    
    // 確認儲存
    if (confirmSaveBtn) {
      confirmSaveBtn.addEventListener('click', function() {
        if (!newPresetName) return;
        
        const presetName = newPresetName.value.trim();
        if (!presetName) {
          showNotification('請輸入設定檔名稱', 'warning');
          return;
        }
        
        const settings = saveCurrentSettings();
        
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['presetList'], (result) => {
            const allPresets = result.presetList || [];
            if (!allPresets.includes(presetName)) {
              allPresets.push(presetName);
            }
            
            const storageData = {
              [`preset_${presetName}`]: settings,
              presetList: allPresets,
              lastSelectedPreset: presetName
            };
            
            chrome.storage.local.set(storageData, () => {
              loadPresetList();
              if (savePresetRow) {
                savePresetRow.style.display = 'none';
              }
              showNotification(`設定檔「${presetName}」已儲存`, 'success');
            });
          });
        }
      });
    }
    
    // 取消儲存
    if (cancelSaveBtn) {
      cancelSaveBtn.addEventListener('click', function() {
        if (savePresetRow) {
          savePresetRow.style.display = 'none';
        }
      });
    }
    
    // 刪除設定檔
    if (deletePresetBtn) {
      deletePresetBtn.addEventListener('click', function() {
        const selectedPreset = presetSelect.value;
        if (!selectedPreset) {
          showNotification('請先選擇一個設定檔', 'warning');
          return;
        }
        
        if (confirm(`確定要刪除設定檔「${selectedPreset}」嗎？`)) {
          if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['presetList', 'lastSelectedPreset'], (result) => {
              const allPresets = result.presetList || [];
              const updatedPresets = allPresets.filter(name => name !== selectedPreset);
              
              const storageData = { presetList: updatedPresets };
              
              // 如果刪除的是最後選擇的設定檔，清除記錄
              if (result.lastSelectedPreset === selectedPreset) {
                chrome.storage.local.remove(['lastSelectedPreset']);
              }
              
              // 移除設定檔數據
              chrome.storage.local.remove([`preset_${selectedPreset}`], () => {
                chrome.storage.local.set(storageData, () => {
                  loadPresetList();
                  showNotification(`設定檔「${selectedPreset}」已刪除`, 'success');
                });
              });
            });
          }
        }
      });
    }
    
    // 清除格式按鈕
    if (resetFormatBtn) {
      resetFormatBtn.addEventListener('click', function() {
        if (confirm('確定要將所有設定重置為預設值嗎？\n\n此操作無法復原。')) {
          // 清除Logo
          savedLogos = { shipping: null, detail: null };
          ['shipping', 'detail'].forEach(type => {
            const preview = document.getElementById(`bv-${type}-logo-preview`);
            const prompt = document.getElementById(`bv-${type}-upload-prompt`);
            const uploadArea = document.getElementById(`bv-${type}-logo-upload`);
            const controls = document.getElementById(`bv-${type}-logo-controls`);
            const input = document.getElementById(`bv-${type}-logo-input`);
            
            if (preview) preview.style.display = 'none';
            if (prompt) prompt.style.display = 'flex';
            if (uploadArea) uploadArea.classList.remove('has-logo');
            if (controls) controls.classList.remove('active');
            if (input) input.value = '';
          });
          
          // 套用預設值
          applySavedSettings(getDefaultSettings());
          
          // 清除預設檔選擇
          if (presetSelect) {
            presetSelect.value = '';
          }
          
          // 清除最後選擇的預設檔記錄
          if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.remove(['lastSelectedPreset']);
          }
          
          showNotification('已重置為預設值', 'success');
        }
      });
    }
    
    // Enter 鍵儲存設定檔
    if (newPresetName) {
      newPresetName.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && confirmSaveBtn) {
          confirmSaveBtn.click();
        }
      });
    }
  }
  
  function loadPresetList() {
    const presetSelect = document.getElementById('bv-preset-select');
    if (!presetSelect) return;
    
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['presetList', 'lastSelectedPreset'], (result) => {
        const allPresets = result.presetList || [];
        const lastSelected = result.lastSelectedPreset;
        
        // 清空現有選項
        while (presetSelect.options.length > 1) {
          presetSelect.remove(1);
        }
        
        // 添加所有設定檔
        allPresets.forEach(presetName => {
          const option = document.createElement('option');
          option.value = presetName;
          option.textContent = presetName;
          presetSelect.appendChild(option);
          
          // 如果是上次選擇的設定檔，預設選中
          if (presetName === lastSelected) {
            option.selected = true;
          }
        });
      });
    }
  }
  
  function saveCurrentSettings() {
    const settings = getSettings();
    const fieldSettings = getFieldSettings();
    return {
      ...settings,
      fields: fieldSettings,
      version: '2.5.0' // 更新版本號以支援嘉里大榮
    };
  }
  
  function applySavedSettings(settings) {
    if (!settings) return;
    
    // 載入紙張設定
    if (settings.paper) {
      document.getElementById('bv-paper-width').value = settings.paper.width;
      document.getElementById('bv-paper-height').value = settings.paper.height;
      document.getElementById('bv-scale').value = settings.paper.scale;
      document.getElementById('bv-margin').value = settings.paper.margin;
      ['paper-width', 'paper-height', 'scale', 'margin'].forEach(id => {
        updateValueDisplay(id);
        const element = document.getElementById('bv-' + id);
        if (element) updateRangeProgress(element);
      });
    }
    
    // 載入訂單標籤設定
    document.getElementById('bv-shipping-order').checked = settings.showOrderNumber;
    document.getElementById('bv-order-label-top').value = settings.orderLabelTop;
    document.getElementById('bv-order-label-size').value = settings.orderLabelSize;
    ['order-label-top', 'order-label-size'].forEach(id => {
      updateValueDisplay(id);
      const element = document.getElementById('bv-' + id);
      if (element) updateRangeProgress(element);
    });
    
    // 載入Logo設定
    if (settings.shipping) {
      savedLogos.shipping = settings.shipping.logo;
      if (savedLogos.shipping) {
        const preview = document.getElementById('bv-shipping-logo-preview');
        const prompt = document.getElementById('bv-shipping-upload-prompt');
        const uploadArea = document.getElementById('bv-shipping-logo-upload');
        const controls = document.getElementById('bv-shipping-logo-controls');
        
        if (preview) {
          preview.src = savedLogos.shipping;
          preview.style.display = 'block';
        }
        if (prompt) prompt.style.display = 'none';
        if (uploadArea) uploadArea.classList.add('has-logo');
        if (controls) controls.classList.add('active');
      }
      
      document.getElementById('bv-shipping-logo-size').value = settings.shipping.logoSize;
      document.getElementById('bv-shipping-logo-x').value = settings.shipping.logoX;
      document.getElementById('bv-shipping-logo-y').value = settings.shipping.logoY;
      document.getElementById('bv-shipping-logo-opacity').value = settings.shipping.logoOpacity;
      ['shipping-logo-size', 'shipping-logo-x', 'shipping-logo-y', 'shipping-logo-opacity'].forEach(id => {
        updateValueDisplay(id);
        const element = document.getElementById('bv-' + id);
        if (element) updateRangeProgress(element);
      });
    }
    
    if (settings.detail) {
      savedLogos.detail = settings.detail.logo;
      if (savedLogos.detail) {
        const preview = document.getElementById('bv-detail-logo-preview');
        const prompt = document.getElementById('bv-detail-upload-prompt');
        const uploadArea = document.getElementById('bv-detail-logo-upload');
        const controls = document.getElementById('bv-detail-logo-controls');
        
        if (preview) {
          preview.src = savedLogos.detail;
          preview.style.display = 'block';
        }
        if (prompt) prompt.style.display = 'none';
        if (uploadArea) uploadArea.classList.add('has-logo');
        if (controls) controls.classList.add('active');
      }
      
      document.getElementById('bv-detail-text-size').value = settings.detail.textSize;
      document.getElementById('bv-detail-logo-size').value = settings.detail.logoSize;
      document.getElementById('bv-detail-logo-x').value = settings.detail.logoX;
      document.getElementById('bv-detail-logo-y').value = settings.detail.logoY;
      document.getElementById('bv-detail-logo-opacity').value = settings.detail.logoOpacity;
      ['detail-logo-size', 'detail-logo-x', 'detail-logo-y', 'detail-logo-opacity'].forEach(id => {
        updateValueDisplay(id);
        const element = document.getElementById('bv-' + id);
        if (element) updateRangeProgress(element);
      });
    }
    
    // 載入欄位設定
    if (settings.fields) {
      Object.keys(settings.fields).forEach(field => {
        const checkbox = document.getElementById('bv-field-' + field);
        if (checkbox) checkbox.checked = settings.fields[field];
      });
    }
    
    // 更新訂單標籤控制顯示
    const controls = document.getElementById('bv-order-label-controls');
    if (controls) {
      controls.style.display = settings.showOrderNumber ? 'block' : 'none';
    }
    
    saveSettings();
    updatePreview();
  }
  
  function getDefaultSettings() {
    return {
      paper: {
        width: 100,
        height: 150,
        scale: 100,
        margin: 5
      },
      showOrderNumber: true,
      orderLabelTop: 5,
      orderLabelSize: 14,
      shipping: {
        logo: null,
        logoSize: 30,
        logoX: 50,
        logoY: 50,
        logoOpacity: 20
      },
      detail: {
        textSize: '14px',
        logo: null,
        logoSize: 50,
        logoX: 50,
        logoY: 50,
        logoOpacity: 20
      },
      fields: {
        productImage: false,
        remark: false,
        manageRemark: false,
        printRemark: true,
        deliveryTime: false,
        shippingTime: true,
        hideInfo: true,
        hidePrice: true,
        showLogTraceId: true
      }
    };
  }
  
  function showNotification(message, type = 'info') {
    // 對物流單頁面，使用簡單的通知方式
    if (currentPage.type === 'shipping') {
      console.log(`[${type.toUpperCase()}] ${message}`);
      alert(message);
      return;
    }
    
    // 對明細頁面，使用視覺化通知
    const notification = document.createElement('div');
    notification.className = `bv-notification ${type}`;
    notification.innerHTML = `
      <span class="material-icons">${
        type === 'success' ? 'check_circle' : 
        type === 'warning' ? 'warning' : 
        type === 'error' ? 'error' : 
        'info'
      }</span>
      <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  // === 主程式執行 ===

  // 根據頁面類型自動執行對應的初始化
  if (currentPage.type === 'shipping') {
    console.log('偵測到物流單頁面，類型:', currentPage.provider);
    
    if (currentPage.provider === 'kerry') {
      // 執行嘉里大榮特殊處理
      handleKerryShippingPage();
    } 
    // 其他超商物流單才顯示面板
    else if (currentPage.provider !== 'unknown') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          if (checkExtensionValid()) {
            setTimeout(injectShippingPanel, 300);
          }
        });
      } else {
        if (checkExtensionValid()) {
          setTimeout(injectShippingPanel, 300);
        }
      }
    }
  } else if (currentPage.type === 'detail') {
    // 明細頁也自動啟動
    console.log('BV SHOP 出貨明細頁面已偵測，自動啟動助手');
    
    // 自動啟動面板
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
          activateDetailPanel();
        }, 500);
      });
    } else {
      setTimeout(() => {
        activateDetailPanel();
      }, 500);
    }
  }

})();
        
