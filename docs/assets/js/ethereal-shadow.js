(function() {
    'use strict';
    
    let animationId = null;
    let hueRotateValue = 0;
    let feColorMatrixElement = null;
    let isInitialized = false;

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
        shadowInner.style.maskImage = `url('https://framerusercontent.com/images/ceBGguIpUU8luwByxuQz79t7To.png')`;
        shadowInner.style.maskSize = config.sizing === 'stretch' ? '100% 100%' : 'cover';
        shadowInner.style.maskRepeat = 'no-repeat';
        shadowInner.style.maskPosition = 'center';
        shadowInner.style.width = '100%';
        shadowInner.style.height = '100%';
        
        shadowElement.appendChild(shadowInner);
        container.appendChild(shadowElement);

        // Create noise overlay
        if (config.noiseOpacity > 0) {
            const noiseOverlay = document.createElement('div');
            noiseOverlay.style.position = 'absolute';
            noiseOverlay.style.inset = '0';
            noiseOverlay.style.backgroundImage = 'url("https://framerusercontent.com/images/g0QcWrxr87K0ufOxIUFBakwYA8.png")';
            noiseOverlay.style.backgroundSize = `${config.noiseScale * 200}px`;
            noiseOverlay.style.backgroundRepeat = 'repeat';
            noiseOverlay.style.opacity = (config.noiseOpacity / 2).toString();
            container.appendChild(noiseOverlay);
        }

        // Start hue rotation animation
        if (animationEnabled) {
            hueRotateValue = 0;
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
        }

        isInitialized = true;
    }

    function cleanupEtherealShadow() {
        if (animationId !== null) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    // Expose init function globally
    window.initEtherealShadow = initEtherealShadow;
    window.cleanupEtherealShadow = cleanupEtherealShadow;
})();

