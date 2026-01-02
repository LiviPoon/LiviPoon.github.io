(function() {
    'use strict';
    
    let isTransitioning = false;
    const transitionDuration = 300; // milliseconds
    
    // Add fade-out effect when clicking on links
    function handleLinkClick(event) {
        // Prevent multiple transitions
        if (isTransitioning) {
            event.preventDefault();
            return;
        }
        
        const link = event.currentTarget;
        const href = link.getAttribute('href');
        
        // Only handle internal links
        if (href && (href.startsWith('/') || href.startsWith(window.location.origin))) {
            // Don't handle same-page anchors or hash links
            const targetUrl = new URL(href, window.location.origin);
            const currentUrl = new URL(window.location.href);
            
            if (targetUrl.pathname === currentUrl.pathname && !targetUrl.hash) {
                return;
            }
            
            // Skip external links, mailto, tel
            if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) {
                return;
            }
            
            // Prevent default navigation
            event.preventDefault();
            isTransitioning = true;
            
            // Add fade-out transition
            document.body.style.transition = 'opacity ' + transitionDuration + 'ms ease-out';
            document.body.style.opacity = '0';
            
            // Navigate after fade-out completes
            setTimeout(function() {
                window.location.href = href;
            }, transitionDuration);
        }
    }
    
    // Attach click handlers to all internal links
    function initPageTransitions() {
        const links = document.querySelectorAll('a[href]');
        
        links.forEach(function(link) {
            const href = link.getAttribute('href');
            
            // Only handle internal links
            if (href && (href.startsWith('/') || href.startsWith(window.location.origin))) {
                // Skip external links, mailto, tel, and hash links
                if (!href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('#')) {
                    link.addEventListener('click', handleLinkClick);
                }
            }
        });
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            // Small delay to ensure page is fully rendered
            setTimeout(initPageTransitions, 50);
        });
    } else {
        setTimeout(initPageTransitions, 50);
    }
})();

