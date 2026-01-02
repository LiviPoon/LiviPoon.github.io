# Livi Poon - Personal Website

A static website showcasing research, art, and blog content.

## Structure

- `docs/` - Main website files
  - `index.html` - Homepage
  - `research/` - Research page
  - `art/` - Art gallery page
  - `blog/` - Blog index and posts
  - `assets/` - CSS, JavaScript, images, and data files

## Adding New Blog Posts

The blog index automatically generates from a JSON file. To add a new blog post:

### Step 1: Create the Blog Post HTML File

Create a new HTML file in `docs/blog/posts/` directory. You can use the existing post as a template:

```html
<!DOCTYPE html>
<html lang="en-US">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Your Post Title</title>
    <link rel="stylesheet" href="/assets/css/main.css">
    <!-- ... rest of head ... -->
</head>
<body class="page-loading">
    <!-- ... post content ... -->
</body>
</html>
```

### Step 2: Add Entry to blog-posts.json

Edit `docs/assets/data/blog-posts.json` and add a new entry:

```json
{
    "title": "Your Post Title",
    "url": "/blog/posts/your-post-filename.html",
    "excerpt": "A brief description or excerpt of your post...",
    "date": "2025-12-20"
}
```

**Important Notes:**
- Posts are automatically sorted by date (newest first)
- Date format: `YYYY-MM-DD`
- The `url` should match the path to your HTML file
- The `excerpt` will be displayed on the blog index page

### Example

If you create a file `docs/blog/posts/my-article.html`, add this to `blog-posts.json`:

```json
{
    "title": "My Article",
    "url": "/blog/posts/my-article.html",
    "excerpt": "This is a fascinating article about...",
    "date": "2025-12-25"
}
```

The blog index will automatically update to include your new post!

## Development

This is a static website with no build process required. Simply serve the `docs/` directory using any web server.

### Local Development

You can use Python's built-in server:

```bash
cd docs
python3 -m http.server 8000
```

Then visit `http://localhost:8000` in your browser.

## File Structure

```
docs/
├── index.html              # Homepage
├── 404.html                # 404 error page
├── assets/
│   ├── css/
│   │   └── main.css        # Main stylesheet
│   ├── js/
│   │   ├── blog-index.js   # Blog index generator
│   │   ├── ethereal-shadow.js
│   │   ├── scroll-handler.js
│   │   └── ...
│   ├── images/             # Image assets
│   └── data/
│       └── blog-posts.json # Blog posts metadata
├── blog/
│   ├── index.html          # Blog index page
│   └── posts/              # Individual blog post HTML files
├── research/
│   └── index.html          # Research page
└── art/
    └── index.html          # Art gallery page
```
