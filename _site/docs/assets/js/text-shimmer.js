(function() {
    'use strict';
    
    /**
     * Initialize text shimmer effect on elements with .text-shimmer class
     * Calculates dynamic spread based on text length
     */
    function initTextShimmer() {
        const shimmerElements = document.querySelectorAll('.text-shimmer');
        
        shimmerElements.forEach(function(element) {
            const text = element.textContent || element.innerText;
            const textLength = text.length;
            
            // Calculate spread based on text length (default: 2px per character)
            const spread = textLength * 2;
            
            // Set CSS custom property for spread
            element.style.setProperty('--shimmer-spread', spread + 'px');
        });
    }
    
    /**
     * Create a text shimmer element programmatically
     * @param {string} text - The text to display
     * @param {Object} options - Configuration options
     * @param {string} options.tag - HTML tag to use (default: 'span')
     * @param {number} options.duration - Animation duration in seconds (default: 2)
     * @param {number} options.spread - Spread multiplier (default: 2)
     * @param {string} options.baseColor - Base color (default: '#a1a1aa')
     * @param {string} options.gradientColor - Gradient color (default: '#ffffff')
     * @param {string} options.className - Additional CSS classes
     * @returns {HTMLElement} The created element
     */
    function createTextShimmer(text, options) {
        options = options || {};
        const tag = options.tag || 'span';
        const duration = options.duration || 2;
        const spread = (text.length * (options.spread || 2)) + 'px';
        const baseColor = options.baseColor || '#a1a1aa';
        const gradientColor = options.gradientColor || '#ffffff';
        const className = options.className || '';
        
        const element = document.createElement(tag);
        element.textContent = text;
        element.className = 'text-shimmer ' + className;
        element.style.setProperty('--shimmer-spread', spread);
        element.style.setProperty('--shimmer-base-color', baseColor);
        element.style.setProperty('--shimmer-gradient-color', gradientColor);
        element.style.animationDuration = duration + 's';
        
        return element;
    }
    
    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTextShimmer);
    } else {
        initTextShimmer();
    }
    
    // Expose utility function globally
    window.createTextShimmer = createTextShimmer;
})();

