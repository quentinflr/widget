(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  
  const SCRIPT_TAG = document.currentScript;
  const PRODUCT_ID = SCRIPT_TAG.getAttribute('data-product');
  const API_BASE = 'https://mysellkit.com/version-test/api/1.1/wf';
  const CHECKOUT_BASE = 'https://mysellkit.com/version-test';
  
  let widgetConfig = null;
  let popupShown = false;
  let floatingShown = false;
  let sessionId = null;
  
  // Check debug mode from multiple sources
  const urlParams = new URLSearchParams(window.location.search);
  const DEBUG_MODE = urlParams.get('debug') === 'true' || 
                     urlParams.get('mysellkit_test') === 'true' ||
                     SCRIPT_TAG.getAttribute('data-debug') === 'true';
  
  if (DEBUG_MODE) {
    console.log('🔧 MySellKit DEBUG MODE ENABLED');
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================
  
  function getSessionId() {
    if (sessionId) return sessionId;
    
    sessionId = sessionStorage.getItem('mysellkit_session');
    
    if (!sessionId) {
      sessionId = 'msk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('mysellkit_session', sessionId);
    }
    
    if (DEBUG_MODE) {
      console.log('🔑 Session ID:', sessionId);
    }
    
    return sessionId;
  }

  // ============================================
  // CHECK IF WIDGET SHOULD SHOW
  // ============================================
  
  function shouldShowWidget() {
    // Debug mode: toujours montrer
    if (DEBUG_MODE) {
      console.log('✅ Debug mode: Widget will show');
      return true;
    }
    
    const lastSeen = localStorage.getItem(`mysellkit_seen_${PRODUCT_ID}`);
    if (lastSeen && Date.now() - lastSeen < 86400000) {
      console.log('❌ Widget already seen in last 24h');
      return false;
    }
    
    return true;
  }

  // ============================================
  // SMART COLORS CALCULATION
  // ============================================
  
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
  
  function getLuminance(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0.5;
    
    return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  }
  
  function getSmartTextColors(backgroundColor) {
    const luminance = getLuminance(backgroundColor);
    
    // Si background clair → texte foncé
    if (luminance > 0.5) {
      return {
        primary: '#1F2937',
        secondary: '#4B5563',
        tertiary: '#9CA3AF'
      };
    }
    // Si background foncé → texte clair
    else {
      return {
        primary: '#F9FAFB',
        secondary: '#E5E7EB',
        tertiary: '#9CA3AF'
      };
    }
  }
  
  function getContrastColor(hexColor) {
    const luminance = getLuminance(hexColor);
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  }
  
  function generateAccentBackground(baseColor) {
    if (baseColor === '#FFFFFF' || baseColor === '#ffffff') return '#F7F7F7';
    if (baseColor === '#000000' || baseColor === '#000000') return '#1F2937';
    
    // Simple fallback: slightly darker/lighter version
    const luminance = getLuminance(baseColor);
    return luminance > 0.5 ? '#F7F7F7' : '#1F2937';
  }

  // ============================================
  // FETCH WIDGET CONFIG
  // ============================================
  
  async function fetchWidgetConfig() {
    try {
      if (DEBUG_MODE) {
        console.log('📡 Fetching config for product:', PRODUCT_ID);
      }
      
      const response = await fetch(`${API_BASE}/get-widget-config?product_id=${PRODUCT_ID}`);
      const data = await response.json();
      
      if (DEBUG_MODE) {
        console.log('📦 Config received:', data);
      }
      
      if (data.response && data.response.success === 'yes') {
        // Fix protocol-relative URLs
        if (data.response.image && data.response.image.startsWith('//')) {
          data.response.image = 'https:' + data.response.image;
        }
        
        // Set defaults for optional fields
        data.response.primary_color = data.response.primary_color || '#00D66F';
        data.response.background_left = data.response.background_left || '#FFFFFF';
        data.response.background_right = data.response.background_right || '#F7F7F7';
        data.response.cta_text = data.response.cta_text || 'Get Instant Access';
        
        return data.response;
      } else {
        console.error('MySellKit: Invalid product ID');
        return null;
      }
    } catch (error) {
      console.error('MySellKit: Failed to fetch config', error);
      return null;
    }
  }

  // ============================================
  // TRACK EVENTS
  // ============================================
  
  async function trackEvent(eventType) {
    try {
      if (DEBUG_MODE) {
        console.log('📊 Tracking event:', eventType);
      }
      
      await fetch(`${API_BASE}/track-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: PRODUCT_ID,
          event_type: eventType,
          session_id: getSessionId(),
          timestamp: Date.now(),
          page_url: window.location.href,
          user_agent: navigator.userAgent
        })
      });
      
      if (DEBUG_MODE) {
        console.log('✅ Event tracked:', eventType);
      }
    } catch (error) {
      console.error('MySellKit: Failed to track event', error);
    }
  }

  // ============================================
  // GET FILE ICON
  // ============================================
  
  function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
      'pdf': '📄',
      'doc': '📝',
      'docx': '📝',
      'txt': '📝',
      'zip': '🗜️',
      'mp4': '🎥',
      'mov': '🎥',
      'avi': '🎥',
      'mp3': '🎵',
      'wav': '🎵',
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'png': '🖼️',
      'gif': '🖼️',
      'svg': '🎨',
      'kml': '🗺️',
      'kmz': '🗺️',
      'xls': '📊',
      'xlsx': '📊',
      'csv': '📊'
    };
    
    return iconMap[ext] || '📦';
  }

  // ============================================
  // INJECT CSS
  // ============================================
  
  function injectCSS(config) {
    const textColors = getSmartTextColors(config.background_left);
    const ctaTextColor = getContrastColor(config.primary_color);
    
    const style = document.createElement('style');
    style.textContent = `
      /* MySellKit Widget Styles */
      * {
        box-sizing: border-box;
      }
      
      .mysellkit-overlay {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        z-index: 999999;
        align-items: center;
        justify-content: center;
        animation: mysellkit-fadeIn 0.3s ease;
      }
      
      .mysellkit-overlay.visible {
        display: flex;
      }
      
      @keyframes mysellkit-slideUp {
        from {
          opacity: 0;
          transform: translateY(30px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      @keyframes mysellkit-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes mysellkit-floatSlideIn {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      .mysellkit-popup {
        width: 900px;
        max-width: 900px;
        height: 600px;
        background: white;
        border-radius: 24px;
        overflow: hidden;
        display: flex;
        box-shadow: 0 25px 70px rgba(0, 0, 0, 0.35);
        position: relative;
        animation: mysellkit-slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      
      .mysellkit-close {
        position: absolute;
        top: 20px;
        right: 20px;
        width: 32px;
        height: 32px;
        background: rgba(0, 0, 0, 0.06);
        border: none;
        border-radius: 50%;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        z-index: 100;
        color: #4B5563;
      }
      
      .mysellkit-close:hover {
        background: rgba(0, 0, 0, 0.12);
        transform: scale(1.1);
        color: #1F2937;
      }
      
      .mysellkit-left {
        width: 450px;
        height: 600px;
        background: ${config.background_left};
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      
      .mysellkit-top {
        display: flex;
        flex-direction: column;
      }
      
      .mysellkit-image-wrapper {
        position: relative;
        width: 402px;
        height: 301px;
        margin-bottom: 12px;
      }
      
      .mysellkit-image {
        width: 100%;
        height: 100%;
        border-radius: 12px;
        object-fit: cover;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
        transition: transform 0.3s ease;
      }
      
      .mysellkit-image:hover {
        transform: scale(1.02);
      }
      
      .mysellkit-title {
        width: 402px;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 600;
        font-size: 24px;
        line-height: 1.3;
        color: ${textColors.primary};
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        max-height: 62px;
        min-height: 62px;
      }
      
      .mysellkit-price-container {
        display: flex;
        align-items: baseline;
        gap: 12px;
        margin-top: auto;
      }
      
      .mysellkit-price-current {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 500;
        font-size: 28px;
        color: ${textColors.primary};
        letter-spacing: -0.02em;
      }
      
      .mysellkit-price-old {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 400;
        font-size: 22px;
        color: ${textColors.tertiary};
        text-decoration: line-through;
        opacity: 0.8;
      }
      
      .mysellkit-bottom {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      
      .mysellkit-cta {
        width: 100%;
        height: 54px;
        background: ${config.primary_color};
        border: none;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        position: relative;
        overflow: hidden;
      }
      
      .mysellkit-cta::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 100%);
        pointer-events: none;
      }
      
      .mysellkit-cta:hover {
        filter: brightness(0.95);
        transform: translateY(-2px);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
      }
      
      .mysellkit-cta:active {
        transform: translateY(0);
      }
      
      .mysellkit-cta-text {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 600;
        font-size: 15px;
        color: ${ctaTextColor};
        letter-spacing: -0.01em;
      }
      
      .mysellkit-cta-arrow {
        font-size: 16px;
        color: ${ctaTextColor};
        transition: transform 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .mysellkit-cta:hover .mysellkit-cta-arrow {
        transform: translateX(3px);
      }
      
      .mysellkit-spinner {
        animation: mysellkit-spin 1s linear infinite;
      }
      
      @keyframes mysellkit-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      
      .mysellkit-powered {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-size: 12px;
        color: ${textColors.tertiary};
        text-align: center;
        font-weight: 400;
      }
      
      .mysellkit-powered a {
        color: ${textColors.tertiary};
        text-decoration: none;
        font-weight: 600;
        transition: color 0.2s ease;
      }
      
      .mysellkit-powered a:hover {
        color: ${config.primary_color};
      }
      
      .mysellkit-right {
        width: 450px;
        height: 600px;
        background: ${config.background_right};
        padding: 24px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 28px;
      }
      
      .mysellkit-description {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 400;
        font-size: 15px;
        line-height: 1.65;
        color: ${textColors.secondary};
        letter-spacing: 0.01em;
      }
      
      .mysellkit-description p {
        margin-bottom: 16px;
      }
      
      .mysellkit-description ul {
        list-style: none;
        padding: 0;
        margin-bottom: 16px;
      }
      
      .mysellkit-description li {
        margin-bottom: 8px;
      }
      
      .mysellkit-description strong {
        color: ${textColors.primary};
        font-weight: 600;
      }
      
      .mysellkit-divider {
        border: none;
        height: 1px;
        background: rgba(0, 0, 0, 0.06);
        margin: 4px 0;
      }
      
      .mysellkit-included {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      
      .mysellkit-included-title {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 600;
        font-size: 16px;
        color: ${textColors.primary};
        margin-bottom: 4px;
      }
      
      .mysellkit-included-items {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .mysellkit-included-item {
        height: 54px;
        background: ${getLuminance(config.background_right) > 0.5 ? '#FFFFFF' : '#2D3748'};
        border-radius: 10px;
        padding: 10px;
        display: flex;
        align-items: center;
        gap: 12px;
        transition: all 0.2s ease;
        border: 1px solid rgba(0, 0, 0, 0.04);
      }
      
      .mysellkit-included-item:hover {
        background: ${getLuminance(config.background_right) > 0.5 ? '#FAFAFA' : '#374151'};
        transform: translateX(4px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        border-color: ${config.primary_color}33;
      }
      
      .mysellkit-file-icon {
        width: 34px;
        height: 34px;
        background: linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%);
        border-radius: 7px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
        transition: transform 0.2s ease;
      }
      
      .mysellkit-included-item:hover .mysellkit-file-icon {
        transform: scale(1.1);
      }
      
      .mysellkit-file-name {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 500;
        font-size: 14px;
        color: ${textColors.secondary};
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .mysellkit-right::-webkit-scrollbar {
        width: 6px;
      }
      
      .mysellkit-right::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.02);
      }
      
      .mysellkit-right::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.15);
        border-radius: 3px;
      }
      
      .mysellkit-right::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.25);
      }
      
      .mysellkit-mobile-content {
        display: none;
      }
      
      /* Floating Widget */
      .mysellkit-floating-widget {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        background: white;
        border-radius: 16px;
        padding: 14px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08);
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 999998;
        display: none;
        animation: mysellkit-floatSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      
      .mysellkit-floating-widget.visible {
        display: block;
      }
      
      .mysellkit-floating-widget:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16), 0 4px 8px rgba(0, 0, 0, 0.1);
      }
      
      .mysellkit-float-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      .mysellkit-float-image {
        width: 64px;
        height: 64px;
        border-radius: 10px;
        object-fit: cover;
        flex-shrink: 0;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      
      .mysellkit-float-info {
        flex: 1;
        min-width: 0;
      }
      
      .mysellkit-float-title {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 600;
        font-size: 14px;
        line-height: 1.4;
        color: #1F2937;
        margin-bottom: 6px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        max-height: 39px;
      }
      
      .mysellkit-float-price {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        font-weight: 500;
        font-size: 18px;
        color: #1F2937;
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      
      .mysellkit-float-price-old {
        font-size: 14px;
        color: #9CA3AF;
        text-decoration: line-through;
        font-weight: 400;
      }
      
      .mysellkit-debug-badge {
        position: fixed;
        bottom: 10px;
        left: 10px;
        background: #ff6b6b;
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: bold;
        z-index: 9999999;
        font-family: monospace;
      }
      
      /* Mobile Responsive */
      @media (max-width: 768px) {
        .mysellkit-overlay {
          align-items: flex-end;
          padding: 0;
        }
        
        .mysellkit-popup {
          width: 100%;
          max-width: 100%;
          height: 100vh;
          max-height: 100vh;
          border-radius: 0;
          flex-direction: column;
        }
        
        .mysellkit-close {
          top: 16px;
          right: 16px;
          background: rgba(0, 0, 0, 0.1);
          backdrop-filter: blur(10px);
        }
        
        .mysellkit-left {
          width: 100%;
          height: 100%;
          padding: 20px 20px 0 20px;
          gap: 0;
          display: block;
          overflow-y: auto;
          padding-bottom: 90px;
        }
        
        .mysellkit-right {
          display: none;
        }
        
        .mysellkit-top {
          margin-bottom: 20px;
        }
        
        .mysellkit-image-wrapper {
          width: 100%;
          height: auto;
          aspect-ratio: 4/3;
          margin-bottom: 16px;
        }
        
        .mysellkit-image {
          width: 100%;
          height: 100%;
        }
        
        .mysellkit-title {
          width: 100%;
          font-size: 22px;
        }
        
        .mysellkit-price-container {
          margin-top: 0;
          margin-bottom: 24px;
          padding-bottom: 24px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }
        
        .mysellkit-mobile-content {
          display: flex;
          flex-direction: column;
          gap: 28px;
          margin-bottom: 24px;
          padding-bottom: 24px;
        }
        
        .mysellkit-bottom {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: white;
          padding: 16px 20px 20px;
          box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          z-index: 50;
          gap: 8px;
        }
        
        .mysellkit-cta {
          height: 52px;
        }
        
        .mysellkit-left::-webkit-scrollbar {
          width: 4px;
        }
        
        .mysellkit-floating-widget {
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          border-radius: 16px 16px 0 0;
          padding: 14px 20px;
          box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.12);
        }
        
        .mysellkit-floating-widget:hover {
          transform: translateY(-2px);
        }
        
        .mysellkit-float-image {
          width: 56px;
          height: 56px;
        }
        
        .mysellkit-float-title {
          font-size: 13px;
        }
        
        .mysellkit-float-price {
          font-size: 15px;
        }
      }
      
      @media (min-width: 769px) and (max-width: 900px) {
        .mysellkit-popup {
          width: 95vw;
        }
        
        .mysellkit-left,
        .mysellkit-right {
          width: 50%;
        }
        
        .mysellkit-image-wrapper,
        .mysellkit-image,
        .mysellkit-title {
          width: 100%;
        }
      }
    `;
    
    document.head.appendChild(style);
    
    if (DEBUG_MODE) {
      const badge = document.createElement('div');
      badge.className = 'mysellkit-debug-badge';
      badge.textContent = '🔧 TEST MODE';
      document.body.appendChild(badge);
    }
  }

  // ============================================
  // CREATE POPUP HTML
  // ============================================
  
  function createPopup(config) {
    if (DEBUG_MODE) {
      console.log('🎨 Creating popup with config:', config);
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'mysellkit-overlay';
    overlay.id = 'mysellkit-widget';
    
    // Price display logic
    const priceHTML = config.show_price === 'yes' ? `
      <div class="mysellkit-price-container">
        <span class="mysellkit-price-current">€${config.price}</span>
        ${config.old_price ? `<span class="mysellkit-price-old">€${config.old_price}</span>` : ''}
      </div>
    ` : '';
    
    // Build included items HTML
    const includedItemsHTML = config.included_items.map(item => `
      <div class="mysellkit-included-item">
        <div class="mysellkit-file-icon">${getFileIcon(item)}</div>
        <span class="mysellkit-file-name">${item}</span>
      </div>
    `).join('');
    
    overlay.innerHTML = `
      <div class="mysellkit-popup">
        <button class="mysellkit-close">×</button>
        
        <div class="mysellkit-left">
          <div class="mysellkit-top">
            <div class="mysellkit-image-wrapper">
              <img src="${config.image}" alt="${config.title}" class="mysellkit-image">
            </div>
            <h2 class="mysellkit-title">${config.title}</h2>
          </div>
          
          ${priceHTML}
          
          <div class="mysellkit-mobile-content">
            <div class="mysellkit-description">
              ${config.description_html}
            </div>
            
            <div class="mysellkit-included">
              <h3 class="mysellkit-included-title">📦 What's Included:</h3>
              <div class="mysellkit-included-items">
                ${includedItemsHTML}
              </div>
            </div>
          </div>
          
          <div class="mysellkit-bottom">
            <button class="mysellkit-cta">
              <span class="mysellkit-cta-text">${config.cta_text}</span>
              <span class="mysellkit-cta-arrow">→</span>
            </button>
            <p class="mysellkit-powered">
              Powered by <a href="https://mysellkit.com" target="_blank">mysellkit</a>
            </p>
          </div>
        </div>
        
        <div class="mysellkit-right">
          <div class="mysellkit-description">
            ${config.description_html}
          </div>
          
          <hr class="mysellkit-divider" />
          
          <div class="mysellkit-included">
            <h3 class="mysellkit-included-title">📦 What's Included:</h3>
            <div class="mysellkit-included-items">
              ${includedItemsHTML}
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    createFloatingWidget(config);
    setupEventListeners(overlay, config);
  }

  // ============================================
  // CREATE FLOATING WIDGET
  // ============================================
  
  function createFloatingWidget(config) {
    const floatingWidget = document.createElement('div');
    floatingWidget.className = 'mysellkit-floating-widget';
    floatingWidget.id = 'mysellkit-floating';
    
    const priceHTML = config.show_price === 'yes' ? `
      <div class="mysellkit-float-price">
        <span>€${config.price}</span>
        ${config.old_price ? `<span class="mysellkit-float-price-old">€${config.old_price}</span>` : ''}
      </div>
    ` : '';
    
    floatingWidget.innerHTML = `
      <div class="mysellkit-float-content">
        <img src="${config.image}" alt="${config.title}" class="mysellkit-float-image">
        <div class="mysellkit-float-info">
          <div class="mysellkit-float-title">${config.title}</div>
          ${priceHTML}
        </div>
      </div>
    `;
    
    document.body.appendChild(floatingWidget);
    
    floatingWidget.addEventListener('click', () => {
      if (DEBUG_MODE) {
        console.log('🔄 Floating widget clicked - reopening popup');
      }
      hideFloatingWidget();
      setTimeout(() => showPopup(), 200);
    });
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================
  
  function setupEventListeners(overlay, config) {
    overlay.querySelector('.mysellkit-close').addEventListener('click', () => {
      if (DEBUG_MODE) {
        console.log('❌ Close button clicked');
      }
      hidePopup();
      setTimeout(() => showFloatingWidget(), 300);
    });
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (DEBUG_MODE) {
          console.log('❌ Overlay clicked (close)');
        }
        hidePopup();
        setTimeout(() => showFloatingWidget(), 300);
      }
    });
    
    overlay.querySelector('.mysellkit-cta').addEventListener('click', async () => {
      if (DEBUG_MODE) {
        console.log('🛒 CTA button clicked');
      }
      
      trackEvent('click');
      
      const button = overlay.querySelector('.mysellkit-cta');
      const buttonText = button.querySelector('.mysellkit-cta-text');
      const buttonArrow = button.querySelector('.mysellkit-cta-arrow');
      const originalText = buttonText.textContent;
      
      // Show loading state with spinner
      buttonText.textContent = originalText;
      buttonArrow.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="mysellkit-spinner">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="30" stroke-dashoffset="0">
            <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="1s" repeatCount="indefinite"/>
          </circle>
        </svg>
      `;
      button.disabled = true;
      
      try {
        const response = await fetch(`${API_BASE}/create-checkout-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            product_id: PRODUCT_ID,
            session_id: getSessionId(),
            success_url: `${CHECKOUT_BASE}/purchase-processing?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: window.location.href
          })
        });
        
        const data = await response.json();
        
        if (DEBUG_MODE) {
          console.log('💳 Checkout session created:', data);
        }
        
        if (data.response && data.response.success === 'yes') {
          if (DEBUG_MODE) {
            console.log('🔗 Redirecting to Stripe:', data.response.checkout_url);
          }
          // Store session ID for potential return
          sessionStorage.setItem('mysellkit_checkout_pending', 'true');
          window.location.href = data.response.checkout_url;
        } else {
          console.error('Failed to create checkout session');
          buttonText.textContent = 'Error - Try again';
          buttonArrow.textContent = '→';
          button.disabled = false;
        }
      } catch (error) {
        console.error('Error creating checkout:', error);
        buttonText.textContent = originalText;
        buttonArrow.textContent = '→';
        button.disabled = false;
      }
    });
    
    // Reset button state if user returns from Stripe
    window.addEventListener('pageshow', function(event) {
      if (event.persisted || sessionStorage.getItem('mysellkit_checkout_pending')) {
        sessionStorage.removeItem('mysellkit_checkout_pending');
        const button = overlay.querySelector('.mysellkit-cta');
        const buttonText = button.querySelector('.mysellkit-cta-text');
        const buttonArrow = button.querySelector('.mysellkit-cta-arrow');
        if (button && buttonText && buttonArrow) {
          buttonText.textContent = config.cta_text;
          buttonArrow.textContent = '→';
          button.disabled = false;
        }
      }
    });
  }

  // ============================================
  // SHOW/HIDE FUNCTIONS
  // ============================================
  
  function showPopup() {
    if (popupShown) {
      if (DEBUG_MODE) {
        console.log('⚠️ Popup already shown');
      }
      return;
    }
    
    if (!shouldShowWidget()) {
      return;
    }
    
    const overlay = document.getElementById('mysellkit-widget');
    if (!overlay) return;
    
    if (DEBUG_MODE) {
      console.log('🎉 Showing popup!');
    }
    
    overlay.classList.add('visible');
    popupShown = true;
    
    trackEvent('impression');
    
    if (!DEBUG_MODE) {
      localStorage.setItem(`mysellkit_seen_${PRODUCT_ID}`, Date.now());
    }
  }
  
  function hidePopup() {
    const overlay = document.getElementById('mysellkit-widget');
    if (!overlay) return;
    
    overlay.classList.remove('visible');
    popupShown = false;
  }
  
  function showFloatingWidget() {
    if (floatingShown) return;
    
    const floating = document.getElementById('mysellkit-floating');
    if (!floating) return;
    
    if (DEBUG_MODE) {
      console.log('🔔 Showing floating widget');
    }
    
    floating.classList.add('visible');
    floatingShown = true;
  }
  
  function hideFloatingWidget() {
    const floating = document.getElementById('mysellkit-floating');
    if (!floating) return;
    
    floating.classList.remove('visible');
    floatingShown = false;
  }

  // ============================================
  // TRIGGERS
  // ============================================
  
  function setupTriggers(config) {
    if (DEBUG_MODE) {
      console.log('⚡ Setting up trigger:', config.trigger_type, 'with value:', config.trigger_value);
    }
    
    switch(config.trigger_type) {
      case 'scroll':
        setupScrollTrigger(config.trigger_value);
        break;
      case 'time':
        setupTimeTrigger(config.trigger_value);
        break;
      case 'exit_intent':
        setupExitTrigger();
        break;
      default:
        if (DEBUG_MODE) {
          console.log('⚠️ Unknown trigger type, defaulting to 5s time trigger');
        }
        setupTimeTrigger(5);
    }
  }
  
  function setupScrollTrigger(percentage) {
    if (DEBUG_MODE) {
      console.log(`📜 Scroll trigger set at ${percentage}%`);
    }
    
    let triggered = false;
    window.addEventListener('scroll', () => {
      if (triggered) return;
      const scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
      
      if (scrollPercent >= percentage) {
        if (DEBUG_MODE) {
          console.log(`✅ Scroll trigger activated at ${scrollPercent.toFixed(0)}%`);
        }
        showPopup();
        triggered = true;
      }
    });
  }
  
  function setupTimeTrigger(seconds) {
    if (DEBUG_MODE) {
      console.log(`⏱️ Time trigger set for ${seconds} seconds`);
    }
    
    setTimeout(() => {
      if (DEBUG_MODE) {
        console.log(`✅ Time trigger activated after ${seconds}s`);
      }
      showPopup();
    }, seconds * 1000);
  }
  
  function setupExitTrigger() {
    if (DEBUG_MODE) {
      console.log('🚪 Exit intent trigger set');
    }
    
    let triggered = false;
    document.addEventListener('mouseleave', (e) => {
      if (triggered) return;
      if (e.clientY > 10) return;
      
      if (DEBUG_MODE) {
        console.log('✅ Exit intent trigger activated');
      }
      showPopup();
      triggered = true;
    });
  }

  // ============================================
  // INIT
  // ============================================
  
  async function init() {
    if (DEBUG_MODE) {
      console.log('🚀 MySellKit Widget initializing...');
    }
    
    if (!PRODUCT_ID) {
      console.error('MySellKit: Missing data-product attribute');
      return;
    }
    
    if (DEBUG_MODE) {
      console.log('📦 Product ID:', PRODUCT_ID);
    }
    
    widgetConfig = await fetchWidgetConfig();
    if (!widgetConfig) {
      console.error('MySellKit: Failed to load widget config');
      return;
    }
    
    injectCSS(widgetConfig);
    createPopup(widgetConfig);
    setupTriggers(widgetConfig);
    
    if (DEBUG_MODE) {
      console.log('✅ MySellKit Widget initialized successfully');
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
