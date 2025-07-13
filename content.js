// content.js - BV SHOP 出貨助手 Content Script
// 版本: 2.5.0
// 作者: Derek Yu

console.log('BV SHOP 出貨助手已載入');

// === 全域變數 ===
let isProcessing = false;
let autoModeEnabled = false;
let currentSettings = null;

// === 初始化 ===
(async function init() {
  console.log('初始化 Content Script...');
  
  // 通知 background script
  if (chrome.runtime) {
    chrome.runtime.sendMessage({ action: 'contentScriptReady' });
  }
  
  // 載入設定
  await loadSettings();
  
  // 檢查當前頁面
  const currentUrl = window.location.href;
  console.log('當前頁面:', currentUrl);
  
  // 判斷頁面類型並執行對應功能
  if (currentUrl.includes('C2CMap')) {
    // 超商取貨頁面
    console.log('偵測到超商取貨頁面');
    handleShippingPage();
  } else if (currentUrl.includes('order_multi_print_ktj_logistics')) {
    // 嘉里大榮物流單頁面
    console.log('偵測到嘉里大榮物流單頁面');
    handleKTJPage();
  } else if (currentUrl.includes('order_print')) {
    // 明細頁面
    console.log('偵測到明細頁面');
    initializeUI();
  }
})();

// === 載入設定 ===
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['bvSettings']);
    currentSettings = result.bvSettings || getDefaultSettings();
    console.log('已載入設定:', currentSettings);
  } catch (error) {
    console.error('載入設定失敗:', error);
    currentSettings = getDefaultSettings();
  }
}

// === 預設設定 ===
function getDefaultSettings() {
  return {
    autoMode: false,
    autoDelay: 3,
    autoPrint: false,
    printDelay: 2,
    showOrderNumber: true,
    orderLabelTop: 10,
    orderLabelSize: 14,
    showDetailFirst: false,
    detail: {
      titleSize: 18,
      contentSize: 12,
      showShopName: true,
      customShopName: '',
      showBrand: true,
      showMadeIn: true,
      showSpec: true,
      showQuantity: true,
      showNote: true,
      showOrderInfo: true,
      noteMaxLength: 50,
      qrcodeSize: 60
    },
    shipping: {
      logo: '',
      logoX: 50,
      logoY: 50,
      logoSize: 30,
      logoOpacity: 20,
      providerSettings: {
        '711': { scale: 100, offsetX: 0, offsetY: 0, padding: 0 },
        'family': { scale: 100, offsetX: 0, offsetY: 0, padding: 0 },
        'hilife': { scale: 100, offsetX: 0, offsetY: 0, padding: 0 },
        'okmart': { scale: 100, offsetX: 0, offsetY: 0, padding: 0 },
        'ktj': { scale: 100, offsetX: 0, offsetY: 0, padding: 0 }
      }
    }
  };
}

// === 嘉里大榮專用函數（新版）===
async function handleKTJPage() {
  console.log('=== 嘉里大榮頁面處理開始 ===');
  
  // 顯示處理訊息
  showNotification('偵測到嘉里大榮物流單，準備下載 PDF...', 'info');
  
  // 等待頁面載入
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    // 取得訂單資訊
    const urlParams = new URLSearchParams(location.search);
    const orderIds = urlParams.get('ids')?.split(',') || [];
    
    console.log('訂單編號:', orderIds);
    
    // 儲存訂單資訊
    await chrome.storage.local.set({
      ktjPendingOrders: orderIds,
      ktjTimestamp: Date.now()
    });
    
    // 尋找 PDF 連結或觸發下載
    const pdfFound = await findAndDownloadPDF();
    
    if (pdfFound) {
      showNotification('PDF 下載已觸發，請在下載完成後到出貨明細頁面上傳', 'success');
    } else {
      // 如果找不到 PDF，提供手動下載指引
      showKTJDownloadGuide(orderIds);
    }
    
  } catch (error) {
    console.error('處理嘉里大榮頁面失敗:', error);
    showNotification('處理失敗: ' + error.message, 'error');
  }
}

// 尋找並下載 PDF
async function findAndDownloadPDF() {
  // 嘗試找到 PDF 元素
  const pdfElements = [
    document.querySelector('embed[type="application/pdf"]'),
    document.querySelector('iframe[src*=".pdf"]'),
    document.querySelector('object[data*=".pdf"]'),
    document.querySelector('a[href*=".pdf"]')
  ].filter(Boolean);
  
  if (pdfElements.length > 0) {
    const element = pdfElements[0];
    let pdfUrl = null;
    
    if (element.tagName === 'A') {
      pdfUrl = element.href;
    } else if (element.src) {
      pdfUrl = element.src;
    } else if (element.data) {
      pdfUrl = element.data;
    }
    
    if (pdfUrl) {
      // 觸發下載
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `ktj_logistics_${Date.now()}.pdf`;
      link.click();
      return true;
    }
  }
  
  // 嘗試使用 Ctrl+S 觸發下載
  showNotification('請按 Ctrl+S (或 Cmd+S) 儲存 PDF 檔案', 'warning');
  return false;
}

// 顯示下載指引
function showKTJDownloadGuide(orderIds) {
  const guide = document.createElement('div');
  guide.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border: 3px solid #f59e0b;
    border-radius: 12px;
    padding: 30px;
    z-index: 999999;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    max-width: 500px;
  `;
  
  guide.innerHTML = `
    <h2 style="color: #d97706; margin: 0 0 20px 0;">📥 請手動下載 PDF</h2>
    
    <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0 0 15px 0;"><strong>訂單編號：</strong>${orderIds.join(', ')}</p>
      <ol style="margin: 0; padding-left: 20px; line-height: 1.8;">
        <li>按 <kbd style="background: #fed7aa; padding: 2px 6px; border-radius: 3px;">Ctrl+S</kbd> (Windows) 或 <kbd style="background: #fed7aa; padding: 2px 6px; border-radius: 3px;">Cmd+S</kbd> (Mac)</li>
        <li>選擇儲存位置並記住檔案名稱</li>
        <li>下載完成後，到 <strong>出貨明細頁面</strong></li>
        <li>使用「上傳嘉里大榮 PDF」功能</li>
      </ol>
    </div>
    
    <button onclick="window.location.href='https://bvshop-manage.bvshop.tw/order_print'" style="
      width: 100%;
      padding: 12px;
      background: #f59e0b;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      margin-bottom: 10px;
    ">前往出貨明細頁面</button>
    
    <button onclick="this.remove()" style="
      width: 100%;
      padding: 10px;
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      cursor: pointer;
    ">關閉</button>
  `;
  
  document.body.appendChild(guide);
}

// === 超商取貨頁面處理 ===
async function handleShippingPage() {
  console.log('開始處理超商取貨頁面');
  
  // 等待頁面完全載入
  await waitForPageLoad();
  
  // 自動點擊列印相關按鈕
  autoClickPrintButtons();
  
  // 擷取物流單
  setTimeout(() => {
    captureShippingInfo();
  }, 2000);
}

// === 等待頁面載入 ===
function waitForPageLoad() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      resolve();
    } else {
      window.addEventListener('load', resolve);
    }
  });
}

// === 自動點擊列印按鈕 ===
function autoClickPrintButtons() {
  // 7-11 的 button
  const buttons = document.querySelectorAll('button');
  buttons.forEach(button => {
    if (button.textContent.includes('列印') || button.textContent.includes('Print')) {
      console.log('找到列印按鈕，自動點擊');
      button.click();
    }
  });
  
  // 全家的列印連結
  const links = document.querySelectorAll('a');
  links.forEach(link => {
    if (link.href && link.href.includes('print')) {
      console.log('找到列印連結:', link.href);
      window.open(link.href, '_blank');
    }
  });
}

// === 擷取物流單資訊 ===
async function captureShippingInfo() {
  console.log('開始擷取物流單...');
  
  try {
    // 檢查是否為列印頁面
    const isPrintPage = window.location.href.includes('print') || 
                       document.querySelector('.print-content, #printArea, .PrintArea');
    
    if (!isPrintPage) {
      console.log('不是列印頁面，等待列印視窗開啟...');
      return;
    }
    
    // 偵測超商類型
    const provider = detectProvider();
    console.log('偵測到超商類型:', provider);
    
    // 擷取訂單編號和服務代碼
    const orderInfo = extractOrderInfo(provider);
    console.log('訂單資訊:', orderInfo);
    
    // 擷取物流單HTML
    const shippingHTML = extractShippingHTML(provider);
    
    if (shippingHTML) {
      // 儲存到 Chrome Storage
      const shippingData = {
        html: shippingHTML,
        orderNo: orderInfo.orderNo,
        serviceCode: orderInfo.serviceCode,
        provider: provider,
        timestamp: Date.now()
      };
      
      // 儲存單一物流單
      await chrome.storage.local.set({
        bvTempShipping: shippingData,
        lastProvider: provider
      });
      
      showNotification('物流單擷取成功！', 'success');
      
      // 如果有批次處理，加入到列表
      const result = await chrome.storage.local.get(['bvShippingBatch']);
      const batch = result.bvShippingBatch || [];
      batch.push(shippingData);
      
      await chrome.storage.local.set({
        bvShippingBatch: batch
      });
      
    } else {
      console.error('無法擷取物流單內容');
      showNotification('無法擷取物流單內容', 'error');
    }
    
  } catch (error) {
    console.error('擷取物流單失敗:', error);
    showNotification('擷取失敗: ' + error.message, 'error');
  }
}

// === 偵測超商類型 ===
function detectProvider() {
  const url = window.location.href;
  const domain = window.location.hostname;
  
  if (url.includes('7-11') || domain.includes('7-11')) {
    return '711';
  } else if (url.includes('family') || domain.includes('family')) {
    return 'family';
  } else if (url.includes('hilife')) {
    return 'hilife';
  } else if (url.includes('okmart')) {
    return 'okmart';
  }
  
  // 透過頁面內容判斷
  const bodyText = document.body.innerText;
  if (bodyText.includes('統一超商') || bodyText.includes('7-ELEVEN')) {
    return '711';
  } else if (bodyText.includes('全家便利商店') || bodyText.includes('FamilyMart')) {
    return 'family';
  } else if (bodyText.includes('萊爾富')) {
    return 'hilife';
  } else if (bodyText.includes('OK超商')) {
    return 'okmart';
  }
  
  return 'unknown';
}

// === 擷取訂單資訊 ===
function extractOrderInfo(provider) {
  let orderNo = '';
  let serviceCode = '';
  
  // 嘗試從 URL 參數取得
  const urlParams = new URLSearchParams(window.location.search);
  orderNo = urlParams.get('order_no') || urlParams.get('orderNo') || urlParams.get('orderno') || '';
  
  // 根據不同超商擷取
  switch (provider) {
    case '711':
      // 7-11 訂單編號通常在特定元素中
      const orderElement711 = document.querySelector('.order-no, [class*="order"], [id*="order"]');
      if (orderElement711) {
        orderNo = orderElement711.textContent.replace(/[^\d]/g, '');
      }
      
      // 服務代碼
      const serviceElement711 = document.querySelector('.service-code, [class*="service"]');
      if (serviceElement711) {
        serviceCode = serviceElement711.textContent.trim();
      }
      break;
      
    case 'family':
      // 全家的擷取邏輯
      const orderElementFamily = document.querySelector('[class*="訂單"], [class*="order"]');
      if (orderElementFamily) {
        const match = orderElementFamily.textContent.match(/\d{6,}/);
        if (match) orderNo = match[0];
      }
      break;
      
    case 'hilife':
      // 萊爾富的擷取邏輯
      const orderElementHilife = document.querySelector('.orderno, #orderno');
      if (orderElementHilife) {
        orderNo = orderElementHilife.textContent.trim();
      }
      break;
      
    case 'okmart':
      // OK超商的擷取邏輯
      const orderElementOK = document.querySelector('[id*="order"], [class*="order"]');
      if (orderElementOK) {
        orderNo = orderElementOK.textContent.replace(/\D/g, '');
      }
      break;
  }
  
  // 如果還是找不到，嘗試用正則表達式
  if (!orderNo) {
    const bodyText = document.body.innerText;
    const orderMatch = bodyText.match(/訂單編號[：:]\s*(\d+)/);
    if (orderMatch) {
      orderNo = orderMatch[1];
    }
  }
  
  return { orderNo, serviceCode };
}

// === 擷取物流單 HTML ===
function extractShippingHTML(provider) {
  let container = null;
  
  // 尋找列印區域
  const printSelectors = [
    '.print-area',
    '#printArea',
    '.PrintArea',
    '[class*="print"]',
    '.content',
    'table',
    'body'
  ];
  
  for (const selector of printSelectors) {
    container = document.querySelector(selector);
    if (container && container.innerHTML.trim()) {
      break;
    }
  }
  
  if (!container) {
    console.error('找不到列印區域');
    return null;
  }
  
  // 清理 HTML
  const clonedContainer = container.cloneNode(true);
  
  // 移除不需要的元素
  const removeSelectors = [
    'script',
    'style',
    'button',
    '.no-print',
    '[class*="no-print"]',
    '.hidden',
    'input[type="button"]'
  ];
  
  removeSelectors.forEach(selector => {
    clonedContainer.querySelectorAll(selector).forEach(el => el.remove());
  });
  
  // 處理圖片路徑
  clonedContainer.querySelectorAll('img').forEach(img => {
    if (img.src && !img.src.startsWith('data:') && !img.src.startsWith('http')) {
      img.src = new URL(img.src, window.location.href).href;
    }
  });
  
  return clonedContainer.innerHTML;
}

// === 明細頁面 UI 初始化 ===
async function initializeUI() {
  console.log('初始化明細頁面 UI...');
  
  // 等待頁面載入
  await waitForPageLoad();
  
  // 建立出貨助手面板
  createShippingAssistantPanel();
  
  // 檢查是否有待處理的嘉里大榮訂單
  await checkPendingKTJOrders();
  
  // 載入已儲存的資料
  loadSavedData();
  
  // 初始化事件監聽
  initializeEventListeners();
  
  console.log('UI 初始化完成');
}

// === 檢查待處理的嘉里大榮訂單 ===
async function checkPendingKTJOrders() {
  const { ktjPendingOrders, ktjTimestamp } = await chrome.storage.local.get(['ktjPendingOrders', 'ktjTimestamp']);
  
  if (ktjPendingOrders && ktjTimestamp) {
    // 檢查是否在 30 分鐘內
    const timeDiff = Date.now() - ktjTimestamp;
    if (timeDiff < 30 * 60 * 1000) {
      // 顯示 PDF 上傳區域
      const ktjSection = document.getElementById('bv-ktj-pdf-section');
      if (ktjSection) {
        ktjSection.style.display = 'block';
        
        // 自動展開區域
        const content = document.getElementById('bv-ktj-pdf-content');
        if (content) {
          content.classList.remove('collapsed');
        }
        
        showNotification(`有 ${ktjPendingOrders.length} 張嘉里大榮物流單待處理，請上傳 PDF 檔案`, 'info');
      }
    }
  }
}

// === 建立出貨助手面板 ===
function createShippingAssistantPanel() {
  // 檢查是否已存在
  if (document.getElementById('bv-assistant-panel')) {
    console.log('面板已存在');
    return;
  }
  
  // 建立面板容器
  const panel = document.createElement('div');
  panel.id = 'bv-assistant-panel';
  panel.className = 'bv-assistant-panel';
  
  // 面板 HTML
  panel.innerHTML = `
    <div class="bv-panel-header">
      <h3>
        <span class="material-icons">local_shipping</span>
        BV SHOP 出貨助手
      </h3>
      <button class="bv-close-button" onclick="this.closest('#bv-assistant-panel').remove()">
        <span class="material-icons">close</span>
      </button>
    </div>
    
    <div class="bv-panel-content">
      <!-- 狀態顯示 -->
      <div class="bv-status-section">
        <div class="bv-status-item">
          <span class="bv-status-label">物流單：</span>
          <span id="bv-shipping-count" class="bv-status-value">0</span> 張
        </div>
        <div class="bv-status-item">
          <span class="bv-status-label">明細：</span>
          <span id="bv-detail-count" class="bv-status-value">0</span> 張
        </div>
      </div>
      
      <!-- 快速操作 -->
      <div class="bv-quick-actions">
        <button class="bv-action-button" id="bv-load-data">
          <span class="material-icons">refresh</span>
          <span>重新載入</span>
        </button>
        <button class="bv-action-button" id="bv-start-print">
          <span class="material-icons">print</span>
          <span>開始列印</span>
        </button>
      </div>
      
      <!-- 嘉里大榮 PDF 上傳區域 -->
      ${createKTJPDFUploader()}
      
      <!-- 設定區域 -->
      <div class="bv-section">
        <div class="bv-section-header" onclick="toggleSection('settings')">
          <h4>
            <span class="material-icons bv-section-icon">settings</span>
            列印設定
          </h4>
          <span class="material-icons bv-section-toggle">expand_more</span>
        </div>
        
        <div class="bv-section-content collapsed" id="bv-settings-content">
          <div class="bv-setting-item">
            <label class="bv-checkbox-container">
              <input type="checkbox" id="bv-show-order-number" ${currentSettings?.showOrderNumber ? 'checked' : ''}>
              <span class="bv-checkbox-label">顯示訂單編號標籤</span>
            </label>
          </div>
          
          <div class="bv-setting-item">
            <label class="bv-checkbox-container">
              <input type="checkbox" id="bv-show-detail-first" ${currentSettings?.showDetailFirst ? 'checked' : ''}>
              <span class="bv-checkbox-label">明細在前，物流單在後</span>
            </label>
          </div>
          
          <div class="bv-setting-item">
            <label class="bv-input-label">
              訂單標籤位置 (mm)：
              <input type="number" id="bv-label-top" class="bv-input-small" 
                     value="${currentSettings?.orderLabelTop || 10}" min="0" max="50">
            </label>
          </div>
          
          <div class="bv-setting-item">
            <label class="bv-input-label">
              訂單標籤大小 (px)：
              <input type="number" id="bv-label-size" class="bv-input-small" 
                     value="${currentSettings?.orderLabelSize || 14}" min="10" max="30">
            </label>
          </div>
          
          <button class="bv-save-button" id="bv-save-settings">
            <span class="material-icons">save</span>
            儲存設定
          </button>
        </div>
      </div>
      
      <!-- 訂單對應表 -->
      <div class="bv-section">
        <div class="bv-section-header" onclick="toggleSection('mapping')">
          <h4>
            <span class="material-icons bv-section-icon">link</span>
            訂單對應
          </h4>
          <span class="material-icons bv-section-toggle">expand_more</span>
        </div>
        
        <div class="bv-section-content collapsed" id="bv-mapping-content">
          <div id="bv-order-mapping-list">
            <!-- 動態載入 -->
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 加入頁面
  document.body.appendChild(panel);
  
  // 初始化功能
  initPanelFunctions();
  initKTJPDFUploader();
}

// === 建立嘉里大榮 PDF 上傳區域 ===
function createKTJPDFUploader() {
  return `
    <div id="bv-ktj-pdf-section" class="bv-section" style="display: none;">
      <div class="bv-section-header" onclick="toggleSection('ktj-pdf')">
        <h4>
          <span class="material-icons bv-section-icon">picture_as_pdf</span>
          嘉里大榮 PDF 處理
        </h4>
        <span class="material-icons bv-section-toggle">expand_more</span>
      </div>
      
      <div class="bv-section-content" id="bv-ktj-pdf-content">
        <div class="bv-control-group">
          <div class="bv-control-group-title">上傳嘉里大榮 PDF</div>
          
          <div id="bv-ktj-upload-area" class="bv-logo-upload-area" style="cursor: pointer;">
            <span class="material-icons" style="font-size: 48px; color: #9ca3af;">upload_file</span>
            <p class="bv-upload-hint">點擊上傳嘉里大榮 PDF 檔案</p>
            <p style="font-size: 12px; color: #9ca3af; margin-top: 5px;">支援多頁 PDF 自動分割</p>
          </div>
          
          <input type="file" id="bv-ktj-pdf-input" accept=".pdf,application/pdf" style="display: none;">
          
          <div id="bv-ktj-pdf-preview" style="display: none; margin-top: 20px;">
            <div id="bv-ktj-pdf-status" style="
              background: #e0f2fe;
              border: 1px solid #0284c7;
              border-radius: 6px;
              padding: 15px;
              margin-bottom: 15px;
            ">
              <p style="margin: 0; color: #0c4a6e;">處理中...</p>
            </div>
            <div id="bv-ktj-pdf-pages"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// === 初始化嘉里大榮 PDF 上傳功能 ===
function initKTJPDFUploader() {
  const uploadArea = document.getElementById('bv-ktj-upload-area');
  const fileInput = document.getElementById('bv-ktj-pdf-input');
  
  if (!uploadArea || !fileInput) return;
  
  // 點擊上傳區域
  uploadArea.addEventListener('click', () => fileInput.click());
  
  // 處理檔案選擇
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') {
      showNotification('請選擇 PDF 檔案', 'error');
      return;
    }
    
    await processPDFFile(file);
  });
  
  // 拖放支援
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#3b82f6';
    uploadArea.style.background = '#eff6ff';
  });
  
  uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#d4d7dd';
    uploadArea.style.background = 'linear-gradient(135deg, #fafbff 0%, #f5f6ff 100%)';
  });
  
  uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#d4d7dd';
    uploadArea.style.background = 'linear-gradient(135deg, #fafbff 0%, #f5f6ff 100%)';
    
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      await processPDFFile(file);
    }
  });
}

// === 處理 PDF 檔案 ===
async function processPDFFile(file) {
  const preview = document.getElementById('bv-ktj-pdf-preview');
  const status = document.getElementById('bv-ktj-pdf-status');
  const pagesContainer = document.getElementById('bv-ktj-pdf-pages');
  
  preview.style.display = 'block';
  status.innerHTML = '<p style="margin: 0; color: #0c4a6e;">正在載入 PDF.js...</p>';
  
  try {
    // 動態載入 PDF.js
    await loadPDFJS();
    
    status.innerHTML = '<p style="margin: 0; color: #0c4a6e;">正在處理 PDF...</p>';
    
    // 讀取 PDF
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    status.innerHTML = `<p style="margin: 0; color: #0c4a6e;">找到 ${pdf.numPages} 頁，正在轉換...</p>`;
    
    // 取得待處理的訂單編號
    const { ktjPendingOrders } = await chrome.storage.local.get(['ktjPendingOrders']);
    const orderIds = ktjPendingOrders || [];
    
    // 清空容器
    pagesContainer.innerHTML = '';
    
    // 儲存所有頁面資料
    const shippingData = [];
    
    // 處理每一頁
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });
      
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({ 
        canvasContext: canvas.getContext('2d'), 
        viewport 
      }).promise;
      
      // 轉換為圖片
      const imageData = canvas.toDataURL('image/png', 0.95);
      
      // 顯示預覽
      const pageDiv = document.createElement('div');
      pageDiv.style.cssText = 'margin-bottom: 20px; border: 1px solid #e5e7eb; padding: 10px; border-radius: 6px;';
      pageDiv.innerHTML = `
        <p style="margin: 0 0 10px 0; font-weight: bold;">第 ${pageNum} 頁 - 訂單：${orderIds[pageNum-1] || `自動編號-${pageNum}`}</p>
        <img src="${imageData}" style="width: 100%; max-width: 300px; border: 1px solid #e5e7eb;">
      `;
      pagesContainer.appendChild(pageDiv);
      
      // 建立物流單資料
      const orderId = orderIds[pageNum-1] || `KTJ-AUTO-${Date.now()}-${pageNum}`;
      shippingData.push({
        html: `<div class="bv-shipping-wrapper" style="width:100%;height:100%;position:relative;">
                <img src="${imageData}" style="width:100%;height:auto;display:block;">
              </div>`,
        orderNo: orderId,
        serviceCode: `KTJ${orderId}`,
        width: '105mm',
        height: '148mm',
        index: pageNum - 1,
        provider: 'ktj',
        isImage: true,
        imageData: imageData
      });
    }
    
    // 儲存資料
    await chrome.storage.local.set({
      bvShippingData: shippingData,
      lastProvider: 'ktj',
      timestamp: Date.now()
    });
    
    status.style.background = '#d1fae5';
    status.style.borderColor = '#10b981';
    status.innerHTML = `
      <p style="margin: 0; color: #065f46; font-weight: bold;">
        ✅ 成功處理 ${pdf.numPages} 頁物流單！
      </p>
    `;
    
    // 顯示列印按鈕
    const printBtn = document.createElement('button');
    printBtn.className = 'bv-action-button';
    printBtn.style.marginTop = '20px';
    printBtn.innerHTML = `
      <span class="material-icons">print</span>
      <span>列印物流單與明細</span>
    `;
    printBtn.onclick = () => startPrinting();
    pagesContainer.appendChild(printBtn);
    
    // 更新狀態顯示
    updateStatusDisplay();
    
    showNotification(`成功處理 ${pdf.numPages} 頁嘉里大榮物流單！`, 'success');
    
  } catch (error) {
    console.error('PDF 處理錯誤:', error);
    status.style.background = '#fee2e2';
    status.style.borderColor = '#ef4444';
    status.innerHTML = `<p style="margin: 0; color: #991b1b;">錯誤：${error.message}</p>`;
    showNotification('PDF 處理失敗: ' + error.message, 'error');
  }
}

// === 動態載入 PDF.js ===
async function loadPDFJS() {
  if (window.pdfjsLib) return;
  
  return new Promise((resolve, reject) => {
    // 方法 1：使用外部腳本載入
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.3.93/build/pdf.min.mjs';
    
    const workerScript = document.createElement('script');
    workerScript.textContent = `
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.3.93/build/pdf.worker.min.mjs';
    `;
    
    script.onload = () => {
      // 設定 worker
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.3.93/build/pdf.worker.min.mjs';
        resolve();
      } else {
        reject(new Error('PDF.js 載入失敗'));
      }
    };
    
    script.onerror = () => reject(new Error('無法載入 PDF.js'));
    document.head.appendChild(script);
  });
}
// === 初始化面板功能 ===
function initPanelFunctions() {
  // 載入資料按鈕
  document.getElementById('bv-load-data')?.addEventListener('click', loadSavedData);
  
  // 開始列印按鈕
  document.getElementById('bv-start-print')?.addEventListener('click', startPrinting);
  
  // 儲存設定按鈕
  document.getElementById('bv-save-settings')?.addEventListener('click', saveSettings);
  
  // 設定變更監聽
  document.getElementById('bv-show-order-number')?.addEventListener('change', (e) => {
    currentSettings.showOrderNumber = e.target.checked;
  });
  
  document.getElementById('bv-show-detail-first')?.addEventListener('change', (e) => {
    currentSettings.showDetailFirst = e.target.checked;
  });
  
  document.getElementById('bv-label-top')?.addEventListener('input', (e) => {
    currentSettings.orderLabelTop = parseInt(e.target.value) || 10;
  });
  
  document.getElementById('bv-label-size')?.addEventListener('input', (e) => {
    currentSettings.orderLabelSize = parseInt(e.target.value) || 14;
  });
}

// === 載入已儲存的資料 ===
async function loadSavedData() {
  console.log('載入已儲存的資料...');
  
  try {
    const result = await chrome.storage.local.get(['bvShippingData', 'bvOrderMapping']);
    
    // 更新物流單資料
    if (result.bvShippingData) {
      const shippingCount = result.bvShippingData.length;
      document.getElementById('bv-shipping-count').textContent = shippingCount;
      console.log(`載入了 ${shippingCount} 張物流單`);
    }
    
    // 更新訂單對應
    if (result.bvOrderMapping) {
      updateOrderMappingDisplay(result.bvOrderMapping);
    }
    
    // 更新明細數量
    updateDetailCount();
    
    showNotification('資料載入完成', 'success');
    
  } catch (error) {
    console.error('載入資料失敗:', error);
    showNotification('載入失敗: ' + error.message, 'error');
  }
}

// === 更新狀態顯示 ===
async function updateStatusDisplay() {
  const result = await chrome.storage.local.get(['bvShippingData']);
  if (result.bvShippingData) {
    document.getElementById('bv-shipping-count').textContent = result.bvShippingData.length;
  }
  updateDetailCount();
}

// === 更新明細數量 ===
function updateDetailCount() {
  // 計算頁面上的明細數量
  const detailElements = document.querySelectorAll('.order-print-item, .print-item, [class*="order-detail"]');
  document.getElementById('bv-detail-count').textContent = detailElements.length;
}

// === 更新訂單對應顯示 ===
function updateOrderMappingDisplay(mapping) {
  const container = document.getElementById('bv-order-mapping-list');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!mapping || Object.keys(mapping).length === 0) {
    container.innerHTML = '<p class="bv-empty-message">尚無訂單對應資料</p>';
    return;
  }
  
  Object.entries(mapping).forEach(([serviceCode, orderNo]) => {
    const item = document.createElement('div');
    item.className = 'bv-mapping-item';
    item.innerHTML = `
      <span class="bv-mapping-service">${serviceCode}</span>
      <span class="material-icons">arrow_forward</span>
      <span class="bv-mapping-order">${orderNo}</span>
    `;
    container.appendChild(item);
  });
}

// === 開始列印 ===
async function startPrinting() {
  console.log('開始列印流程...');
  
  try {
    // 載入設定和資料
    const result = await chrome.storage.local.get(['bvShippingData', 'bvSettings']);
    const shippingData = result.bvShippingData || [];
    const settings = result.bvSettings || currentSettings;
    
    if (shippingData.length === 0) {
      showNotification('沒有可列印的物流單', 'warning');
      return;
    }
    
    // 建立列印預覽
    createPrintPreview(shippingData, settings);
    
  } catch (error) {
    console.error('列印失敗:', error);
    showNotification('列印失敗: ' + error.message, 'error');
  }
}

// === 建立列印預覽 ===
function createPrintPreview(shippingData, settings) {
  console.log('建立列印預覽...');
  
  // 隱藏原始內容
  document.body.style.display = 'none';
  
  // 建立列印容器
  const printContainer = document.createElement('div');
  printContainer.id = 'bv-print-container';
  printContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: white;
    z-index: 999999;
    overflow: auto;
  `;
  
  // 建立控制面板
  const controls = document.createElement('div');
  controls.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #f3f4f6;
    border-bottom: 2px solid #e5e7eb;
    padding: 15px 20px;
    z-index: 1000000;
    display: flex;
    align-items: center;
    gap: 15px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  `;
  
  controls.innerHTML = `
    <h3 style="margin: 0; flex: 1;">列印預覽</h3>
    <button onclick="window.print()" style="
      background: #3b82f6;
      color: white;
      border: none;
      padding: 8px 20px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
    ">
      <span class="material-icons">print</span>
      列印
    </button>
    <button onclick="document.getElementById('bv-print-container').remove(); document.body.style.display = '';" style="
      background: #ef4444;
      color: white;
      border: none;
      padding: 8px 20px;
      border-radius: 6px;
      cursor: pointer;
    ">
      關閉
    </button>
  `;
  
  // 建立內容區域
  const content = document.createElement('div');
  content.style.cssText = `
    margin-top: 80px;
    padding: 20px;
  `;
  
  // 產生列印內容
  const printHTML = generatePrintContent(shippingData, settings);
  content.innerHTML = printHTML;
  
  // 組合並顯示
  printContainer.appendChild(controls);
  printContainer.appendChild(content);
  document.body.appendChild(printContainer);
  
  // 載入列印樣式
  loadPrintStyles();
}

// === 產生列印內容 ===
function generatePrintContent(shippingData, settings) {
  console.log('產生列印內容，設定:', settings);
  
  let html = '<div class="bv-print-pages">';
  
  // 取得明細元素
  const detailElements = Array.from(document.querySelectorAll('.order-print-item, .print-item, [class*="order-detail"]'));
  console.log(`找到 ${detailElements.length} 個明細，${shippingData.length} 個物流單`);
  
  // 根據設定決定順序
  if (settings.showDetailFirst) {
    // 明細在前
    detailElements.forEach((detail, index) => {
      html += generateDetailPage(detail, index, settings);
    });
    
    shippingData.forEach((data, index) => {
      const customOrderNo = settings.orderMapping?.[data.serviceCode] || data.orderNo;
      html += generateShippingPage(data, settings, customOrderNo);
    });
  } else {
    // 物流單在前
    shippingData.forEach((data, index) => {
      const customOrderNo = settings.orderMapping?.[data.serviceCode] || data.orderNo;
      html += generateShippingPage(data, settings, customOrderNo);
    });
    
    detailElements.forEach((detail, index) => {
      html += generateDetailPage(detail, index, settings);
    });
  }
  
  html += '</div>';
  return html;
}

// === 產生物流單頁面 ===
function generateShippingPage(data, settings, customOrderNo) {
  if (!data) return '';
  
  const displayOrderNo = customOrderNo || data.orderNo;
  
  // 如果是嘉里大榮的圖片資料，特殊處理
  if (data.provider === 'ktj' && data.isImage) {
    return `
      <div class="bv-print-page bv-shipping-page">
        <div class="bv-shipping-content" style="
          width: 100mm;
          height: 150mm;
          position: relative;
          overflow: hidden;
          background: white;
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        ">
          ${data.html}
          
          <!-- 訂單編號標籤（可選） -->
          ${settings.showOrderNumber && displayOrderNo ? `
            <div style="
              position: absolute;
              top: ${settings.orderLabelTop}mm;
              left: 50%;
              transform: translateX(-50%);
              background: rgba(255,255,255,0.9);
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
      </div>
    `;
  }
  
  // 其他超商的處理
  const provider = data.provider || detectProviderFromHTML(data.html) || 'default';
  
  const layoutSettings = settings.shipping?.currentProviderSettings || 
                        settings.shipping?.providerSettings?.[provider] || {
    scale: 100,
    offsetX: 0,
    offsetY: 0,
    padding: 0
  };
  
  return `
    <div class="bv-print-page bv-shipping-page">
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
        ${settings.shipping?.logo ? `
          <img src="${settings.shipping.logo}" 
               class="bv-watermark-logo"
               style="
                 position: absolute;
                 top: ${settings.shipping.logoY}%;
                 left: ${settings.shipping.logoX}%;
                 transform: translate(-50%, -50%);
                 width: ${settings.shipping.logoSize}mm;
                 opacity: ${settings.shipping.logoOpacity / 100};
                 pointer-events: none;
                 z-index: 1;
               ">
        ` : ''}
        
        <!-- 物流單內容 -->
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
    </div>
  `;
}

// === 產生明細頁面 ===
function generateDetailPage(detailElement, index, settings) {
  if (!detailElement) return '';
  
  const cloned = detailElement.cloneNode(true);
  
  // 處理樣式
  cloned.style.pageBreakAfter = 'always';
  cloned.style.pageBreakInside = 'avoid';
  
  return `
    <div class="bv-print-page bv-detail-page">
      ${cloned.outerHTML}
    </div>
  `;
}

// === 載入列印樣式 ===
function loadPrintStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @media print {
      #bv-print-container > div:first-child {
        display: none !important;
      }
      
      .bv-print-page {
        page-break-after: always;
        page-break-inside: avoid;
        margin: 0;
        padding: 0;
      }
      
      .bv-shipping-page {
        width: 100mm;
        height: 150mm;
      }
      
      @page {
        margin: 0;
        size: 100mm 150mm;
      }
    }
    
    @media screen {
      .bv-print-pages {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        justify-content: center;
      }
      
      .bv-print-page {
        border: 1px solid #e5e7eb;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        background: white;
      }
      
      .bv-shipping-page {
        width: 100mm;
        height: 150mm;
      }
    }
  `;
  
  document.head.appendChild(style);
}

// === 儲存設定 ===
async function saveSettings() {
  try {
    await chrome.storage.local.set({
      bvSettings: currentSettings
    });
    
    showNotification('設定已儲存', 'success');
  } catch (error) {
    console.error('儲存設定失敗:', error);
    showNotification('儲存失敗: ' + error.message, 'error');
  }
}

// === 工具函數 ===

// 切換區段展開/收合
window.toggleSection = function(sectionId) {
  const content = document.getElementById(`bv-${sectionId}-content`);
  const toggle = content.previousElementSibling.querySelector('.bv-section-toggle');
  
  if (content.classList.contains('collapsed')) {
    content.classList.remove('collapsed');
    toggle.textContent = 'expand_less';
  } else {
    content.classList.add('collapsed');
    toggle.textContent = 'expand_more';
  }
};

// 從 HTML 偵測超商類型
function detectProviderFromHTML(html) {
  if (!html) return 'default';
  
  const lowerHTML = html.toLowerCase();
  
  if (lowerHTML.includes('7-11') || lowerHTML.includes('7-eleven') || lowerHTML.includes('統一超商')) {
    return '711';
  } else if (lowerHTML.includes('全家') || lowerHTML.includes('family')) {
    return 'family';
  } else if (lowerHTML.includes('萊爾富') || lowerHTML.includes('hi-life')) {
    return 'hilife';
  } else if (lowerHTML.includes('ok超商') || lowerHTML.includes('okmart')) {
    return 'okmart';
  }
  
  return 'default';
}

// 顯示通知
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `bv-notification bv-notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 1000000;
    animation: slideIn 0.3s ease-out;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  
  // 根據類型設定顏色
  const colors = {
    info: '#3b82f6',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444'
  };
  
  notification.style.background = colors[type] || colors.info;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // 3秒後自動移除
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// === 事件監聽器 ===
function initializeEventListeners() {
  // 監聽來自 background 的訊息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'getPageDimensions':
        sendResponse({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight
        });
        break;
        
      case 'scrollTo':
        window.scrollTo(0, request.position);
        sendResponse({ success: true });
        break;
        
      case 'togglePanel':
        const panel = document.getElementById('bv-assistant-panel');
        if (panel) {
          panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
        break;
    }
    return true;
  });
}

// === CSS 動畫 ===
const style = document.createElement('style');
style.textContent = `
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
`;
document.head.appendChild(style);

console.log('Content Script 初始化完成');
// === 續接 content.js ===

// === 偵測頁面載入完成 ===
function waitForPageLoad() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (document.readyState === 'complete') {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // 最多等待 10 秒
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 10000);
    }
  });
}

// === 建立除錯面板 ===
function createDebugPanel() {
  const debugPanel = document.createElement('div');
  debugPanel.id = 'bv-debug-panel';
  debugPanel.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 15px;
    border-radius: 8px;
    font-family: monospace;
    font-size: 12px;
    z-index: 999999;
    max-width: 400px;
    display: none;
  `;
  
  debugPanel.innerHTML = `
    <div style="margin-bottom: 10px; font-weight: bold;">🐛 BV Debug Panel</div>
    <div id="bv-debug-content"></div>
    <button onclick="this.parentElement.remove()" style="
      margin-top: 10px;
      padding: 5px 10px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    ">關閉</button>
  `;
  
  document.body.appendChild(debugPanel);
  
  // 建立全域除錯物件
  window.bvDebug = {
    log: (message, data) => {
      const content = document.getElementById('bv-debug-content');
      if (content) {
        const entry = document.createElement('div');
        entry.style.marginBottom = '5px';
        entry.innerHTML = `<strong>${new Date().toLocaleTimeString()}:</strong> ${message}`;
        if (data) {
          entry.innerHTML += `<pre style="margin: 5px 0; overflow-x: auto;">${JSON.stringify(data, null, 2)}</pre>`;
        }
        content.appendChild(entry);
        
        // 保持最新的 10 條記錄
        while (content.children.length > 10) {
          content.removeChild(content.firstChild);
        }
      }
    },
    
    show: () => {
      const panel = document.getElementById('bv-debug-panel');
      if (panel) panel.style.display = 'block';
    },
    
    hide: () => {
      const panel = document.getElementById('bv-debug-panel');
      if (panel) panel.style.display = 'none';
    },
    
    // 測試功能
    test: {
      // 測試 PDF 載入
      loadPDF: async () => {
        try {
          await loadPDFJS();
          console.log('PDF.js 載入成功:', window.pdfjsLib);
          return true;
        } catch (error) {
          console.error('PDF.js 載入失敗:', error);
          return false;
        }
      },
      
      // 測試儲存資料
      saveTestData: async () => {
        const testData = [{
          html: '<div style="border: 2px solid red; padding: 20px;">測試物流單</div>',
          orderNo: 'TEST-001',
          serviceCode: 'TEST-SERVICE-001',
          provider: 'test',
          timestamp: Date.now()
        }];
        
        await chrome.storage.local.set({
          bvShippingData: testData,
          lastProvider: 'test'
        });
        
        console.log('測試資料已儲存');
        return true;
      },
      
      // 清除所有資料
      clearAllData: async () => {
        await chrome.storage.local.clear();
        console.log('所有資料已清除');
        return true;
      }
    }
  };
  
  // 除錯模式下自動顯示
  if (localStorage.getItem('bvDebugMode') === 'true') {
    window.bvDebug.show();
  }
}

// === 批次處理功能 ===
class BatchProcessor {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.currentIndex = 0;
  }
  
  // 加入批次任務
  addToQueue(task) {
    this.queue.push(task);
    window.bvDebug?.log('加入批次任務', { queueLength: this.queue.length });
  }
  
  // 開始處理
  async start() {
    if (this.isProcessing) {
      console.log('批次處理已在進行中');
      return;
    }
    
    this.isProcessing = true;
    this.currentIndex = 0;
    
    showNotification(`開始批次處理 ${this.queue.length} 個任務`, 'info');
    
    for (let i = 0; i < this.queue.length; i++) {
      this.currentIndex = i;
      const task = this.queue[i];
      
      try {
        await this.processTask(task);
        window.bvDebug?.log(`任務 ${i + 1}/${this.queue.length} 完成`);
      } catch (error) {
        console.error(`任務 ${i + 1} 失敗:`, error);
        window.bvDebug?.log(`任務 ${i + 1} 失敗`, error);
      }
      
      // 延遲避免太快
      if (i < this.queue.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    this.isProcessing = false;
    this.queue = [];
    showNotification('批次處理完成', 'success');
  }
  
  // 處理單一任務
  async processTask(task) {
    switch (task.type) {
      case 'captureShipping':
        await captureShippingInfo();
        break;
        
      case 'printDetail':
        await printDetail(task.data);
        break;
        
      default:
        console.warn('未知的任務類型:', task.type);
    }
  }
  
  // 取得進度
  getProgress() {
    return {
      current: this.currentIndex + 1,
      total: this.queue.length,
      percentage: Math.round((this.currentIndex + 1) / this.queue.length * 100)
    };
  }
}

// 建立全域批次處理器
const batchProcessor = new BatchProcessor();

// === 鍵盤快捷鍵 ===
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Shift + B: 顯示/隱藏助手面板
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
      e.preventDefault();
      const panel = document.getElementById('bv-assistant-panel');
      if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      }
    }
    
    // Ctrl/Cmd + Shift + D: 開啟除錯模式
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      if (window.bvDebug) {
        window.bvDebug.show();
        localStorage.setItem('bvDebugMode', 'true');
      }
    }
    
    // Ctrl/Cmd + P: 快速列印
    if ((e.ctrlKey || e.metaKey) && e.key === 'p' && document.getElementById('bv-assistant-panel')) {
      e.preventDefault();
      startPrinting();
    }
  });
}

// === 自動備份功能 ===
async function autoBackup() {
  try {
    const data = await chrome.storage.local.get(null);
    const backup = {
      timestamp: new Date().toISOString(),
      version: chrome.runtime.getManifest().version,
      data: data
    };
    
    // 儲存備份
    const backupKey = `bvBackup_${Date.now()}`;
    await chrome.storage.local.set({ [backupKey]: backup });
    
    // 保留最近 5 個備份
    const allKeys = await chrome.storage.local.get(null);
    const backupKeys = Object.keys(allKeys).filter(key => key.startsWith('bvBackup_'));
    
    if (backupKeys.length > 5) {
      backupKeys.sort();
      const keysToRemove = backupKeys.slice(0, backupKeys.length - 5);
      await chrome.storage.local.remove(keysToRemove);
    }
    
    console.log('自動備份完成');
  } catch (error) {
    console.error('自動備份失敗:', error);
  }
}

// === 效能監控 ===
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      captureTime: [],
      processTime: [],
      renderTime: []
    };
  }
  
  startTimer(name) {
    this[`${name}Start`] = performance.now();
  }
  
  endTimer(name) {
    const endTime = performance.now();
    const duration = endTime - this[`${name}Start`];
    
    if (!this.metrics[name]) {
      this.metrics[name] = [];
    }
    
    this.metrics[name].push(duration);
    
    // 保留最近 10 筆記錄
    if (this.metrics[name].length > 10) {
      this.metrics[name].shift();
    }
    
    return duration;
  }
  
  getAverageTime(name) {
    const times = this.metrics[name];
    if (!times || times.length === 0) return 0;
    
    const sum = times.reduce((a, b) => a + b, 0);
    return sum / times.length;
  }
  
  getReport() {
    const report = {};
    for (const [name, times] of Object.entries(this.metrics)) {
      if (times.length > 0) {
        report[name] = {
          average: this.getAverageTime(name).toFixed(2) + 'ms',
          last: times[times.length - 1].toFixed(2) + 'ms',
          count: times.length
        };
      }
    }
    return report;
  }
}

const performanceMonitor = new PerformanceMonitor();

// === 錯誤處理 ===
window.addEventListener('error', (event) => {
  console.error('全域錯誤:', event.error);
  window.bvDebug?.log('錯誤', {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    error: event.error?.stack
  });
});

// === 資源清理 ===
function cleanup() {
  console.log('執行資源清理...');
  
  // 移除事件監聽器
  document.removeEventListener('keydown', initKeyboardShortcuts);
  
  // 清理計時器
  if (window.bvTimers) {
    window.bvTimers.forEach(timer => clearTimeout(timer));
  }
  
  // 清理 DOM 元素
  const elements = [
    '#bv-assistant-panel',
    '#bv-print-container',
    '#bv-debug-panel',
    '.bv-notification'
  ];
  
  elements.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => el.remove());
  });
}

// === 頁面卸載時清理 ===
window.addEventListener('beforeunload', cleanup);

// === 初始化完成 ===
(async function completeInit() {
  try {
    // 建立除錯面板
    createDebugPanel();
    
    // 初始化鍵盤快捷鍵
    initKeyboardShortcuts();
    
    // 執行自動備份
    if (Math.random() < 0.1) { // 10% 機率執行備份
      autoBackup();
    }
    
    // 記錄初始化完成
    console.log('BV SHOP 出貨助手完全初始化完成');
    window.bvDebug?.log('初始化完成', {
      url: window.location.href,
      version: chrome.runtime.getManifest().version
    });
    
  } catch (error) {
    console.error('初始化過程發生錯誤:', error);
    window.bvDebug?.log('初始化錯誤', error);
  }
})();

// === 匯出全域功能 ===
window.BVShopAssistant = {
  version: chrome.runtime.getManifest().version,
  debug: window.bvDebug,
  batch: batchProcessor,
  performance: performanceMonitor,
  
  // 公開 API
  api: {
    loadData: loadSavedData,
    startPrint: startPrinting,
    saveSettings: saveSettings,
    showNotification: showNotification,
    processPDF: processPDFFile
  },
  
  // 工具函數
  utils: {
    detectProvider: detectProvider,
    extractOrderInfo: extractOrderInfo,
    waitForPageLoad: waitForPageLoad
  }
};

console.log('BV SHOP 出貨助手載入完成！使用 window.BVShopAssistant 存取功能。');
// === 續接 content.js 最後部分 ===

// === 注入腳本功能 ===
async function injectScript() {
  // 檢查是否已經注入
  if (document.querySelector('script[data-bv-inject]')) {
    console.log('腳本已經注入');
    return;
  }
  
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.setAttribute('data-bv-inject', 'true');
  (document.head || document.documentElement).appendChild(script);
  
  console.log('已注入腳本');
}

// === 訊息通道管理 ===
class MessageChannel {
  constructor() {
    this.handlers = new Map();
    this.pendingRequests = new Map();
    this.requestId = 0;
    
    // 監聽來自頁面的訊息
    window.addEventListener('message', this.handleMessage.bind(this));
    
    // 監聽來自背景腳本的訊息
    if (chrome.runtime) {
      chrome.runtime.onMessage.addListener(this.handleChromeMessage.bind(this));
    }
  }
  
  // 註冊訊息處理器
  on(type, handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type).push(handler);
  }
  
  // 發送訊息到頁面
  sendToPage(type, data) {
    window.postMessage({
      source: 'bv-content',
      type: type,
      data: data,
      id: ++this.requestId
    }, '*');
    
    return new Promise((resolve) => {
      this.pendingRequests.set(this.requestId, resolve);
      
      // 超時處理
      setTimeout(() => {
        if (this.pendingRequests.has(this.requestId)) {
          this.pendingRequests.delete(this.requestId);
          resolve({ success: false, error: 'Timeout' });
        }
      }, 10000);
    });
  }
  
  // 處理來自頁面的訊息
  handleMessage(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'bv-inject') return;
    
    const { type, data, id } = event.data;
    
    // 處理回應
    if (id && this.pendingRequests.has(id)) {
      const resolve = this.pendingRequests.get(id);
      this.pendingRequests.delete(id);
      resolve(data);
      return;
    }
    
    // 處理事件
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error('訊息處理器錯誤:', error);
        }
      });
    }
  }
  
  // 處理來自 Chrome 的訊息
  handleChromeMessage(request, sender, sendResponse) {
    const handlers = this.handlers.get(request.action);
    if (handlers) {
      const promises = handlers.map(handler => {
        try {
          return Promise.resolve(handler(request, sender));
        } catch (error) {
          console.error('Chrome 訊息處理器錯誤:', error);
          return Promise.reject(error);
        }
      });
      
      Promise.all(promises).then(results => {
        sendResponse(results[0]); // 返回第一個結果
      }).catch(error => {
        sendResponse({ error: error.message });
      });
      
      return true; // 保持連線開啟
    }
  }
}

// 建立訊息通道
const messageChannel = new MessageChannel();

// === 資料同步管理 ===
class DataSync {
  constructor() {
    this.lastSync = 0;
    this.syncInterval = 30000; // 30 秒
    this.syncTimer = null;
  }
  
  // 開始自動同步
  startAutoSync() {
    this.syncTimer = setInterval(() => {
      this.sync();
    }, this.syncInterval);
  }
  
  // 停止自動同步
  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
  
  // 執行同步
  async sync() {
    try {
      const now = Date.now();
      if (now - this.lastSync < 5000) { // 避免太頻繁
        return;
      }
      
      this.lastSync = now;
      
      // 同步設定
      const localSettings = await chrome.storage.local.get(['bvSettings']);
      const syncSettings = await chrome.storage.sync.get(['bvSettings']);
      
      // 比較時間戳，使用較新的
      if (localSettings.bvSettings?.lastModified > (syncSettings.bvSettings?.lastModified || 0)) {
        await chrome.storage.sync.set({ bvSettings: localSettings.bvSettings });
        console.log('設定已同步到雲端');
      } else if (syncSettings.bvSettings?.lastModified > (localSettings.bvSettings?.lastModified || 0)) {
        await chrome.storage.local.set({ bvSettings: syncSettings.bvSettings });
        currentSettings = syncSettings.bvSettings;
        console.log('從雲端同步設定');
      }
      
    } catch (error) {
      console.error('同步失敗:', error);
    }
  }
}

const dataSync = new DataSync();

// === 列印佇列管理 ===
class PrintQueue {
  constructor() {
    this.queue = [];
    this.isPrinting = false;
    this.currentJob = null;
  }
  
  // 加入列印工作
  add(job) {
    this.queue.push({
      id: Date.now(),
      ...job,
      status: 'pending'
    });
    
    if (!this.isPrinting) {
      this.processNext();
    }
  }
  
  // 處理下一個列印工作
  async processNext() {
    if (this.queue.length === 0) {
      this.isPrinting = false;
      return;
    }
    
    this.isPrinting = true;
    this.currentJob = this.queue.shift();
    this.currentJob.status = 'printing';
    
    try {
      await this.print(this.currentJob);
      this.currentJob.status = 'completed';
    } catch (error) {
      console.error('列印失敗:', error);
      this.currentJob.status = 'failed';
      this.currentJob.error = error.message;
    }
    
    // 處理下一個
    setTimeout(() => this.processNext(), 1000);
  }
  
  // 執行列印
  async print(job) {
    console.log('執行列印:', job);
    
    // 建立列印內容
    const printContent = this.generatePrintContent(job);
    
    // 建立列印視窗
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // 等待載入完成
    await new Promise(resolve => {
      printWindow.onload = resolve;
      setTimeout(resolve, 2000); // 最多等待 2 秒
    });
    
    // 觸發列印
    printWindow.print();
    
    // 關閉視窗（可選）
    if (job.autoClose) {
      setTimeout(() => printWindow.close(), 3000);
    }
  }
  
  // 產生列印內容
  generatePrintContent(job) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${job.title || '列印'}</title>
        <style>
          @page { 
            size: ${job.pageSize || 'A4'}; 
            margin: ${job.margin || '0'};
          }
          body { 
            margin: 0; 
            padding: 0;
            font-family: Arial, sans-serif;
          }
          ${job.styles || ''}
        </style>
      </head>
      <body>
        ${job.content}
      </body>
      </html>
    `;
  }
  
  // 取得佇列狀態
  getStatus() {
    return {
      isPrinting: this.isPrinting,
      currentJob: this.currentJob,
      queueLength: this.queue.length,
      queue: this.queue
    };
  }
  
  // 清空佇列
  clear() {
    this.queue = [];
    this.currentJob = null;
    this.isPrinting = false;
  }
}

const printQueue = new PrintQueue();

// === 本地快取管理 ===
class LocalCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 50; // 最大快取項目數
    this.ttl = 3600000; // 預設 TTL: 1 小時
  }
  
  // 設定快取
  set(key, value, ttl = this.ttl) {
    const expireAt = Date.now() + ttl;
    this.cache.set(key, {
      value: value,
      expireAt: expireAt
    });
    
    // 清理過期項目
    this.cleanup();
    
    // 限制大小
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
  
  // 取得快取
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expireAt) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  // 清理過期項目
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expireAt) {
        this.cache.delete(key);
      }
    }
  }
  
  // 清空快取
  clear() {
    this.cache.clear();
  }
}

const localCache = new LocalCache();

// === 擴充功能更新檢查 ===
async function checkForUpdates() {
  try {
    const manifest = chrome.runtime.getManifest();
    const currentVersion = manifest.version;
    
    // 檢查是否有新版本（這裡可以連接到你的更新伺服器）
    // 範例：const latestVersion = await fetch('https://your-update-server.com/version').then(r => r.text());
    
    const lastUpdateCheck = await chrome.storage.local.get(['lastUpdateCheck']);
    const now = Date.now();
    
    // 每天檢查一次
    if (!lastUpdateCheck.lastUpdateCheck || now - lastUpdateCheck.lastUpdateCheck > 86400000) {
      await chrome.storage.local.set({ lastUpdateCheck: now });
      console.log('已檢查更新，目前版本:', currentVersion);
    }
    
  } catch (error) {
    console.error('檢查更新失敗:', error);
  }
}

// === 最終初始化 ===
async function finalizeInitialization() {
  try {
    // 註冊訊息處理器
    messageChannel.on('BV_SETTINGS_UPDATED', (data) => {
      currentSettings = data;
      console.log('設定已更新:', currentSettings);
    });
    
    messageChannel.on('BV_PRINT_REQUEST', (data) => {
      printQueue.add(data);
    });
    
    // 開始資料同步
    dataSync.startAutoSync();
    
    // 檢查更新
    checkForUpdates();
    
    // 設定定期清理
    setInterval(() => {
      localCache.cleanup();
      performanceMonitor.metrics = {}; // 重置效能指標
    }, 3600000); // 每小時清理一次
    
    console.log('===================================');
    console.log('BV SHOP 出貨助手 v' + chrome.runtime.getManifest().version);
    console.log('初始化完成時間:', new Date().toLocaleString('zh-TW'));
    console.log('目前頁面:', window.location.href);
    console.log('===================================');
    
    // 發送初始化完成訊息
    if (chrome.runtime) {
      chrome.runtime.sendMessage({
        action: 'contentScriptInitialized',
        url: window.location.href,
        timestamp: Date.now()
      });
    }
    
  } catch (error) {
    console.error('最終初始化失敗:', error);
  }
}

// 執行最終初始化
finalizeInitialization();

// === END OF CONTENT.JS ===
