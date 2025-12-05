(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================

  const SCRIPT_TAG = document.currentScript;
  const PRODUCT_ID = SCRIPT_TAG.getAttribute('data-product');
  const API_BASE = 'https://mysellkit.com/version-test/api/1.1/wf';
  const CHECKOUT_BASE = 'https://mysellkit.com/version-test';
  const WIDGET_VERSION = '1.2.4';

  // Display config
  const SHOW_PRICE = SCRIPT_TAG.getAttribute('data-show-price') !== 'no';

  // Colors (with defaults)
  const COLOR_PRIMARY = SCRIPT_TAG.getAttribute('data-color-primary') || '#00D66F';
  const COLOR_LEFT = SCRIPT_TAG.getAttribute('data-color-left') || '#FFFFFF';
  const COLOR_RIGHT = SCRIPT_TAG.getAttribute('data-color-right') || '#F9FAFB';
  const COLOR_TEXT = SCRIPT_TAG.getAttribute('data-color-text') || '#1F2937';
  const COLOR_TEXT_LIGHT = SCRIPT_TAG.getAttribute('data-color-text-light') || '#9CA3AF';
  const COLOR_CTA_TEXT = SCRIPT_TAG.getAttribute('data-color-cta-text') || '#000000';

  // CTA text (from snippet, not API)
  const CTA_TEXT = SCRIPT_TAG.getAttribute('data-cta-text') || 'Get Instant Access';

  let sessionId = null;

  // Check debug mode from multiple sources
  const urlParams = new URLSearchParams(window.location.search);
  const isDemoPage = window.location.hostname.includes('mysellkit.com') &&
                     window.location.pathname.includes('/demo/');
  const DEBUG_MODE = urlParams.get('debug') === 'true' ||
                     urlParams.get('mysellkit_test') === 'true' ||
                     SCRIPT_TAG.getAttribute('data-debug') === 'true' ||
                     isDemoPage;

  if (DEBUG_MODE) {
    console.log(`🔧 MySellKit Product Page DEBUG MODE ENABLED (v${WIDGET_VERSION})`);
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  function getSessionId() {
    if (sessionId) return sessionId;

    // In debug mode, always create new session on page load
    if (DEBUG_MODE) {
      sessionId = 'msk_debug_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      console.log('🔄 Debug mode: New session per page load:', sessionId);
      return sessionId;
    }

    // Check localStorage for existing session (24h expiration)
    const stored = localStorage.getItem('mysellkit_session');
    const storedTime = localStorage.getItem('mysellkit_session_time');

    // If exists and < 24h old → reuse
    if (stored && storedTime && (Date.now() - parseInt(storedTime) < 86400000)) {
      sessionId = stored;
    } else {
      // Create new session
      sessionId = 'msk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('mysellkit_session', sessionId);
      localStorage.setItem('mysellkit_session_time', Date.now().toString());
    }

    return sessionId;
  }

  // ============================================
  // GENERATE PURCHASE TOKEN
  // ============================================

  function generatePurchaseToken() {
    return 'pt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 12);
  }

  // ============================================
  // TOAST NOTIFICATION
  // ============================================

  function showToast(message, type = 'error') {
    let toast = document.getElementById('mysellkit-toast');

    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mysellkit-toast';
      toast.className = 'mysellkit-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = `mysellkit-toast mysellkit-toast-${type} mysellkit-toast-show`;

    // Auto-hide after 5 seconds
    setTimeout(() => {
      toast.classList.remove('mysellkit-toast-show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 5000);
  }

  // ============================================
  // FETCH WIDGET CONFIG
  // ============================================

  async function fetchWidgetConfig(productId) {
    try {
      if (DEBUG_MODE) {
        console.log('📡 Fetching config for product:', productId);
      }

      const response = await fetch(`${API_BASE}/get-widget-config?product_id=${productId}`);
      const data = await response.json();

      if (DEBUG_MODE) {
        console.log('📦 Config received:', data);
      }

      if (data.response && data.response.success === 'yes') {
        // Fix image URL if needed
        if (data.response.image && data.response.image.startsWith('//')) {
          data.response.image = 'https:' + data.response.image;
        }
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

  async function trackEvent(eventType, additionalData = {}) {
    try {
      if (DEBUG_MODE) {
        console.log('📊 Tracking event:', eventType, additionalData);
      }

      await fetch(`${API_BASE}/track-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: PRODUCT_ID,
          session_id: getSessionId(),
          event_type: eventType,
          timestamp: Date.now(),
          page_url: window.location.href,
          user_agent: navigator.userAgent,
          ...additionalData
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
  // RENDER INCLUDED ITEMS
  // ============================================

  function renderIncludedItems(items, includedTitle) {
    if (!items || items.length === 0) return '';

    const title = includedTitle || "📦 What's Included:";

    const itemsHTML = items.map(item => {
      let icon = '📄';
      if (item.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) icon = '🖼️';
      if (item.match(/\.(mp4|mov|avi|webm)$/i)) icon = '🎥';
      if (item.match(/\.(pdf)$/i)) icon = '📄';
      if (item.match(/\.(zip|rar)$/i)) icon = '📦';
      if (item.match(/\.(kml|kmz|gpx)$/i)) icon = '🗺️';

      return `
        <div class="mysellkit-included-item">
          <div class="mysellkit-file-icon">${icon}</div>
          <span class="mysellkit-file-name">${item}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="mysellkit-included">
        <h3 class="mysellkit-included-title">${title}</h3>
        <div class="mysellkit-included-items">
          ${itemsHTML}
        </div>
      </div>
    `;
  }

  // ============================================
  // INJECT CSS
  // ============================================

  function injectCSS() {
    if (!document.getElementById('mysellkit-product-page-styles')) {
      const style = document.createElement('style');
      style.id = 'mysellkit-product-page-styles';
      style.textContent = getCSS();
      document.head.appendChild(style);
    }
  }

  function getCSS() {
    return `
      /* DM Sans Font */
      @font-face {
        font-family: 'DM Sans';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url('https://mysellkit.github.io/widget/fonts/dm-sans-v17-latin-regular.woff2') format('woff2');
      }
      @font-face {
        font-family: 'DM Sans';
        font-style: normal;
        font-weight: 500;
        font-display: swap;
        src: url('https://mysellkit.github.io/widget/fonts/dm-sans-v17-latin-500.woff2') format('woff2');
      }
      @font-face {
        font-family: 'DM Sans';
        font-style: normal;
        font-weight: 600;
        font-display: swap;
        src: url('https://mysellkit.github.io/widget/fonts/dm-sans-v17-latin-600.woff2') format('woff2');
      }

      /* Reset */
      .mysellkit-product-page *,
      .mysellkit-toast * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      /* Toast Notification */
      .mysellkit-toast {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14px;
        font-weight: 500;
        color: #1F2937;
        z-index: 10000000;
        opacity: 0;
        transform: translateY(-20px);
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: none;
        max-width: 350px;
        border-left: 4px solid #EF4444;
      }

      .mysellkit-toast-show {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }

      .mysellkit-toast-error {
        border-left-color: #EF4444;
      }

      .mysellkit-toast-success {
        border-left-color: #00D66F;
      }

      /* Overlay */
      .mysellkit-product-overlay {
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

      .mysellkit-product-overlay.visible {
        display: flex;
      }

      @keyframes mysellkit-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes mysellkit-slideUp {
        from {
          opacity: 0;
          transform: scale(0.98);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      /* Main product page container - FULLSCREEN */
      .mysellkit-product-page {
        width: 100vw;
        height: 100vh !important;
        max-height: 100vh !important;
        background: white;
        overflow: hidden;
        display: flex;
        position: relative;
        animation: mysellkit-slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }

      /* Close button */
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

      /* Left column - 40% width for fullscreen */
      .mysellkit-left {
        width: 40%;
        height: 100vh;
        background: var(--msk-left-bg, #FFFFFF);
        padding: 40px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        overflow-y: auto;
      }

      /* Top element - Image + Title */
      .mysellkit-top {
        display: flex;
        flex-direction: column;
      }

      .mysellkit-image-wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 4/3;
        margin-bottom: 24px;
      }

      .mysellkit-image-wrapper.no-image {
        display: none;
      }

      .mysellkit-image {
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 16px;
        object-fit: cover;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        transition: transform 0.3s ease;
      }

      .mysellkit-image:hover {
        transform: scale(1.02);
      }

      .mysellkit-title {
        width: 100%;
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 600;
        font-size: 32px;
        line-height: 1.3;
        color: var(--msk-text-color, #1F2937);
      }

      /* Bottom section - Price + CTA */
      .mysellkit-bottom-section {
        display: flex;
        flex-direction: column;
        gap: 20px;
        margin-top: 32px;
      }

      /* Price */
      .mysellkit-price-container {
        display: flex;
        align-items: baseline;
        gap: 12px;
      }

      .mysellkit-price-container.no-price {
        display: none;
      }

      .mysellkit-price-current {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 500;
        font-size: 36px;
        color: var(--msk-text-color, #1F2937);
        letter-spacing: -0.02em;
      }

      .mysellkit-price-old {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 400;
        font-size: 28px;
        color: var(--msk-text-color-light, #9CA3AF);
        text-decoration: line-through;
        opacity: 0.8;
      }

      /* CTA + Powered by */
      .mysellkit-cta-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .mysellkit-cta {
        width: 100%;
        height: 60px;
        background: var(--msk-primary-color, #00D66F);
        border: none;
        border-radius: 12px;
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

      .mysellkit-cta:hover:not(:disabled) {
        filter: brightness(0.95);
        transform: translateY(-2px);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
      }

      .mysellkit-cta:active:not(:disabled) {
        transform: translateY(0);
      }

      .mysellkit-cta:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        transform: none;
      }

      .mysellkit-cta-text {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 600;
        font-size: 16px;
        color: var(--msk-cta-text-color, #000000);
        letter-spacing: -0.01em;
      }

      .mysellkit-cta-arrow {
        font-size: 18px;
        color: var(--msk-cta-text-color, #000000);
        transition: transform 0.2s ease;
      }

      .mysellkit-cta:hover:not(:disabled) .mysellkit-cta-arrow {
        transform: translateX(3px);
      }

      /* Loading spinner */
      .mysellkit-spinner {
        display: inline-block;
        width: 18px;
        height: 18px;
        border: 2px solid var(--msk-cta-text-color, #000000)40;
        border-radius: 50%;
        border-top-color: var(--msk-cta-text-color, #000000);
        animation: mysellkit-spin 0.6s linear infinite;
      }

      @keyframes mysellkit-spin {
        to { transform: rotate(360deg); }
      }

      .mysellkit-powered {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 13px;
        color: var(--msk-text-color-light, #9CA3AF);
        text-align: center;
        font-weight: 400;
      }

      .mysellkit-powered a {
        color: var(--msk-text-color-light, #9CA3AF);
        text-decoration: none;
        font-weight: 600;
        transition: color 0.2s ease;
      }

      .mysellkit-powered a:hover {
        color: var(--msk-primary-color, #00D66F);
      }

      /* Right column - 60% width, Scrollable content */
      .mysellkit-right {
        width: 60%;
        height: 100vh;
        background: var(--msk-right-bg, #F9FAFB);
        padding: 40px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 48px;
      }

      /* Description */
      .mysellkit-description {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 400;
        font-size: 16px;
        line-height: 1.7;
        color: var(--msk-text-color, #1F2937);
        letter-spacing: 0.01em;
      }

      .mysellkit-description p {
        margin-bottom: 20px;
      }

      .mysellkit-description p:last-child {
        margin-bottom: 0;
      }

      .mysellkit-description h3 {
        font-size: 22px;
        font-weight: 600;
        color: var(--msk-text-color, #1F2937);
        margin-bottom: 16px;
        margin-top: 12px;
      }

      .mysellkit-description strong {
        color: var(--msk-text-color, #1F2937);
        font-weight: 600;
      }

      .mysellkit-description em {
        font-style: italic;
        color: var(--msk-text-color, #1F2937);
      }

      .mysellkit-description ul,
      .mysellkit-description ol {
        list-style: none;
        padding: 0;
        margin-bottom: 20px;
      }

      .mysellkit-description ul li::before {
        content: "•";
        color: var(--msk-text-color, #1F2937);
        font-weight: bold;
        display: inline-block;
        width: 1em;
        margin-left: -1em;
      }

      .mysellkit-description ul li {
        margin-left: 1em;
        margin-bottom: 10px;
        color: var(--msk-text-color, #1F2937);
      }

      .mysellkit-description ul li p {
        display: inline;
        margin: 0;
      }

      .mysellkit-description ol {
        counter-reset: item;
      }

      .mysellkit-description ol li {
        counter-increment: item;
        margin-bottom: 10px;
        margin-left: 1.5em;
        color: var(--msk-text-color, #1F2937);
      }

      .mysellkit-description ol li::before {
        content: counter(item) ".";
        color: var(--msk-text-color, #1F2937);
        font-weight: 600;
        display: inline-block;
        width: 1.5em;
        margin-left: -1.5em;
      }

      .mysellkit-description ol li p {
        display: inline;
        margin: 0;
      }

      /* What's Included section */
      .mysellkit-included {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .mysellkit-included-title {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 600;
        font-size: 22px;
        color: var(--msk-text-color, #1F2937);
        margin-bottom: 8px;
      }

      .mysellkit-included-items {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .mysellkit-included-item {
        min-height: 60px;
        background: var(--msk-left-bg, #FFFFFF);
        border-radius: 12px;
        padding: 12px;
        display: flex;
        align-items: center;
        gap: 14px;
        transition: all 0.2s ease;
        border: 1px solid rgba(0, 0, 0, 0.04);
      }

      .mysellkit-included-item:hover {
        background: var(--msk-left-bg, #FFFFFF);
        transform: translateX(4px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        border-color: var(--msk-primary-color, #00D66F)33;
      }

      .mysellkit-file-icon {
        width: 36px;
        height: 36px;
        background: linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        flex-shrink: 0;
        transition: transform 0.2s ease;
      }

      .mysellkit-included-item:hover .mysellkit-file-icon {
        transform: scale(1.1);
      }

      .mysellkit-file-name {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 500;
        font-size: 15px;
        line-height: 1.5;
        color: var(--msk-text-color, #1F2937);
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Custom scrollbar */
      .mysellkit-right::-webkit-scrollbar,
      .mysellkit-left::-webkit-scrollbar {
        width: 8px;
      }

      .mysellkit-right::-webkit-scrollbar-track,
      .mysellkit-left::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.02);
      }

      .mysellkit-right::-webkit-scrollbar-thumb,
      .mysellkit-left::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.15);
        border-radius: 4px;
        transition: background 0.2s;
      }

      .mysellkit-right::-webkit-scrollbar-thumb:hover,
      .mysellkit-left::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.25);
      }

      /* Mobile responsive */
      @media (max-width: 768px) {
        .mysellkit-toast {
          left: 16px;
          right: 16px;
          max-width: none;
          top: 16px;
        }

        .mysellkit-product-page {
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
          padding-bottom: 140px;
          overflow-y: auto;
        }

        .mysellkit-right {
          display: none;
        }

        .mysellkit-top {
          margin-bottom: 32px;
        }

        .mysellkit-image-wrapper {
          margin-bottom: 20px;
        }

        .mysellkit-title {
          font-size: 26px;
        }

        .mysellkit-price-current {
          font-size: 32px;
        }

        .mysellkit-price-old {
          font-size: 24px;
        }

        .mysellkit-bottom-section {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: var(--msk-left-bg, #FFFFFF);
          padding: 16px 20px 20px;
          box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          z-index: 50;
          margin-top: 0;
        }

        .mysellkit-cta {
          height: 56px;
        }

        /* Show description in left column on mobile */
        .mysellkit-left .mysellkit-mobile-content {
          display: flex;
          flex-direction: column;
          gap: 32px;
          margin-bottom: 24px;
        }
      }

      .mysellkit-mobile-content {
        display: none;
      }

      @media (max-width: 768px) {
        .mysellkit-mobile-content {
          display: flex;
          flex-direction: column;
          gap: 32px;
          margin-bottom: 24px;
        }
      }
    `;
  }

  // ============================================
  // CREATE FULLSCREEN PRODUCT PAGE
  // ============================================

  function createProductPage(productData, displayConfig) {
    if (DEBUG_MODE) {
      console.log('🎨 Creating fullscreen product page');
      console.log('Product data:', productData);
      console.log('Display config:', displayConfig);
    }

    const overlay = document.createElement('div');
    overlay.className = 'mysellkit-product-overlay';
    overlay.id = 'mysellkit-product-page-overlay';

    // Apply CSS variables from displayConfig (passed from button attributes)
    overlay.style.setProperty('--msk-primary-color', displayConfig.colors.primary);
    overlay.style.setProperty('--msk-left-bg', displayConfig.colors.left);
    overlay.style.setProperty('--msk-right-bg', displayConfig.colors.right);
    overlay.style.setProperty('--msk-text-color', displayConfig.colors.text);
    overlay.style.setProperty('--msk-text-color-light', displayConfig.colors.textLight);
    overlay.style.setProperty('--msk-cta-text-color', displayConfig.colors.ctaText);

    // Included items HTML
    const includedHTML = productData.included_items && productData.included_items.length > 0
      ? renderIncludedItems(productData.included_items, productData.included_title)
      : '';

    // Description HTML
    const descriptionHTML = productData.description_html || '';

    // Check if image exists
    const hasImage = productData.image && productData.image.trim() !== '';
    const imageWrapperClass = hasImage ? 'mysellkit-image-wrapper' : 'mysellkit-image-wrapper no-image';
    const imageHTML = hasImage ? `<img src="${productData.image}" alt="${productData.title}" class="mysellkit-image" />` : '';

    // Price display (use displayConfig.showPrice from button's data-show-price attribute)
    const priceContainerClass = displayConfig.showPrice ? 'mysellkit-price-container' : 'mysellkit-price-container no-price';
    const priceHTML = displayConfig.showPrice ? `
      <div class="${priceContainerClass}">
        <span class="mysellkit-price-current">${productData.currency}${productData.price}</span>
        ${productData.old_price ? `<span class="mysellkit-price-old">${productData.currency}${productData.old_price}</span>` : ''}
      </div>
    ` : '';

    overlay.innerHTML = `
      <div class="mysellkit-product-page">

        <button class="mysellkit-close" aria-label="Close">×</button>

        <div class="mysellkit-left">

          <div class="mysellkit-top">
            <div class="${imageWrapperClass}">
              ${imageHTML}
            </div>
            <h2 class="mysellkit-title">${productData.title}</h2>
          </div>

          <div class="mysellkit-mobile-content">
            ${descriptionHTML ? `<div class="mysellkit-description">${descriptionHTML}</div>` : ''}
            ${includedHTML}
          </div>

          <div class="mysellkit-bottom-section">
            ${priceHTML}
            <div class="mysellkit-cta-section">
              <button class="mysellkit-cta">
                <span class="mysellkit-cta-text">${CTA_TEXT}</span>
                <span class="mysellkit-cta-arrow">→</span>
              </button>
              <p class="mysellkit-powered">
                Powered by <a href="https://mysellkit.com" target="_blank">My Sell Kit</a>
              </p>
            </div>
          </div>

        </div>

        <div class="mysellkit-right">
          ${descriptionHTML ? `<div class="mysellkit-description">${descriptionHTML}</div>` : ''}
          ${includedHTML}
        </div>

      </div>
    `;

    document.body.appendChild(overlay);

    setupEventListeners(overlay, productData);
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  function setupEventListeners(overlay, productData) {
    const productId = productData.product_id;

    // Close button
    overlay.querySelector('.mysellkit-close').addEventListener('click', () => {
      if (DEBUG_MODE) {
        console.log('❌ Close button clicked');
      }
      trackEvent(productId, 'close');
      hideProductPage();
    });

    // Click overlay background
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (DEBUG_MODE) {
          console.log('❌ Overlay clicked (close)');
        }
        trackEvent(productId, 'close');
        hideProductPage();
      }
    });

    // CTA button
    overlay.querySelector('.mysellkit-cta').addEventListener('click', async (e) => {
      if (DEBUG_MODE) {
        console.log('🛒 CTA button clicked');
      }

      const button = e.target.closest('.mysellkit-cta');
      await performCheckout(button, productId, productData);
    });
  }

  // ============================================
  // PERFORM CHECKOUT
  // ============================================

  async function performCheckout(buttonElement, productId, productData) {
    if (DEBUG_MODE) {
      console.log('🛒 Starting checkout process');
    }

    // Check if product is in draft mode
    if (productData && productData.is_live !== 'yes') {
      if (DEBUG_MODE) {
        console.log('🚧 Cannot checkout: Product is in DRAFT mode');
      }
      showToast('This product is in draft mode. Checkout is disabled.', 'error');
      return;
    }

    // Generate unique purchase token
    const purchaseToken = generatePurchaseToken();

    if (DEBUG_MODE) {
      console.log('🎫 Purchase token generated:', purchaseToken);
    }

    // Track click with purchase token
    trackEvent(productId, 'click', {
      purchase_token: purchaseToken,
      display_mode: 'fullscreen'
    });

    // Show loading state
    const textElement = buttonElement.querySelector('.mysellkit-cta-text');
    const arrowElement = buttonElement.querySelector('.mysellkit-cta-arrow');
    const originalText = textElement.textContent;

    textElement.textContent = 'Loading...';
    arrowElement.style.display = 'none';
    buttonElement.disabled = true;

    const spinner = document.createElement('span');
    spinner.className = 'mysellkit-spinner';
    buttonElement.appendChild(spinner);

    try {
      // Create Stripe Checkout Session
      const response = await fetch(`${API_BASE}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: productId,
          session_id: getSessionId(),
          purchase_token: purchaseToken,
          success_url: `${CHECKOUT_BASE}/payment-processing?token=${purchaseToken}`,
          cancel_url: window.location.href + (window.location.href.includes('?') ? '&' : '?') + 'mysellkit_cancelled=true'
        })
      });

      const data = await response.json();

      if (DEBUG_MODE) {
        console.log('💳 Checkout response:', data);
      }

      // Check if response is valid
      if (data.response && data.response.success === 'yes' && data.response.checkout_url) {
        sessionStorage.setItem('mysellkit_purchase_token', purchaseToken);

        if (DEBUG_MODE) {
          console.log('✅ Redirecting to checkout...');
        }

        hideProductPage();
        window.location.href = data.response.checkout_url;
      } else {
        console.error('❌ Invalid checkout response:', data);

        let errorMessage = 'Unable to start checkout. ';
        if (data.response?.error) {
          errorMessage += data.response.error;
        } else if (data.error) {
          errorMessage += data.error;
        } else {
          errorMessage += 'Please try again or contact support.';
        }

        showToast(errorMessage, 'error');

        // Reset button state
        textElement.textContent = originalText;
        arrowElement.style.display = 'inline';
        spinner.remove();
        buttonElement.disabled = false;
      }
    } catch (error) {
      console.error('❌ Checkout request failed:', error);
      showToast('Connection error. Please check your internet and try again.', 'error');

      // Reset button state
      textElement.textContent = originalText;
      arrowElement.style.display = 'inline';
      spinner.remove();
      buttonElement.disabled = false;
    }
  }

  // ============================================
  // SHOW/HIDE PRODUCT PAGE
  // ============================================

  function showProductPage() {
    const overlay = document.getElementById('mysellkit-product-page-overlay');
    if (!overlay) return;

    if (DEBUG_MODE) {
      console.log('🎉 Showing fullscreen product page');
    }

    overlay.classList.add('visible');

    // Note: productId will be stored in overlay's data attribute and tracked on show
  }

  function hideProductPage() {
    const overlay = document.getElementById('mysellkit-product-page-overlay');
    if (!overlay) return;

    overlay.classList.remove('visible');
  }

  // ============================================
  // OPEN PRODUCT PAGE (called by button click)
  // ============================================

  async function openProductPage(productId, displayConfig) {
    if (DEBUG_MODE) {
      console.log('🚀 Opening product page for:', productId);
      console.log('Display config:', displayConfig);
    }

    try {
      // Fetch product data from API
      const productData = await fetchWidgetConfig(productId);
      if (!productData) {
        console.error('MySellKit: Failed to load product data');
        showToast('Failed to load product. Please try again.', 'error');
        return;
      }

      // Check if product is live
      if (productData.is_live !== 'yes' && !DEBUG_MODE) {
        console.log('🚧 Product is in DRAFT mode - not showing in production');
        return;
      }

      if (productData.is_live !== 'yes' && DEBUG_MODE) {
        console.log('🚧 DRAFT MODE: Product is not live. Checkout disabled. Widget will still display in debug mode.');
      }

      // Store productId in productData for later use
      productData.product_id = productId;

      // Create and show the product page
      createProductPage(productData, displayConfig);
      showProductPage();

      // Track impression
      trackEvent(productId, 'impression', { display_mode: 'fullscreen' });

    } catch (error) {
      console.error('MySellKit: Error opening product page', error);
      showToast('An error occurred. Please try again.', 'error');
    }
  }

  // ============================================
  // ATTACH PRODUCT PAGE BUTTONS
  // ============================================

  function attachProductPageButtons() {
    const buttons = document.querySelectorAll('[data-mysellkit-page]');

    if (DEBUG_MODE) {
      console.log(`🔍 Found ${buttons.length} product page button(s)`);
    }

    if (buttons.length === 0) {
      if (DEBUG_MODE) {
        console.log('⚠️ No [data-mysellkit-page] buttons found on page');
      }
      return;
    }

    buttons.forEach(button => {
      const buttonProductId = button.getAttribute('data-mysellkit-page');

      if (!buttonProductId) {
        console.warn('MySellKit: Button has data-mysellkit-page but no product ID');
        return;
      }

      // Only attach if button matches script's product ID
      if (buttonProductId !== PRODUCT_ID) {
        if (DEBUG_MODE) {
          console.warn(`MySellKit: Button product ${buttonProductId} doesn't match script product ${PRODUCT_ID}`);
        }
        return;
      }

      // Add cursor pointer
      button.style.cursor = 'pointer';

      // Attach click handler - use config from script tag
      button.addEventListener('click', async (e) => {
        e.preventDefault();

        if (DEBUG_MODE) {
          console.log(`✅ Product page button clicked for product ${PRODUCT_ID}`);
        }

        await openProductPage(PRODUCT_ID, {
          showPrice: SHOW_PRICE,
          colors: {
            primary: COLOR_PRIMARY,
            left: COLOR_LEFT,
            right: COLOR_RIGHT,
            text: COLOR_TEXT,
            textLight: COLOR_TEXT_LIGHT,
            ctaText: COLOR_CTA_TEXT
          }
        });
      });

      if (DEBUG_MODE) {
        console.log(`✅ Attached product page to button for product ${PRODUCT_ID}`);
      }
    });

    if (DEBUG_MODE) {
      console.log(`✅ Attached ${buttons.length} matching product page button(s)`);
    }
  }

  // ============================================
  // INIT
  // ============================================

  function init() {
    if (DEBUG_MODE) {
      console.log(`🚀 MySellKit Product Page v${WIDGET_VERSION} initializing...`);
    }

    if (!PRODUCT_ID) {
      console.error('MySellKit: Missing data-product attribute on script tag');
      return;
    }

    if (DEBUG_MODE) {
      console.log('📦 Product ID:', PRODUCT_ID);
    }

    // Inject CSS
    injectCSS();

    // Attach product page buttons
    attachProductPageButtons();

    if (DEBUG_MODE) {
      console.log('✅ MySellKit Product Page initialized successfully');
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
