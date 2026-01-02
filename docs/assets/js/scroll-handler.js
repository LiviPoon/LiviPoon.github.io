(function() {
    'use strict';
    
    let scrollTimeout = null;
    let lastOpacity = 1;
    let lastHeaderOpacity = 1;

    function handleScroll() {
        const header = document.querySelector('.site-header');
        const etherealShadow = document.getElementById('ethereal-shadow');
        const logoText = document.querySelector('.logo-text');
        
        if (!header || !etherealShadow) return;

        const windowHeight = window.innerHeight;
        const scrollPosition = window.scrollY;
        
        // Check if this is the homepage (has description-section)
        const descriptionSection = document.getElementById('description-section');
        const homeContent = document.querySelector('.home-content');
        
        let transitionStart, transitionEnd, transitionRange;
        
        if (descriptionSection && homeContent) {
            // Homepage: fade when scrolling to description section
            const descriptionTop = descriptionSection.offsetTop;
            transitionStart = descriptionTop - windowHeight - 200;
            transitionEnd = descriptionTop - windowHeight * 0.3;
        } else {
            // Other pages: fade after scrolling past initial viewport
            transitionStart = windowHeight * 0.5;
            transitionEnd = windowHeight * 1.2;
        }
        
        transitionRange = transitionEnd - transitionStart;
        
        // Calculate opacity based on scroll position (0 = fully visible, 1 = fully faded)
        let opacity = 0;
        let headerOpacity = 1;
        
        if (scrollPosition < transitionStart) {
            // Before transition zone - fully visible
            opacity = 1;
            headerOpacity = 1;
        } else if (scrollPosition >= transitionStart && scrollPosition <= transitionEnd) {
            // In transition zone - gradual fade
            const progress = (scrollPosition - transitionStart) / transitionRange;
            // Use smooth easing function for baby-bottom smoothness
            const easedProgress = progress * progress * (3 - 2 * progress); // Smoothstep
            opacity = 1 - easedProgress;
            headerOpacity = 1 - easedProgress;
        } else {
            // After transition zone - fully faded
            opacity = 0;
            headerOpacity = 0;
        }
        
        // Only update if opacity changed significantly (performance optimization)
        if (Math.abs(opacity - lastOpacity) > 0.01) {
            etherealShadow.style.opacity = opacity.toString();
            lastOpacity = opacity;
        }
        
        // Update header and logo opacity
        if (Math.abs(headerOpacity - lastHeaderOpacity) > 0.01) {
            header.style.opacity = headerOpacity.toString();
            if (logoText) {
                logoText.style.opacity = headerOpacity.toString();
            }
            lastHeaderOpacity = headerOpacity;
            
            // Add/remove fade-out class for CSS transitions
            if (headerOpacity < 0.1) {
                header.classList.add('fade-out');
            } else {
                header.classList.remove('fade-out');
            }
        }
    }

    // Throttled scroll handler
    function throttledScrollHandler() {
        if (scrollTimeout) {
            cancelAnimationFrame(scrollTimeout);
        }
        
        scrollTimeout = requestAnimationFrame(() => {
            handleScroll();
        });
    }

    // Initialize ethereal shadow on page load
    function init() {
        if (typeof initEtherealShadow === 'function') {
            initEtherealShadow();
        }
        
        // Check initial scroll position
        handleScroll();
        
        // Add scroll listener
        window.addEventListener('scroll', throttledScrollHandler, { passive: true });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

