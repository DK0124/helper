// inject.js - 注入 html2canvas 庫
(function() {
  // 動態載入 html2canvas
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  script.onload = function() {
    console.log('html2canvas 載入完成');
    
    // 通知 content script
    window.postMessage({ type: 'HTML2CANVAS_LOADED' }, '*');
  };
  document.head.appendChild(script);
})();
