(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================

  const API_BASE = 'https://mysellkit.com/version-test/api/1.1/wf';
  const CHECKOUT_BASE = 'https://mysellkit.com/version-test';
  const WIDGET_VERSION = '1.2.4';

  let sessionId = null;

  // Check debug mode
  const urlParams = new URLSearchParams(window.location.search);
  const DEBUG_MODE = urlParams.get('debug') === 'true' ||
                     urlParams.get('mysellkit_test') === 'true';

  if (DEBUG_MODE) {
    console.log(`🔧 MySellKit Checkout DEBUG MODE ENABLED (v${WIDGET_VERSION})`);
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  function getSessionId() {
    if (sessionId) return sessionId;

    if (DEBUG_MODE) {
      sessionId = 'msk_debug_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      console.log('🔄 Debug mode: New session per page load:', sessionId);
      return sessionId;
    }

    const stored = localStorage.getItem('mysellkit_session');
    const storedTime = localStorage.getItem('mysellkit_session_time');

    if (stored && storedTime && (Date.now() - parseInt(storedTime) < 86400000)) {
      sessionId = stored;
    } else {
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
    let toast = document.getElementById('mysellkit-checkout-toast');

    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mysellkit-checkout-toast';
      toast.className = 'mysellkit-checkout-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = `mysellkit-checkout-toast mysellkit-checkout-toast-${type} mysellkit-checkout-toast-show`;

    setTimeout(() => {
      toast.classList.remove('mysellkit-checkout-toast-show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 5000);
  }

  // ============================================
  // LOADING OVERLAY
  // ============================================

  function showLoadingOverlay(message = 'Redirecting to checkout...') {
    let overlay = document.getElementById('mysellkit-checkout-loading');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'mysellkit-checkout-loading';
      overlay.className = 'mysellkit-checkout-loading';
      overlay.innerHTML = `
        <div class="mysellkit-checkout-loading-content">
          <div class="mysellkit-checkout-spinner"></div>
          <div class="mysellkit-checkout-loading-text">${message}</div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    setTimeout(() => {
      overlay.classList.add('visible');
    }, 10);
  }

  function hideLoadingOverlay() {
    const overlay = document.getElementById('mysellkit-checkout-loading');
    if (overlay) {
      overlay.classList.remove('visible');
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 300);
    }
  }

  // ============================================
  // TRACK EVENTS
  // ============================================

  async function trackEvent(productId, eventType, additionalData = {}) {
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
          product_id: productId,
          session_id: getSessionId(),
          event_type: eventType,
          timestamp: Date.now(),
          page_url: window.location.href,
          user_agent: navigator.userAgent,
          ...additionalData
        })
      });
    } catch (error) {
      console.error('MySellKit: Failed to track event', error);
    }
  }

  // ============================================
  // PERFORM CHECKOUT
  // ============================================

  async function performCheckout(productId) {
    if (DEBUG_MODE) {
      console.log('🚀 Starting direct checkout for product:', productId);
    }

    // Show loading overlay
    showLoadingOverlay('Redirecting to checkout...');

    try {
      // Fetch product config first
      const configResponse = await fetch(`${API_BASE}/get-widget-config?product_id=${productId}`);
      const configData = await configResponse.json();

      if (DEBUG_MODE) {
        console.log('📦 Config received:', configData);
      }

      if (!configData.response || configData.response.success !== 'yes') {
        throw new Error('Invalid product ID or product not found');
      }

      const config = configData.response;

      // Check if product is live
      if (config.is_live !== 'yes') {
        if (DEBUG_MODE) {
          console.log('🚧 Product in draft mode');
        }
        hideLoadingOverlay();
        showToast('This product is in draft mode. Checkout is disabled.', 'error');
        return;
      }

      // Generate purchase token
      const purchaseToken = generatePurchaseToken();

      if (DEBUG_MODE) {
        console.log('🎫 Purchase token generated:', purchaseToken);
      }

      // Track click event
      trackEvent(productId, 'click', {
        purchase_token: purchaseToken,
        direct_checkout: true
      });

      // Create checkout session
      const checkoutResponse = await fetch(`${API_BASE}/create-checkout-session`, {
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

      const checkoutData = await checkoutResponse.json();

      if (DEBUG_MODE) {
        console.log('💳 Checkout response:', checkoutData);
      }

      // Check if response is valid
      if (checkoutData.response && checkoutData.response.success === 'yes' && checkoutData.response.checkout_url) {
        sessionStorage.setItem('mysellkit_purchase_token', purchaseToken);

        if (DEBUG_MODE) {
          console.log('✅ Redirecting to Stripe checkout...');
        }

        // Redirect to Stripe Checkout
        window.location.href = checkoutData.response.checkout_url;
      } else {
        throw new Error(checkoutData.response?.error || checkoutData.error || 'Unable to create checkout session');
      }
    } catch (error) {
      console.error('❌ Checkout failed:', error);
      hideLoadingOverlay();
      showToast(error.message || 'Connection error. Please try again.', 'error');
    }
  }

  // ============================================
  // ATTACH CHECKOUT BUTTONS
  // ============================================

  function attachCheckoutButtons() {
    const buttons = document.querySelectorAll('[data-mysellkit-checkout]');

    if (DEBUG_MODE) {
      console.log(`🔍 Found ${buttons.length} checkout button(s)`);
    }

    if (buttons.length === 0) {
      if (DEBUG_MODE) {
        console.log('⚠️ No [data-mysellkit-checkout] buttons found on page');
      }
      return;
    }

    buttons.forEach(button => {
      const productId = button.getAttribute('data-mysellkit-checkout');

      if (!productId) {
        console.warn('MySellKit: Button has data-mysellkit-checkout but no product ID');
        return;
      }

      // Add cursor pointer
      button.style.cursor = 'pointer';

      // Attach click handler
      button.addEventListener('click', async (e) => {
        e.preventDefault();
        await performCheckout(productId);
      });

      if (DEBUG_MODE) {
        console.log(`✅ Checkout attached to button for product ${productId}`);
      }
    });

    if (DEBUG_MODE) {
      console.log(`✅ Attached ${buttons.length} checkout button(s)`);
    }
  }

  // ============================================
  // INJECT MINIMAL CSS
  // ============================================

  function injectMinimalCSS() {
    if (document.getElementById('mysellkit-checkout-styles')) return;

    const style = document.createElement('style');
    style.id = 'mysellkit-checkout-styles';
    style.textContent = `
      /* Toast Notification */
      .mysellkit-checkout-toast {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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

      .mysellkit-checkout-toast-show {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }

      .mysellkit-checkout-toast-error {
        border-left-color: #EF4444;
      }

      .mysellkit-checkout-toast-success {
        border-left-color: #00D66F;
      }

      /* Loading Overlay */
      .mysellkit-checkout-loading {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(8px);
        z-index: 10000000;
        display: none;
        align-items: center;
        justify-content: center;
        animation: mysellkit-checkout-fadeIn 0.2s ease;
      }

      .mysellkit-checkout-loading.visible {
        display: flex;
      }

      .mysellkit-checkout-loading-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
      }

      .mysellkit-checkout-spinner {
        width: 48px;
        height: 48px;
        border: 4px solid rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        border-top-color: #00D66F;
        animation: mysellkit-checkout-spin 0.8s linear infinite;
      }

      .mysellkit-checkout-loading-text {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 16px;
        font-weight: 500;
        color: white;
        text-align: center;
      }

      @keyframes mysellkit-checkout-spin {
        to { transform: rotate(360deg); }
      }

      @keyframes mysellkit-checkout-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @media (max-width: 768px) {
        .mysellkit-checkout-toast {
          left: 16px;
          right: 16px;
          max-width: none;
          top: 16px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================
  // INIT
  // ============================================

  function init() {
    if (DEBUG_MODE) {
      console.log(`🚀 MySellKit Checkout v${WIDGET_VERSION} initializing...`);
    }

    // Inject minimal CSS
    injectMinimalCSS();

    // Attach checkout buttons
    attachCheckoutButtons();

    if (DEBUG_MODE) {
      console.log('✅ MySellKit Checkout initialized successfully');
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
