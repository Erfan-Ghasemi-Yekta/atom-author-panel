# Unified Author Panel (Absolute Paths) - Fixed

- All HTML: /author-panel/*.html
  - /author-panel/login.html      (writer login)
  - /author-panel/index.html      (dashboard - styled like your screenshot)
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
- Panel pages require localStorage `atom_access`. If missing => redirect to /author-panel/login.html
- Login validates AuthorProfile via token -> /api/users/users/me/ -> /api/blog/authors/{id}/
