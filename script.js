// =====================================================================
//  Monster PVP — script.js
//  ملاحظة: إعدادات الديسكورد (CLIENT_ID و REDIRECT_URI) لم تعد ثابتة هنا
//  بل تُجلب من السيرفر عبر /api/config لتطابق ملف .env دائماً
// =====================================================================

let DISCORD_AUTH_URL = null;

// جلب إعدادات الديسكورد من السيرفر وبناء رابط تسجيل الدخول
async function loadDiscordConfig() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();

        const redirectUri = config.redirectUri || (window.location.origin + window.location.pathname);
        DISCORD_AUTH_URL = `https://discord.com/api/oauth2/authorize?client_id=${config.discordClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=identify`;
    } catch (err) {
        console.error('⚠️ تعذر جلب إعدادات الديسكورد من السيرفر:', err);
    }
}

// عند تحميل الصفحة في المتصفح
document.addEventListener("DOMContentLoaded", async () => {
    await loadDiscordConfig();
    handleDiscordCallback();
    renderAuthWidget();
    if (document.getElementById("cart-items-list")) {
        loadCartItems();
    }
});

// التعامل مع السلة وإضافة المنتجات إليها
function addToCart(name, price) {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    cart.push({ name, price });
    localStorage.setItem('cart', JSON.stringify(cart));
    window.location.href = 'cart.html';
}

// دالة فحص الـ Token القادم من ديسكورد لتسجيل الدخول
function handleDiscordCallback() {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get("access_token");

    if (accessToken) {
        window.history.replaceState({}, document.title, window.location.pathname);

        fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${accessToken}` }
        })
        .then(res => res.json())
        .then(user => {
            if (user.id) {
                localStorage.setItem("discord_user", JSON.stringify(user));
                renderAuthWidget();
                showToast(`👋 مرحباً بك، ${user.username}`, "success");
            }
        })
        .catch(err => console.error("Error connecting to Discord:", err));
    }
}

// دالة عرض حالة الحساب (زر تسجيل الدخول أو البروفايل) بجانب القائمة
function renderAuthWidget() {
    const widget = document.getElementById("auth-widget");
    if (!widget) return;

    const user = JSON.parse(localStorage.getItem("discord_user"));

    if (user) {
        const avatarUrl = user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/0.png`;

        widget.innerHTML = `
            <div class="user-profile-widget">
                <img src="${avatarUrl}" alt="${user.username}" class="user-avatar">
                <span class="user-name">${user.username}</span>
                <span class="logout-btn" title="تسجيل الخروج" onclick="logoutDiscord()">❌</span>
            </div>
        `;
    } else {
        widget.innerHTML = `
            <a href="${DISCORD_AUTH_URL || '#'}" class="discord-login-btn">
                <svg width="16" height="16" viewBox="0 0 127.14 96.36" fill="#fff"><path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a74.37,74.37,0,0,0,6.72-11A68.6,68.6,0,0,1,28.32,80c.91-.67,1.81-1.37,2.67-2.1a75.22,75.22,0,0,0,92.3,0c.86.73,1.76,1.43,2.67,2.1a68.86,68.86,0,0,1-10.42,5.39,75.1,75.1,0,0,0,6.72,11,105.73,105.73,0,0,0,31-18.83C129.11,50.15,123.3,27.32,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/></svg>
                تسجيل الدخول
            </a>
        `;
    }
}

// دالة تسجيل الخروج
function logoutDiscord() {
    localStorage.removeItem("discord_user");
    renderAuthWidget();
    showToast("تم تسجيل الخروج بنجاح", "error");
}

// تحميل وعرض منتجات السلة
function loadCartItems() {
    const cartList = document.getElementById("cart-items-list");
    const cart = JSON.parse(localStorage.getItem('cart')) || [];

    if (cart.length === 0) {
        cartList.innerHTML = `<div class="cart-empty-text">سلتك فارغة حالياً 🛒</div>`;
    } else {
        cartList.innerHTML = cart.map(item => `
            <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(0,255,136,0.1);">
                <span style="font-weight: bold; color: #00ff88;">${item.name}</span>
                <span style="font-weight: bold;">${item.price} $</span>
            </div>
        `).join('');
    }
}

// تصفير السلة
function clearCart() {
    localStorage.removeItem('cart');
    loadCartItems();
    showToast("تم تفريغ السلة بنجاح", "error");
}

/* ==================== الشروط المطلوبة عند تأكيد الطلب ==================== */
function processOrderConfirmation() {
    const user = JSON.parse(localStorage.getItem('discord_user'));
    const cart = JSON.parse(localStorage.getItem('cart')) || [];

    // 1. شرط تسجيل الدخول
    if (!user) {
        showToast("من فضلك قم بتسجيل الدخول أولاً", "error");
        return;
    }

    // 2. شرط أن السلة فارغة ولم يضف شيء
    if (cart.length === 0) {
        showToast("يرجى اختيار منتجك لاستكمال الطلب", "error");
        return;
    }

    // في حال نجاح الشروط كاملة يتم التوجيه لصفحة الفورم المخصصة لتأكيد الطلب
    showToast(`✅ جاري تحضير طلبك يا ${user.username}...`, "success");
    setTimeout(() => {
        window.location.href = 'checkout.html'; // التوجيه لملف تأكيد الطلب
    }, 1500);
}

// دالة إظهار إشعارات الـ Toast الاحترافية
function showToast(message, type = "success") {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 5000);
}
