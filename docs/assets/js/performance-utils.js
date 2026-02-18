/**
 * Performance utilities for handling animations and media based on connection speed
 */
(function() {
    'use strict';
    
    // Connection speed detection
    function detectConnectionSpeed() {
        // Check Network Information API (if available)
        if ('connection' in navigator) {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (connection) {
                // Check effective connection type
                const effectiveType = connection.effectiveType;
                if (effectiveType === 'slow-2g' || effectiveType === '2g') {
                    return 'slow';
                }
                // Check downlink speed (Mbps)
                if (connection.downlink && connection.downlink < 1.5) {
                    return 'slow';
                }
            }
        }
        
        // Check for prefers-reduced-motion
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return 'reduced';
        }
        
        return 'normal';
    }
    
    // Check if media should be disabled
    function shouldDisableMedia() {
        const connectionSpeed = detectConnectionSpeed();
        return connectionSpeed === 'slow' || connectionSpeed === 'reduced';
    }
    
    // Optimize video background loading
    function optimizeVideoBackground() {
        const videoContainer = document.querySelector('.video-background-container');
        if (!videoContainer) return;
        
        const iframe = videoContainer.querySelector('iframe');
        if (!iframe) return;
        
        if (shouldDisableMedia()) {
            // Hide video and show static background instead
            videoContainer.style.display = 'none';
            // Optionally add a static background color
            document.body.style.background = '#1a1a1a';
        } else {
            // Use loading="lazy" for better performance
            iframe.setAttribute('loading', 'lazy');
            
            // Add error handling
            iframe.addEventListener('error', function() {
                videoContainer.style.display = 'none';
                document.body.style.background = '#1a1a1a';
            });
        }
    }
    
    // Monitor connection changes
    function setupConnectionMonitoring(callback) {
        if ('connection' in navigator) {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (connection) {
                connection.addEventListener('change', function() {
                    if (callback) callback();
                });
            }
        }
        
        // Monitor prefers-reduced-motion changes
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
            mediaQuery.addEventListener('change', function() {
                if (callback) callback();
            });
        }
    }
    
    // Initialize on DOM ready
    function init() {
        optimizeVideoBackground();
        setupConnectionMonitoring(optimizeVideoBackground);
    }
    
    // Expose functions globally
    window.performanceUtils = {
        detectConnectionSpeed: detectConnectionSpeed,
        shouldDisableMedia: shouldDisableMedia,
        optimizeVideoBackground: optimizeVideoBackground,
        setupConnectionMonitoring: setupConnectionMonitoring
    };
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
