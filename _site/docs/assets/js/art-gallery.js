(function() {
    'use strict';

    // Gallery items configuration
    // You can add items here: images (url), Instagram embeds (instagram URL or embedCode), or YouTube embeds (youtube URL)
    const galleryItems = [
        // Example items - replace with your actual content
        { type: 'image', url: '/assets/images/GrumpyBunny.jpg' },
        { type: 'image', url: '/assets/images/BunnyInField.jpg' },
        { type: 'image', url: '/assets/images/BunnyFlowerHatInField2.jpg' },
        
        { type: 'image', url: '/assets/images/DSCF4330e~2.jpg' },
        { type: 'image', url: '/assets/images/PXL_20240104_180942765~4.jpg' },
        { type: 'image', url: '/assets/images/bunny!.jpg' },
        // { type: 'youtube', url: 'https://www.youtube.com/watch?v=EXAMPLE' },
    ];

    function createImageItem(item) {
        const container = document.createElement('div');
        container.className = 'gallery-item';
        
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.alt || 'Artwork';
        img.loading = 'lazy';
        
        // Let image size naturally
        img.style.width = '100%';
        img.style.height = 'auto';
        
        container.appendChild(img);
        return container;
    }

    function createInstagramEmbed(item) {
        const container = document.createElement('div');
        container.className = 'gallery-item instagram-embed';
        
        // Check if embed code is provided directly
        if (item.embedCode) {
            // Create a temporary div to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = item.embedCode.trim();
            
            // Find the blockquote element
            const blockquote = tempDiv.querySelector('blockquote.instagram-media');
            if (blockquote) {
                // Adjust styles for gallery display
                blockquote.style.width = '100%';
                blockquote.style.maxWidth = '100%';
                blockquote.style.margin = '0';
                container.appendChild(blockquote);
            } else {
                // If no blockquote found, insert the entire embed code (excluding script tags)
                const embedHTML = item.embedCode.trim();
                // Remove script tags from embed code (we'll load the script separately)
                const embedWithoutScript = embedHTML.replace(/<script[^>]*>.*?<\/script>/gis, '');
                container.innerHTML = embedWithoutScript;
            }
            
            // Check if embed script is in the embed code and load it if needed
            const hasEmbedScript = item.embedCode.includes('instagram.com/embed.js');
        } else if (item.url) {
            // Fallback to URL-based embed (original method)
            const blockquote = document.createElement('blockquote');
            blockquote.className = 'instagram-media';
            blockquote.setAttribute('data-instgrm-permalink', item.url);
            blockquote.setAttribute('data-instgrm-version', '14');
            blockquote.style.background = '#FFF';
            blockquote.style.border = '0';
            blockquote.style.borderRadius = '3px';
            blockquote.style.margin = '1px';
            blockquote.style.maxWidth = '540px';
            blockquote.style.minWidth = '326px';
            blockquote.style.padding = '0';
            blockquote.style.width = 'calc(100% - 2px)';
            
            container.appendChild(blockquote);
        } else {
            console.error('Instagram item must have either url or embedCode');
            return container;
        }
        
        // Load Instagram embed script if not already loaded
        if (!window.instgrm) {
            const script = document.createElement('script');
            script.async = true;
            script.src = '//www.instagram.com/embed.js';
            document.body.appendChild(script);
        }
        
        // Process embeds after a short delay to ensure DOM is ready and script is loaded
        setTimeout(() => {
            if (window.instgrm && window.instgrm.Embeds) {
                window.instgrm.Embeds.process();
            }
        }, 500);
        
        return container;
    }

    function createYouTubeEmbed(item) {
        const container = document.createElement('div');
        container.className = 'gallery-item youtube-embed';
        
        // Extract video ID from URL
        let videoId = '';
        const urlPatterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
            /youtube\.com\/watch\?.*v=([^&\n?#]+)/
        ];
        
        for (const pattern of urlPatterns) {
            const match = item.url.match(pattern);
            if (match) {
                videoId = match[1];
                break;
            }
        }
        
        if (!videoId) {
            console.error('Invalid YouTube URL:', item.url);
            return container;
        }
        
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${videoId}?modestbranding=1&rel=0`;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.frameBorder = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.minHeight = '400px';
        
        container.appendChild(iframe);
        return container;
    }

    function renderGallery() {
        const gallery = document.getElementById('art-gallery');
        if (!gallery) return;

        if (galleryItems.length === 0) {
            // If no items configured, show a message or load from data attribute
            const galleryData = gallery.getAttribute('data-items');
            if (galleryData) {
                try {
                    const items = JSON.parse(galleryData);
                    galleryItems.push(...items);
                } catch (e) {
                    console.error('Error parsing gallery data:', e);
                }
            }
        }

        galleryItems.forEach(item => {
            let galleryItem;
            
            switch (item.type) {
                case 'image':
                    galleryItem = createImageItem(item);
                    break;
                case 'instagram':
                    galleryItem = createInstagramEmbed(item);
                    break;
                case 'youtube':
                    galleryItem = createYouTubeEmbed(item);
                    break;
                default:
                    console.warn('Unknown gallery item type:', item.type);
                    return;
            }
            
            if (galleryItem) {
                gallery.appendChild(galleryItem);
            }
        });

        // Process Instagram embeds after a short delay to ensure script is loaded
        if (galleryItems.some(item => item.type === 'instagram')) {
            setTimeout(() => {
                if (window.instgrm) {
                    window.instgrm.Embeds.process();
                }
            }, 1000);
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderGallery);
    } else {
        renderGallery();
    }
})();

