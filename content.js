// BV SHOP 出貨助手 - 內容腳本 (完整版 - 支援物流編號比對)
(function() {
  'use strict';
  
  console.log('BV SHOP 出貨助手已載入');
  
  // 全域變數（提前定義）
  let currentPage = detectCurrentPage();
  let shippingData = [];
  let detailData = [];
  let savedLogos = { shipping: null, detail: null };
  let panelActive = false;
  
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
    // BV SHOP 後台
    else if (hostname.includes('bvshop')) {
      if (pathname.includes('order')) {
        return { type: 'detail', provider: 'bvshop' };
      }
    }
    
    return { type: 'unknown', provider: null };
  }
  
  // === 物流單頁面專用函數 ===
  
  function injectShippingPanel() {
    if (document.getElementById('bv-shipping-panel')) return;
    
    // 建立浮動面板
    const panel = document.createElement('div');
    panel.id = 'bv-shipping-panel';
    panel.innerHTML = `
      <div class="bv-panel-header">
        <h3>BV SHOP 出貨助手</h3>
        <div class="bv-panel-controls">
          <button class="bv-icon-btn" id="bv-minimize-btn" title="最小化">
            <span style="font-size: 20px; line-height: 1;">－</span>
          </button>
        </div>
      </div>
      
      <div class="bv-panel-body">
        <div class="bv-status-display">
          <div class="bv-status-count" id="bv-count">0</div>
          <div class="bv-status-text">張物流單已抓取</div>
        </div>
        
        <button class="bv-button primary pulse" id="bv-fetch-btn">
          重新抓取物流單
        </button>
        
        <div class="bv-info-text">
          <strong>操作步驟：</strong><br>
          1. 點擊「重新抓取物流單」<br>
          2. 至後台「更多操作」>「列印出貨單」<br>
          3. 點選擴充功能中的「BV SHOP 出貨助手」
        </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    
    // 事件監聽
    document.getElementById('bv-minimize-btn').addEventListener('click', () => {
      panel.classList.toggle('minimized');
    });
    
    document.getElementById('bv-fetch-btn').addEventListener('click', fetchShippingData);
    
    // 更新狀態
    updateShippingPanelStatus();
  }
  
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
  
  function fetchShippingData() {
    const btn = document.getElementById('bv-fetch-btn');
    btn.disabled = true;
    btn.innerHTML = '抓取中...';
    
    shippingData = [];
    
    if (currentPage.provider === 'seven') {
      console.log('開始抓取 7-11 物流單');
      
      let frames = document.querySelectorAll('.div_frame');
      
      if (frames.length === 0) {
        const allDivs = document.querySelectorAll('div');
        const potentialFrames = [];
        
        allDivs.forEach(div => {
          if (div.textContent.includes('交貨便') && 
              div.textContent.includes('統一超商') &&
              (div.querySelector('img[src*="QRCode"]') || div.querySelector('img[src*="qrcode"]'))) {
            
            let container = div;
            while (container.parentElement && 
                   !container.style.border && 
                   !container.className.includes('frame')) {
              container = container.parentElement;
            }
            
            if (!potentialFrames.includes(container)) {
              potentialFrames.push(container);
            }
          }
        });
        
        frames = potentialFrames;
      }
      
      console.log('找到的物流單框架數量:', frames.length);
      
      frames.forEach((frame, index) => {
        try {
          if (frame.textContent.trim().length < 100) {
            console.log('跳過空框架:', index);
            return;
          }
          
          // 直接克隆，不包裝
          const clone = frame.cloneNode(true);
          
          // 處理圖片
          const images = clone.querySelectorAll('img');
          images.forEach(img => {
            const originalSrc = img.getAttribute('src');
            if (originalSrc && !originalSrc.startsWith('data:') && !originalSrc.startsWith('http')) {
              img.src = new URL(originalSrc, window.location.href).href;
            }
          });
          
          // 提取資訊
          let orderNo = '';
          let serviceCode = '';
          const text = clone.textContent || '';
          
          // 提取訂單編號
          const orderMatch = text.match(/(?:寄件)?訂單編號[：:]\s*(\d+)/);
          if (orderMatch) {
            orderNo = orderMatch[1];
          }
          
          // 提取服務代碼
          const serviceCodeElement = clone.querySelector('span[id*="lblC2BPinCode"]');
          if (serviceCodeElement) {
            serviceCode = serviceCodeElement.textContent.trim();
          } else {
            const codeMatch = text.match(/[A-Z]\d{11}/);
            if (codeMatch) {
              serviceCode = codeMatch[0];
            }
          }
          
          console.log(`物流單 ${index + 1} - 訂單編號: ${orderNo || '未找到'}, 服務代碼: ${serviceCode || '未找到'}`);
          
          shippingData.push({
            html: clone.outerHTML,
            orderNo: orderNo,
            serviceCode: serviceCode,
            index: index
          });
        } catch (error) {
          console.error(`處理物流單 ${index + 1} 時發生錯誤:`, error);
        }
      });
    }
    
    saveShippingData();
  }
  function saveShippingData() {
    const btn = document.getElementById('bv-fetch-btn');
    
    try {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ 
          bvShippingData: shippingData,
          lastProvider: currentPage.provider,
          timestamp: Date.now()
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('儲存資料時發生錯誤:', chrome.runtime.lastError);
            btn.disabled = false;
            btn.innerHTML = '重新抓取物流單';
            showNotification('儲存資料失敗，請重試', 'error');
            return;
          }
          
          btn.disabled = false;
          btn.innerHTML = '重新抓取物流單';
          btn.classList.remove('pulse');
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
      btn.disabled = false;
      btn.innerHTML = '重新抓取物流單';
      showNotification('儲存資料失敗，請重新整理頁面後再試', 'error');
    }
  }

  function checkExtensionValid() {
    try {
      if (chrome.runtime && chrome.runtime.id) {
        return true;
      }
    } catch (e) {
      console.error('擴充功能已失效:', e);
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
        `;
        errorMsg.innerHTML = `
          <h3>擴充功能需要重新載入</h3>
          <p>請重新整理頁面 (F5) 或重新啟動瀏覽器</p>
        `;
        document.body.appendChild(errorMsg);
      }
    }
    return false;
  }
  
  // === 明細頁面專用函數 ===
  
  function activateDetailPanel() {
    if (panelActive) return;
    
    // 檢查是否有物流單資料
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['bvShippingData'], (result) => {
        if (!result.bvShippingData || result.bvShippingData.length === 0) {
          showNotification('請先至後台「更多操作」>「列印物流單」依照畫面提示抓取物流單', 'warning');
          return;
        }
        
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
        }, 100);
        
        panelActive = true;
      });
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
            
            <div class="bv-button-group" style="margin-top: 12px;">
              <button class="bv-button secondary" id="bv-clear-data">
                <span class="material-icons">refresh</span>
                清除重抓
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
              <div class="bv-control-group-title">紙張設定（統一）</div>
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
                <span>縮放比例</span>
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
      showNotification('請先至後台「更多操作」>「列印物流單」依照畫面提示抓取物流單', 'warning');
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
      
      // 提取物流編號
      let logTraceId = '';
      const logTraceElement = clone.querySelector('.showLogTraceID');
      if (logTraceElement) {
        const match = logTraceElement.textContent.match(/物流編號[:\s]*([A-Z]\d{11})/);
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
    
    // 初始化所有 range input 的進度條
    document.querySelectorAll('input[type="range"]').forEach(updateRangeProgress);
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
  
  // 修正 generatePages 函數中的配對邏輯
  function generatePages(printOrder, settings) {
    const pages = [];
    let pageOrder = [];
    
    // 根據物流編號建立配對關係
    const pairMap = new Map();
    
    // 建立物流單的映射 (serviceCode -> shippingData)
    const shippingMap = new Map();
    shippingData.forEach(data => {
      if (data.serviceCode) {
        shippingMap.set(data.serviceCode, data);
      }
    });
    
    // 根據列印順序產生頁面順序
    switch (printOrder) {
      case 'paired-sequential': // 物流單-出貨明細（正序）
        detailData.forEach((detail, index) => {
          if (detail.logTraceId && shippingMap.has(detail.logTraceId)) {
            // 找到配對的物流單
            const shipping = shippingMap.get(detail.logTraceId);
            // 使用明細的訂單編號
            pageOrder.push({ type: 'shipping', data: shipping, orderNo: detail.orderNo });
            pageOrder.push({ type: 'detail', data: detail });
          } else {
            // 沒有配對，只印明細
            console.warn(`明細 ${detail.orderNo} 找不到對應的物流單 (物流編號: ${detail.logTraceId})`);
            pageOrder.push({ type: 'detail', data: detail });
          }
        });
        break;
        
      case 'paired-reverse': // 物流單-出貨明細（反序）
        const reversedDetails = [...detailData].reverse();
        reversedDetails.forEach((detail, index) => {
          if (detail.logTraceId && shippingMap.has(detail.logTraceId)) {
            // 找到配對的物流單
            const shipping = shippingMap.get(detail.logTraceId);
            // 使用明細的訂單編號
            pageOrder.push({ type: 'shipping', data: shipping, orderNo: detail.orderNo });
            pageOrder.push({ type: 'detail', data: detail });
          } else {
            // 沒有配對，只印明細
            console.warn(`明細 ${detail.orderNo} 找不到對應的物流單 (物流編號: ${detail.logTraceId})`);
            pageOrder.push({ type: 'detail', data: detail });
          }
        });
        break;
        
      case 'shipping-only': // 純物流單（正序）
        shippingData.forEach(data => {
          pageOrder.push({ type: 'shipping', data: data });
        });
        break;
        
      case 'shipping-only-reverse': // 純物流單（反序）
        [...shippingData].reverse().forEach(data => {
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
    
    // 產生頁面
    pageOrder.forEach(item => {
      const page = document.createElement('div');
      page.className = 'bv-preview-page bv-print-page';
      
      // 使用統一的紙張尺寸
      page.style.width = settings.paper.width + 'mm';
      page.style.height = settings.paper.height + 'mm';
      
      if (item.type === 'shipping') {
        // 傳遞自訂的訂單編號（如果有的話）
        page.innerHTML = generateShippingPage(item.data, settings, item.orderNo);
      } else {
        page.innerHTML = generateDetailPage(item.data, settings);
      }
      
      pages.push(page);
    });
    
    return pages;
  }
  
  function generateShippingPage(data, settings, customOrderNo) {
    if (!data) return '';
    
    const displayOrderNo = customOrderNo || data.orderNo;
    const scale = settings.paper.scale / 100;
    
    return `
      <div class="bv-shipping-content" style="
        width: 100mm;
        height: 150mm;
        position: relative;
        overflow: hidden;
        background: white;
        margin: 0;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <!-- 底圖 -->
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
        
        <!-- 物流單內容 -->
        <div style="
          transform: scale(${scale});
          transform-origin: center center;
          z-index: 2;
          position: relative;
        ">
          ${data.html}
        </div>
        
        <!-- 訂單編號標籤 -->
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
            z-index: 100;
            white-space: nowrap;
            font-family: Arial, sans-serif;
          ">
            訂單編號：${displayOrderNo}
          </div>
        ` : ''}
      </div>
    `;
  }
  
  function generateDetailPage(data, settings) {
    if (!data || !data.orderInfo) return '';
    
    const fields = getFieldSettings();
    const info = data.orderInfo;
    const scale = settings.paper.scale / 100;
    
    // 計算實際可用空間
    const availableWidth = (settings.paper.width - (settings.paper.margin * 2)) / scale;
    
    return `
      <div class="bv-detail-content" style="
        width: ${settings.paper.width}mm;
        height: ${settings.paper.height}mm;
        position: relative;
        overflow: hidden;
        background: white;
        padding: ${settings.paper.margin}mm;
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
          
          ${fields.printRemark && info.printRemark ? `
            <div style="margin-top: 4px; padding: 4px; background: #f5f5f5; font-size: 12px;">
              <strong>列印備註：</strong>${info.printRemark}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
  
  // 同樣修正 generateDetailPage 函數
  function generateDetailPage(data, settings) {
    if (!data || !data.orderInfo) return '';
    
    const fields = getFieldSettings();
    const info = data.orderInfo;
    
    let html = `
      <div class="bv-detail-content" style="
        width: 100mm;
        height: 150mm;
        position: relative;
        overflow: visible;
        padding: ${settings.paper.margin}mm;
        font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif;
        font-size: ${settings.detail.textSize};
        box-sizing: border-box;
        background: white;
        margin: 0;
      ">
        <!-- 底圖（最底層） -->
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
                 -webkit-print-color-adjust: exact;
                 print-color-adjust: exact;
               ">
        ` : ''}
        
        <!-- 明細內容（上層） -->
        <div style="
          transform: scale(${settings.paper.scale / 100});
          transform-origin: top center;
          width: 100%;
          position: relative;
          z-index: 2;
        ">
          <h2 style="text-align: center; margin: 0 0 10px 0; font-size: 20px;">出貨明細</h2>
          
          <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: ${settings.detail.textSize};">
            <div style="flex: 1; padding-right: 10px;">
              <p style="margin: 2px 0;"><strong>訂單編號：</strong>${info.orderNo}</p>
              <p style="margin: 2px 0;"><strong>訂購日期：</strong>${info.orderDate}</p>
              <p style="margin: 2px 0;"><strong>訂購人：</strong>${fields.hideInfo ? maskName(info.customer) : info.customer}</p>
              <p style="margin: 2px 0;"><strong>訂購人帳號：</strong>${info.customerAccount}</p>
              <p style="margin: 2px 0;"><strong>聯絡電話：</strong>${fields.hideInfo ? maskPhone(info.phone) : info.phone}</p>
              ${fields.showLogTraceId && data.logTraceId ? `<p style="margin: 2px 0;"><strong>物流編號：</strong>${data.logTraceId}</p>` : ''}
            </div>
            <div style="flex: 1;">
              <p style="margin: 2px 0;"><strong>付款方式：</strong>${info.paymentMethod}</p>
              <p style="margin: 2px 0;"><strong>送貨方式：</strong>${info.shippingMethod}</p>
              <p style="margin: 2px 0;"><strong>收件人：</strong>${fields.hideInfo ? maskName(info.recipient) : info.recipient}</p>
              <p style="margin: 2px 0;"><strong>收件人電話：</strong>${fields.hideInfo ? maskPhone(info.recipientPhone) : info.recipientPhone}</p>
              <p style="margin: 2px 0;"><strong>送貨地址：</strong>${info.address}</p>
              ${info.storeName ? `<p style="margin: 2px 0;"><strong>門市名稱：</strong>${info.storeName}</p>` : ''}
              ${fields.deliveryTime && info.deliveryTime ? `<p style="margin: 2px 0;"><strong>指定配送時段：</strong>${info.deliveryTime}</p>` : ''}
              ${fields.shippingTime && info.shippingTime ? `<p style="margin: 2px 0;"><strong>預計出貨日：</strong>${info.shippingTime}</p>` : ''}
            </div>
          </div>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: ${settings.detail.textSize};">
            <thead>
              <tr style="border-top: 2px solid black; border-bottom: 2px solid black;">
                <th style="text-align: left; padding: 4px;">品名</th>
                ${!fields.hidePrice ? '<th style="text-align: right; padding: 4px;">單價</th>' : ''}
                <th style="text-align: center; padding: 4px;">數量</th>
                ${!fields.hidePrice ? '<th style="text-align: right; padding: 4px;">小計</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${info.items.map(item => `
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 4px;">
                    ${fields.productImage && item.image ? `<img src="${item.image}" style="width: 30px; height: 30px; object-fit: cover; vertical-align: middle; margin-right: 4px;">` : ''}
                    ${item.name}
                  </td>
                  ${!fields.hidePrice ? `<td style="text-align: right; padding: 4px;">${item.price}</td>` : ''}
                  <td style="text-align: center; padding: 4px;">${item.qty}</td>
                  ${!fields.hidePrice ? `<td style="text-align: right; padding: 4px;">${item.subtotal}</td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          ${!fields.hidePrice ? `
            <table style="width: 100%; border-top: 1px solid black; border-bottom: 1px solid black; margin-top: 10px; font-size: ${settings.detail.textSize};">
              <tr>
                <td style="text-align: right; padding: 4px;">商品總數量：</td>
                <td style="text-align: right; padding: 4px; width: 100px;">${info.totalQty}</td>
              </tr>
              ${info.extraShipping ? `
                <tr>
                  <td style="text-align: right; padding: 4px;">額外運費：</td>
                  <td style="text-align: right; padding: 4px;">${info.extraShipping}</td>
                </tr>
              ` : ''}
              <tr>
                <td style="text-align: right; padding: 4px; font-weight: bold;">總計：</td>
                <td style="text-align: right; padding: 4px; font-weight: bold;">${info.total}</td>
              </tr>
            </table>
          ` : ''}
          
          ${fields.remark && info.remark ? `
            <div style="margin-top: 10px; padding: 6px; background: #f5f5f5; border-radius: 4px;">
              <div style="background: #777; color: white; padding: 2px 6px; display: inline-block; margin-bottom: 4px; font-size: 12px;">顧客備註</div>
              <div style="font-size: ${settings.detail.textSize};">${info.remark}</div>
            </div>
          ` : ''}
          
          ${fields.manageRemark && info.manageRemark ? `
            <div style="margin-top: 6px; padding: 6px; background: #f5f5f5; border-radius: 4px;">
              <div style="background: #777; color: white; padding: 2px 6px; display: inline-block; margin-bottom: 4px; font-size: 12px;">後台備註</div>
              <div style="font-size: ${settings.detail.textSize};">${info.manageRemark}</div>
            </div>
          ` : ''}
          
          ${fields.printRemark && info.printRemark ? `
            <div style="margin-top: 6px; padding: 6px; background: #f5f5f5; border-radius: 4px;">
              <div style="background: #777; color: white; padding: 2px 6px; display: inline-block; margin-bottom: 4px; font-size: 12px;">列印備註</div>
              <div style="font-size: ${settings.detail.textSize};">${info.printRemark}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    
    return html;
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
    
    // 在列印前添加特殊的列印樣式
    const printStyle = document.createElement('style');
    printStyle.id = 'bv-print-override';
    printStyle.textContent = `
      @media print {
        @page {
          size: 100mm 150mm !important;
          margin: 0 !important;
        }
        
        html, body {
          width: 100mm !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
        }
        
        #bv-preview-container {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        
        .bv-preview-page {
          margin: 0 !important;
          padding: 0 !important;
          width: 100mm !important;
          height: 150mm !important;
          page-break-after: always !important;
        }
        
        .bv-preview-page:last-child {
          page-break-after: auto !important;
        }
      }
    `;
    document.head.appendChild(printStyle);
    
    // 執行列印
    setTimeout(() => {
      window.print();
      
      // 列印後移除臨時樣式
      setTimeout(() => {
        const tempStyle = document.getElementById('bv-print-override');
        if (tempStyle) {
          tempStyle.remove();
        }
      }, 1000);
    }, 100);
  }
  
  // 工具函數
  function updateValueDisplay(id) {
    const element = document.getElementById('bv-' + id);
    const valueElement = document.getElementById('bv-' + id + '-value');
    if (element && valueElement) {
      if (id.includes('scale') || id.includes('opacity')) {
        valueElement.textContent = element.value + '%';
      } else if (id.includes('size') || id.includes('margin') || id.includes('width') || id.includes('height') || id.includes('top')) {
        valueElement.textContent = element.value + (id.includes('label-size') ? 'px' : 'mm');
      }
    }
  }
  
  function updateRangeProgress(input) {
    const value = (input.value - input.min) / (input.max - input.min) * 100;
    input.style.setProperty('--value', value + '%');
  }
  
  function getSettings() {
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
        logoOpacity: parseInt(document.getElementById('bv-shipping-logo-opacity')?.value || 20)
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
      chrome.storage.local.get(['bvShippingData', 'bvDetailData'], (result) => {
        if (result.bvShippingData) shippingData = result.bvShippingData;
        if (result.bvDetailData) detailData = result.bvDetailData;
        updateDataStatus();
        if (shippingData.length > 0 || detailData.length > 0) updatePreview();
      });
    }
  }
  
  function updateDataStatus() {
    const shippingCount = document.getElementById('bv-shipping-count');
    const detailCount = document.getElementById('bv-detail-count');
    if (shippingCount) {
      shippingCount.textContent = shippingData.length > 0 ? `已抓取 ${shippingData.length} 張` : '未抓取';
      shippingCount.className = shippingData.length > 0 ? 'bv-status-badge success' : 'bv-status-badge';
    }
    if (detailCount) {
      detailCount.textContent = detailData.length > 0 ? `已抓取 ${detailData.length} 張` : '未抓取';
      detailCount.className = detailData.length > 0 ? 'bv-status-badge success' : 'bv-status-badge';
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
      version: '2.2.0' // 更新版本號以支援物流編號配對
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
  
  // 在初始化前檢查
  if (currentPage.type === 'shipping') {
    // 物流單頁自動顯示面板
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
  } else if (currentPage.type === 'detail') {
    // 明細頁等待使用者啟動
    console.log('BV SHOP 出貨明細頁面已偵測，點擊擴充功能圖示以啟動');
  }
  
})();
