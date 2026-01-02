(function() {
    'use strict';
    
    let scrollTimeout = null;
    let lastOpacity = 1;
    let lastHeaderOpacity = 1;

    function handleScroll() {
        const descriptionSection = document.getElementById('description-section');
        const header = document.querySelector('.site-header');
        const etherealShadow = document.getElementById('ethereal-shadow');
        const homeContent = document.querySelector('.home-content');
        
        if (!descriptionSection || !header || !etherealShadow || !homeContent) return;

        const descriptionTop = descriptionSection.offsetTop;
        const windowHeight = window.innerHeight;
        const scrollPosition = window.scrollY;
        
        // Create a smooth transition zone - start fading 200px before description section
        const transitionStart = descriptionTop - windowHeight - 200;
        const transitionEnd = descriptionTop - windowHeight * 0.3;
        const transitionRange = transitionEnd - transitionStart;
        
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
        
        // Update header opacity
        if (Math.abs(headerOpacity - lastHeaderOpacity) > 0.01) {
            header.style.opacity = headerOpacity.toString();
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

