// Mobile menu handler for touch devices
(function() {
    'use strict';
    
    // Check if device is touch-enabled
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (isTouchDevice) {
        const menuWrappers = document.querySelectorAll('.menu-wrapper');
        
        menuWrappers.forEach(function(menuWrapper) {
            const menuText = menuWrapper.querySelector('.menu-text');
            const menuDropdown = menuWrapper.querySelector('.menu-dropdown');
            
            if (menuText && menuDropdown) {
                // Toggle menu on click/touch
                menuText.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Close other open menus
                    menuWrappers.forEach(function(otherWrapper) {
                        if (otherWrapper !== menuWrapper) {
                            const otherDropdown = otherWrapper.querySelector('.menu-dropdown');
                            if (otherDropdown) {
                                otherDropdown.classList.remove('menu-open');
                            }
                        }
                    });
                    
                    // Toggle current menu
                    menuDropdown.classList.toggle('menu-open');
                });
                
                // Close menu when clicking outside
                document.addEventListener('click', function(e) {
                    if (!menuWrapper.contains(e.target)) {
                        menuDropdown.classList.remove('menu-open');
                    }
                });
                
                // Close menu when clicking a menu item
                const menuItems = menuDropdown.querySelectorAll('.menu-item');
                menuItems.forEach(function(item) {
                    item.addEventListener('click', function() {
                        menuDropdown.classList.remove('menu-open');
                    });
                });
            }
        });
    }
})();

