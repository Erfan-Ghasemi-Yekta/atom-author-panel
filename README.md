# Unified Author Panel (Absolute Paths)

Structure (as requested):
- All HTML: /author-panel/*.html
  - /author-panel/login.html      (login)
  - /author-panel/index.html      (dashboard)
  - /author-panel/posts.html
  - /author-panel/authors.html
  - /author-panel/categories.html
  - /author-panel/tags.html
  - /author-panel/comments.html
  - /author-panel/medias.html
  - /author-panel/reactions.html
  - /author-panel/series.html

- All CSS: /css/
  - /css/author-login.css
  - /css/author-panel.css

- All JS: /js/
  - /js/author-login.js
  - /js/author-panel.js

Notes:
- Panel pages require localStorage token `atom_access`. If missing, redirect to /author-panel/login.html
- Login validates AuthorProfile (writer) by using token -> /api/users/users/me/ -> /api/blog/authors/{id}/

Compatibility:
- A redirect helper exists at /author-panel/author.html (redirects to dashboard).
  If you previously used /author.html, you should create a server redirect from /author.html to /author-panel/index.html
  (or keep a small /author.html file).
