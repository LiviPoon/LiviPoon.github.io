(function() {
    'use strict';

    function loadBlogPosts() {
        const blogIndex = document.getElementById('blog-index');
        if (!blogIndex) return;

        // Fetch the blog posts JSON file
        fetch('/assets/data/blog-posts.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load blog posts');
                }
                return response.json();
            })
            .then(posts => {
                if (posts.length === 0) {
                    blogIndex.innerHTML = '<p class="blog-empty">No blog posts yet. Check back soon!</p>';
                    return;
                }

                // Sort posts by date (newest first)
                posts.sort((a, b) => new Date(b.date) - new Date(a.date));

                // Generate HTML for each post
                blogIndex.innerHTML = posts.map(post => {
                    return `
                        <article class="blog-post-preview">
                            <div class="blog-preview-content">
                                <h2 class="blog-preview-title">
                                    <a href="${post.url}">${escapeHtml(post.title)}</a>
                                </h2>
                                <div class="blog-preview-excerpt">
                                    ${escapeHtml(post.excerpt)}
                                </div>
                                <a href="${post.url}" class="blog-read-more">Read more →</a>
                            </div>
                        </article>
                    `;
                }).join('');
            })
            .catch(error => {
                console.error('Error loading blog posts:', error);
                blogIndex.innerHTML = '<p class="blog-empty">Error loading blog posts. Please try again later.</p>';
            });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Load blog posts when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadBlogPosts);
    } else {
        loadBlogPosts();
    }
})();

