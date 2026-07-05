# ☕ 93 Coffee — Deployment Guide

## 🚀 جاهز للنشر! اختر منصة:

---

### ✅ أسهل طريقة: Render (مجاني، انقر مرة واحدة)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/alhajjemohammad44-stack/93-coffee-shop)

1. **اضغط الزر أعلاه** ☝️
2. **سجل حساب** في Render (جيميل فقط)
3. **اختر "Free" plan**
4. **اضغط "Create Web Service"**
5. **انتظر 2-3 دقائق**... 🎉

> التطبيق جاهز مع `render.yaml`، كل الإعدادات مضبوطة مسبقاً!

---

### ✅ بديل: Fly.io (مجاني، 3 VM + 3GB تخزين)

```bash
# بعد تثبيت flyctl:
flyctl auth login
flyctl launch --from https://github.com/alhajjemohammad44-stack/93-coffee-shop
flyctl deploy
```

---

### ✅ بديل: Railway.app (مجاني)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/alhajjemohammad44-stack/93-coffee-shop)

---

### ✅ بديل: Replit (مجاني بالكامل)

1. https://replit.com → **Create Repl** → **Import from GitHub**
2. الصق رابط المستودع: `https://github.com/alhajjemohammad44-stack/93-coffee-shop`
3. **Import** → الموقع شغال فوراً!
4. للحفاظ عليه 24/7: استخدم https://uptimerobot.com (مجاني)

---

## 🔑 أكواد الدخول

| الدور | الكود | الصلاحيات |
|-------|-------|-----------|
| 👑 **المالك** (Owner) | `owner@123` | إدارة المنتجات، الطلبات، الرسائل |
| 👨‍💼 **مسؤول** (Admin) | `admin@123` | إدارة الطلبات، الرسائل |

## 🌐 API Reference

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/auth` | No | Login → JWT token |
| GET | `/api/products` | No | List all products |
| POST | `/api/products` | Yes (owner) | Add product |
| DELETE | `/api/products/:id` | Yes (owner) | Delete product |
| DELETE | `/api/products` | Yes (owner) | Delete all products |
| POST | `/api/orders` | No | Create order |
| GET | `/api/orders` | Yes (admin/owner) | List all orders |
| PATCH | `/api/orders/:id/status` | Yes (admin/owner) | Update order status |
| DELETE | `/api/orders/:id` | Yes (admin/owner) | Delete order |
| GET | `/api/orders/track/:id/:phone` | No | Track order |
| POST | `/api/messages` | No | Send message |
| GET | `/api/messages` | Yes (admin/owner) | List all messages |
| PATCH | `/api/messages/:id/read` | Yes (admin/owner) | Mark message read |
| GET | `/api/events` | No | SSE real-time events |

## 📁 Project Structure

```
server.js          # Express server with SQL.js + JWT + SSE
public/index.html  # Single-page frontend (64KB)
package.json       # Node.js config
render.yaml        # Render deployment config
Dockerfile         # Docker setup
.gitignore
DEPLOY.md
```

## ⚙️ Environment

- `PORT` — Server port (default: `3456`, Render sets it to `10000`)
- SQLite database auto-created at `data/shop.db`
