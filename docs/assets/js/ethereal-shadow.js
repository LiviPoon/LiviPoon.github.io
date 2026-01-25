(function() {
    'use strict';
    
    let animationId = null;
    let hueRotateValue = 0;
    let feColorMatrixElement = null;
    let isInitialized = false;
    let animationPaused = false;
    let performanceMode = 'auto'; // 'auto', 'enabled', 'disabled'
    
    // Performance detection
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
    
    // Check if animations should be disabled
    function shouldDisableAnimations() {
        if (performanceMode === 'disabled') {
            return true;
        }
        if (performanceMode === 'enabled') {
            return false;
        }
        // Auto mode: check connection and preferences
        const connectionSpeed = detectConnectionSpeed();
        return connectionSpeed === 'slow' || connectionSpeed === 'reduced';
    }
    
    // Pause animation
    function pauseAnimation() {
        if (animationId !== null) {
            cancelAnimationFrame(animationId);
            animationId = null;
            animationPaused = true;
        }
    }
    
    // Resume animation
    function resumeAnimation() {
        if (animationPaused && feColorMatrixElement && !shouldDisableAnimations()) {
            const config = { scale: 100, speed: 90 };
            const animationDuration = mapRange(config.speed, 1, 100, 1000, 50);
            const hueRotateDuration = animationDuration / 25;
            const startTime = Date.now();
            
            function animateHue() {
                if (shouldDisableAnimations()) {
                    pauseAnimation();
                    return;
                }
                
                const elapsed = Date.now() - startTime;
                hueRotateValue = (elapsed / hueRotateDuration) % 360;
                
                if (feColorMatrixElement) {
                    feColorMatrixElement.setAttribute('values', hueRotateValue.toString());
                }
                
                animationId = requestAnimationFrame(animateHue);
            }
            
            animationPaused = false;
            animateHue();
        }
    }
    
    // Monitor connection changes
    function setupConnectionMonitoring() {
        if ('connection' in navigator) {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (connection) {
                connection.addEventListener('change', function() {
                    if (shouldDisableAnimations()) {
                        pauseAnimation();
                    } else {
                        resumeAnimation();
                    }
                });
            }
        }
        
        // Monitor prefers-reduced-motion changes
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
            mediaQuery.addEventListener('change', function() {
                if (shouldDisableAnimations()) {
                    pauseAnimation();
                } else {
                    resumeAnimation();
                }
            });
        }
    }

    function mapRange(value, fromLow, fromHigh, toLow, toHigh) {
        if (fromLow === fromHigh) {
            return toLow;
        }
        const percentage = (value - fromLow) / (fromHigh - fromLow);
        return toLow + percentage * (toHigh - toLow);
    }

    function initEtherealShadow() {
        const container = document.getElementById('ethereal-shadow');
        if (!container) return;
        
        // If already initialized and animation is running, don't reinitialize
        if (isInitialized && animationId !== null) return;
        
        // If container already has content but animation was stopped, restart it
        if (isInitialized && container.children.length > 0 && animationId === null) {
            // Find the existing feColorMatrix element
            const svg = container.querySelector('svg');
            if (svg) {
                feColorMatrixElement = svg.querySelector('feColorMatrix[type="hueRotate"]');
                if (feColorMatrixElement) {
                    // Restart the animation
                    const config = { scale: 100, speed: 90 };
                    const animationDuration = mapRange(config.speed, 1, 100, 1000, 50);
                    const hueRotateDuration = animationDuration / 25;
                    const startTime = Date.now();
                    
                    function animateHue() {
                        const elapsed = Date.now() - startTime;
                        hueRotateValue = (elapsed / hueRotateDuration) % 360;
                        
                        if (feColorMatrixElement) {
                            feColorMatrixElement.setAttribute('values', hueRotateValue.toString());
                        }
                        
                        animationId = requestAnimationFrame(animateHue);
                    }
                    
                    animateHue();
                    return;
                }
            }
        }

        // Configuration
        const config = {
            scale: 100,
            speed: 90,
            color: 'rgba(128, 128, 128, 1)',
            noiseOpacity: 1,
            noiseScale: 1.2,
            sizing: 'fill'
        };

        const animationEnabled = config.scale > 0;
        const displacementScale = mapRange(config.scale, 1, 100, 20, 100);
        const animationDuration = mapRange(config.speed, 1, 100, 1000, 50);
        const baseFreqX = mapRange(config.scale, 0, 100, 0.001, 0.0005);
        const baseFreqY = mapRange(config.scale, 0, 100, 0.004, 0.002);

        // Create unique ID for filter
        const filterId = 'ethereal-shadow-filter-' + Math.random().toString(36).substr(2, 9);

        // Create SVG filter
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.width = '0';
        svg.style.height = '0';
        
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', filterId);

        // feTurbulence
        const feTurbulence = document.createElementNS('http://www.w3.org/2000/svg', 'feTurbulence');
        feTurbulence.setAttribute('result', 'undulation');
        feTurbulence.setAttribute('numOctaves', '2');
        feTurbulence.setAttribute('baseFrequency', `${baseFreqX},${baseFreqY}`);
        feTurbulence.setAttribute('seed', '0');
        feTurbulence.setAttribute('type', 'turbulence');
        filter.appendChild(feTurbulence);

        // feColorMatrix (hue rotate)
        feColorMatrixElement = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
        feColorMatrixElement.setAttribute('in', 'undulation');
        feColorMatrixElement.setAttribute('type', 'hueRotate');
        feColorMatrixElement.setAttribute('values', '0');
        filter.appendChild(feColorMatrixElement);

        // feColorMatrix (circulation)
        const feColorMatrix2 = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
        feColorMatrix2.setAttribute('in', 'dist');
        feColorMatrix2.setAttribute('result', 'circulation');
        feColorMatrix2.setAttribute('type', 'matrix');
        feColorMatrix2.setAttribute('values', '4 0 0 0 1  4 0 0 0 1  4 0 0 0 1  1 0 0 0 0');
        filter.appendChild(feColorMatrix2);

        // feDisplacementMap 1
        const feDisplacementMap1 = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
        feDisplacementMap1.setAttribute('in', 'SourceGraphic');
        feDisplacementMap1.setAttribute('in2', 'circulation');
        feDisplacementMap1.setAttribute('scale', displacementScale);
        feDisplacementMap1.setAttribute('result', 'dist');
        filter.appendChild(feDisplacementMap1);

        // feDisplacementMap 2
        const feDisplacementMap2 = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
        feDisplacementMap2.setAttribute('in', 'dist');
        feDisplacementMap2.setAttribute('in2', 'undulation');
        feDisplacementMap2.setAttribute('scale', displacementScale);
        feDisplacementMap2.setAttribute('result', 'output');
        filter.appendChild(feDisplacementMap2);

        defs.appendChild(filter);
        svg.appendChild(defs);
        container.appendChild(svg);

        // Create shadow element
        const shadowElement = document.createElement('div');
        shadowElement.style.position = 'absolute';
        shadowElement.style.inset = `-${displacementScale}px`;
        shadowElement.style.filter = animationEnabled ? `url(#${filterId}) blur(4px)` : 'none';
        
        const shadowInner = document.createElement('div');
        shadowInner.style.backgroundColor = config.color;
        shadowInner.style.width = '100%';
        shadowInner.style.height = '100%';
        
        // Test mask image loading before applying
        const maskImageUrl = 'https://framerusercontent.com/images/ceBGguIpUU8luwByxuQz79t7To.png';
        const testMaskImage = new Image();
        testMaskImage.onload = function() {
            shadowInner.style.maskImage = `url('${maskImageUrl}')`;
            shadowInner.style.maskSize = config.sizing === 'stretch' ? '100% 100%' : 'cover';
            shadowInner.style.maskRepeat = 'no-repeat';
            shadowInner.style.maskPosition = 'center';
        };
        testMaskImage.onerror = function() {
            // If mask image fails to load, use a simple gradient fallback
            shadowInner.style.background = `radial-gradient(circle at center, ${config.color}, transparent)`;
            shadowInner.style.maskImage = 'none';
        };
        testMaskImage.src = maskImageUrl;
        
        shadowElement.appendChild(shadowInner);
        container.appendChild(shadowElement);

        // Create noise overlay with error handling
        if (config.noiseOpacity > 0 && !shouldDisableAnimations()) {
            const noiseOverlay = document.createElement('div');
            noiseOverlay.style.position = 'absolute';
            noiseOverlay.style.inset = '0';
            noiseOverlay.style.backgroundSize = `${config.noiseScale * 200}px`;
            noiseOverlay.style.backgroundRepeat = 'repeat';
            noiseOverlay.style.opacity = (config.noiseOpacity / 2).toString();
            
            // Test image loading before applying
            const testImage = new Image();
            testImage.onload = function() {
                noiseOverlay.style.backgroundImage = 'url("https://framerusercontent.com/images/g0QcWrxr87K0ufOxIUFBakwYA8.png")';
            };
            testImage.onerror = function() {
                // If image fails to load, just skip the noise overlay
                noiseOverlay.style.display = 'none';
            };
            testImage.src = 'https://framerusercontent.com/images/g0QcWrxr87K0ufOxIUFBakwYA8.png';
            
            container.appendChild(noiseOverlay);
        }

        // Start hue rotation animation (only if not disabled)
        if (animationEnabled && !shouldDisableAnimations()) {
            hueRotateValue = 0;
            const hueRotateDuration = animationDuration / 25;
            const startTime = Date.now();

            function animateHue() {
                // Check if animations should be disabled during animation
                if (shouldDisableAnimations()) {
                    pauseAnimation();
                    return;
                }
                
                const elapsed = Date.now() - startTime;
                hueRotateValue = (elapsed / hueRotateDuration) % 360;
                
                if (feColorMatrixElement) {
                    feColorMatrixElement.setAttribute('values', hueRotateValue.toString());
                }
                
                animationId = requestAnimationFrame(animateHue);
            }

            animateHue();
        } else if (animationEnabled && shouldDisableAnimations()) {
            // Animation is disabled, set static hue value
            if (feColorMatrixElement) {
                feColorMatrixElement.setAttribute('values', '0');
            }
        }

        // Setup connection monitoring
        setupConnectionMonitoring();
        
        isInitialized = true;
    }

    function cleanupEtherealShadow() {
        if (animationId !== null) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    // Expose functions globally
    window.initEtherealShadow = initEtherealShadow;
    window.cleanupEtherealShadow = cleanupEtherealShadow;
    window.setAnimationMode = function(mode) {
        if (mode === 'auto' || mode === 'enabled' || mode === 'disabled') {
            performanceMode = mode;
            if (shouldDisableAnimations()) {
                pauseAnimation();
            } else {
                resumeAnimation();
            }
        }
    };
    window.getAnimationMode = function() {
        return performanceMode;
    };
})();

