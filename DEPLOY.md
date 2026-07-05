# ☕ 93 Coffee — Deployment Guide

## 🚀 الخيار الأفضل: Replit.com (مجاني بالكامل)

ما يحتاج كرت فيزا، ما يحتاج سيرفر، كل شيء شغال 24/7 مع SQLite.

---

### 1️⃣ انشر على Replit (أسهل طريقة)

1. **سجل حساب** في https://replit.com (بريد إلكتروني فقط)
2. **أنشئ مشروع جديد** → "Import from GitHub"
3. **ارفع الكود على GitHub أولاً:**

```bash
# من جهازك (أو Termux):
cd /data/data/com.termux/files/home
git init
git add .
git commit -m "☕ 93 coffee shop"
gh repo create 93coffee --public --push
# أو ارفع على https://github.com/new
```

4. **في Replit**: اختار "Import from GitHub" وحط رابط المستودع
5. **اضغط "Import"** — خلاص! الموقع شغال✨

> **للحفاظ على الخدمة شغالة 24/7**: سجل في https://uptimerobot.com (مجاني) وحط رابط Replit تبعك ليراقبه كل 5 دقائق.

---

### 2️⃣ بديل: Render.com (أيضاً مجاني)

1. **سجل حساب** في https://render.com
2. اربط GitHub
3. اختر "New Web Service" → اختر المستودع
4. إعدادات:
   - **Name**: `93coffee`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free
5. اضغط "Create Web Service"

⚠️ **ملاحظة**: Render.com المجاني يعيد تشغيل التطبيق كل فترة، مما قد يفقد البيانات في SQLite. يُنصح باستخدام Replit.

---

### 3️⃣ بديل: Railway.app

1. https://railway.app → GitHub → New Project
2. اختر المستودع
3. هيضبط الإعدادات تلقائياً
4. خلي Start Command: `node server.js`

---

## 🔧 ملفات المشروع

```
📁 93coffee/
├── server.js          # الخادم الرئيسي (Express + SQLite + JWT + SSE)
├── package.json       # إعدادات npm
├── public/
│   └── index.html     # الواجهة (64KB, كل شيء في ملف واحد)
├── data/
│   ├── shop.db        # قاعدة البيانات (SQLite)
│   └── .gitkeep       # عشان git يحفظ المجلد
└── .gitignore
```

## 🔑 أكواد الدخول

| الدور | الكود |
|-------|-------|
| 👑 المالك | `owner@123` |
| 👨‍💼 مسؤول | `admin@123` |

## 🌐 API

| المسار | الطريقة | شرح |
|--------|---------|------|
| `POST /api/auth` | Auth | تسجيل دخول → JWT token |
| `GET /api/products` | Products | قائمة المنتجات |
| `POST /api/products` | Products | إضافة منتج (مالك) |
| `DELETE /api/products/:id` | Products | حذف منتج (مالك) |
| `POST /api/orders` | Orders | إنشاء طلب جديد |
| `GET /api/orders` | Orders | كل الطلبات (تتطلب توكن) |
| `PATCH /api/orders/:id/status` | Orders | تحديث الحالة (إدارة) |
| `GET /api/orders/track/:id/:phone` | Track | تتبع طلب بالرقم والهاتف |
| `POST /api/messages` | Messages | إرسال رسالة |
| `GET /api/messages` | Messages | كل الرسائل (تتطلب توكن) |
| `GET /api/events` | SSE | اتصال مباشر للتحديثات اللحظية |
