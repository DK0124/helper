// BV SHOP 出貨助手 - 內容腳本 (完整版 - 支援多種圖片格式)
(function() {
  'use strict';
  
  console.log('BV SHOP 出貨助手已載入');
  
  // 全域變數
  let currentPage = detectCurrentPage();
  let shippingData = [];
  let detailData = [];
  let savedLogos = { shipping: null, detail: null };
  let panelActive = false;
  
  // 偵測當前頁面類型
  function detectCurrentPage() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    
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
    
    // 重新抓取，清空舊資料
    shippingData = [];
    
    if (currentPage.provider === 'seven') {
      console.log('開始抓取 7-11 物流單');
      
      // 優先使用 div_frame 類別
      let frames = document.querySelectorAll('.div_frame');
      
      // 如果沒找到，嘗試其他方式
      if (frames.length === 0) {
        // 找尋包含特定內容的 div
        const allDivs = document.querySelectorAll('div');
        const potentialFrames = [];
        
        allDivs.forEach(div => {
          // 檢查是否包含物流單特徵
          if (div.textContent.includes('交貨便') && 
              div.textContent.includes('統一超商') &&
              (div.querySelector('img[src*="QRCode"]') || div.querySelector('img[src*="qrcode"]'))) {
            
            // 找到最接近的包含容器
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
          // 檢查內容是否足夠（避免抓到空框）
          if (frame.textContent.trim().length < 100) {
            console.log('跳過空框架:', index);
            return;
          }
          
          // 建立包裝容器以保持原始尺寸
          const wrapper = document.createElement('div');
          wrapper.style.cssText = `
            width: 300px; 
            height: 450px; 
            margin: 0 auto; 
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
          `;
          
          const clone = frame.cloneNode(true);
          
          // 處理所有圖片，確保 URL 完整
          const images = clone.querySelectorAll('img');
          images.forEach(img => {
            // 保留原始 src
            const originalSrc = img.getAttribute('src');
            if (originalSrc && !originalSrc.startsWith('data:') && !originalSrc.startsWith('http')) {
              // 轉換為完整 URL
              img.src = new URL(originalSrc, window.location.href).href;
            }
            
            // 確保圖片屬性
            if (img.hasAttribute('width')) {
              img.style.width = img.getAttribute('width') + 'px';
            }
            if (img.hasAttribute('height')) {
              img.style.height = img.getAttribute('height') + 'px';
            }
          });
          
          wrapper.appendChild(clone);
          
          // 提取訂單編號 - 使用更安全的方式
          let orderNo = '';
          const text = clone.textContent || '';
          
          // 使用更簡單的字串搜尋方式
          if (text.includes('寄件訂單編號')) {
            const startIdx = text.indexOf('寄件訂單編號');
            const subText = text.substring(startIdx);
            const colonIdx = subText.search(/[:：]/);
            if (colonIdx > -1) {
              const afterColon = subText.substring(colonIdx + 1).trim();
              const numberMatch = afterColon.match(/^(\d+)/);
              if (numberMatch) {
                orderNo = numberMatch[1];
              }
            }
          } else if (text.includes('訂單編號')) {
            const startIdx = text.indexOf('訂單編號');
            const subText = text.substring(startIdx);
            const colonIdx = subText.search(/[:：]/);
            if (colonIdx > -1) {
              const afterColon = subText.substring(colonIdx + 1).trim();
              const numberMatch = afterColon.match(/^(\d+)/);
              if (numberMatch) {
                orderNo = numberMatch[1];
              }
            }
          }
          
          console.log(`物流單 ${index + 1} - 訂單編號: ${orderNo || '未找到'}`);
          
          shippingData.push({
            html: wrapper.outerHTML,
            orderNo: orderNo,
            index: index
          });
        } catch (error) {
          console.error(`處理物流單 ${index + 1} 時發生錯誤:`, error);
        }
      });
    }
    
    // 儲存資料
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
                <div id="bv-shipping-upload-
