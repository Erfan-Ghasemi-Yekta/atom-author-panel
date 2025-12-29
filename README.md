# پنل نویسنده (Front-end) — Atom Game

این پروژه یک پنل مدیریتی ساده با HTML/CSS/JS خالص است که با API های داخل فایل `Atom Game API.yaml` کار می‌کند.

## صفحات
- `index.html` (Login + Dashboard)
- `posts.html`
- `Categories.html`
- `Tags.html`
- `Author profiles.html`

## احراز هویت (JWT)
- Login: `POST /api/token/` (اولویت)
- Refresh: `POST /api/token/refresh/`
- Fallback login: `POST /api/users/auth/admin-login/`

توکن‌ها در `localStorage` ذخیره می‌شوند.

## تنظیم Base URL
در فایل `app.js` مقدار زیر را تنظیم کنید (اگر بک‌اند روی دامنه دیگری است):

```js
const API_BASE = "https://YOUR_DOMAIN";
```

اگر فرانت و بک‌اند روی یک دامنه هستند، خالی بگذارید.

## نکته‌ی CORS
اگر صفحات را از دامنه/پورت دیگری باز می‌کنید، بک‌اند باید CORS را برای آن Origin فعال کرده باشد.

## اجرا
این پروژه Static است. کافی است فایل‌ها را روی هاست قرار دهید یا با یک Static Server اجرا کنید.

> اگر مستقیم با `file://` باز کنید ممکن است برخی مرورگرها محدودیت‌هایی برای `fetch` داشته باشند.
