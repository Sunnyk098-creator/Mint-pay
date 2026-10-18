/**
 * MintPay 3D Engine - Complete Multi-User Creator-Linked Architecture
 * FIXED: 100% Anti-Blank-Screen Instant Render Guard & Safe Fallback
 */

// =========================================================================
// 0. FIREBASE REALTIME DATABASE CONFIGURATION (SAFE INIT)
// =========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyB_aUTy7Kvzo-Ct44MZ062MFcpDOnQ4WxU",
    databaseURL: "https://mint-pay-904ef-default-rtdb.firebaseio.com",
    projectId: "mint-pay-904ef",
    storageBucket: "mint-pay-904ef.firebasestorage.app",
    messagingSenderId: "76118936092",
    appId: "1:76118936092:web:fc40baa414665d89aeedd9"
};

let db = null;
try {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps || !firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.database();
    }
} catch (fbErr) {
    console.warn("Firebase init guard active:", fbErr);
}

const HOSTED_DOMAIN = window.location.origin && window.location.origin !== "null"
    ? window.location.origin
    : "https://mint-pay.vercel.app";
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycby1NynPfPfcwycVaO6TUC9qJ0fmnsseCEl_KKD9Mmi6TJChk72bs_oPGODH2qykIjSZ/exec";

// High-Res Default SVG Avatar
const DEFAULT_AVATAR_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%2310b981'/><circle cx='50' cy='38' r='18' fill='%23ffffff'/><path d='M20,85 C20,62 35,58 50,58 C65,58 80,62 80,85 Z' fill='%23ffffff'/></svg>";

// Local Logged-in Merchant Session State
let CURRENT_UID = localStorage.getItem('mp_uid') || null;
let MERCHANT = localStorage.getItem('mp_merchant') || "Sunny Kumar";
let UPI_ID = localStorage.getItem('mp_upi') || "sunnypro@fam";
let USER_PHONE = localStorage.getItem('mp_phone') || "9876543210";
let USER_EMAIL = localStorage.getItem('mp_email') || "merchant@mintpay.com";
let USER_PHOTO = localStorage.getItem('mp_photo') || DEFAULT_AVATAR_SVG;
let USER_GAS_URL = localStorage.getItem('mp_gas_url') || DEFAULT_GAS_URL;
let USER_QR_STYLE = localStorage.getItem('mp_qr_style') || "tree";
let USER_API_TOKEN = localStorage.getItem('mp_api_token') || generateRandomToken();
let USER_API_ENABLED = localStorage.getItem('mp_api_enabled') !== 'false';

// Active Transaction State
let currentAmountStr = "0";
let currentTxnNote = "MintPay_Order";
let currentActiveTxnId = null;
let activeBillPayload = null;
let timerInterval = null;
let qrStartTimeMs = 0;

let IS_HOSTED_CHECKOUT_MODE = false;

// Creator Context Variables for Hosted Checkout
let activeCreatorUid = null;
let activeCreatorGasUrl = DEFAULT_GAS_URL;
let activeCreatorName = "Sunny Kumar";
let activeCreatorUpi = "sunnypro@fam";
let activeCreatorPhoto = DEFAULT_AVATAR_SVG;
let activeCreatorQrStyle = "tree";
let activeCreatorEmail = "merchant@mintpay.com";

// DOM Elements
const liveAmount = document.getElementById("liveAmount");
const qrAmtHero = document.getElementById("qrAmtHero");
const countdownTimer = document.getElementById("countdownTimer");
const toast = document.getElementById("toast");

function generateRandomToken() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let tok = 'mp_live_';
    for (let i = 0; i < 20; i++) {
        tok += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    localStorage.setItem('mp_api_token', tok);
    return tok;
}

// =========================================================================
// 1. DATABASE AUTH (SIGN IN & SIGN UP)
// =========================================================================
function switchAuthTab(mode) {
    const isLogin = mode === 'login';
    const tabLoginBtn = document.getElementById('tabLoginBtn');
    const tabSignupBtn = document.getElementById('tabSignupBtn');
    const loginFormBox = document.getElementById('loginFormBox');
    const signupFormBox = document.getElementById('signupFormBox');

    if (tabLoginBtn) tabLoginBtn.classList.toggle('active', isLogin);
    if (tabSignupBtn) tabSignupBtn.classList.toggle('active', !isLogin);
    if (loginFormBox) loginFormBox.style.display = isLogin ? 'block' : 'none';
    if (signupFormBox) signupFormBox.style.display = isLogin ? 'none' : 'block';
}

function validatePasswordRules(pass) {
    if (!pass) pass = "";
    const isLen = pass.length >= 8;
    const isNum = /[0-9]/.test(pass);
    const isUpper = /[A-Z]/.test(pass);
    const isSpecial = /[@#$%^&*!_~-]/.test(pass);

    const rLen = document.getElementById('ruleLen');
    const rNum = document.getElementById('ruleNum');
    const rUpper = document.getElementById('ruleUpper');
    const rSpecial = document.getElementById('ruleSpecial');

    if (rLen) rLen.classList.toggle('valid', isLen);
    if (rNum) rNum.classList.toggle('valid', isNum);
    if (rUpper) rUpper.classList.toggle('valid', isUpper);
    if (rSpecial) rSpecial.classList.toggle('valid', isSpecial);

    return isLen && isNum && isUpper && isSpecial;
}

async function handleDatabaseSignup() {
    const nameEl = document.getElementById('regName');
    const phoneEl = document.getElementById('regNumber');
    const emailEl = document.getElementById('regEmail');
    const upiEl = document.getElementById('regUpi');
    const passEl = document.getElementById('regPass');
    const confirmPassEl = document.getElementById('regConfirmPass');

    const name = nameEl ? nameEl.value.trim() : "";
    const phone = phoneEl ? phoneEl.value.trim() : "";
    const email = emailEl ? emailEl.value.trim().toLowerCase() : "";
    const upi = upiEl ? upiEl.value.trim() : "";
    const pass = passEl ? passEl.value : "";
    const confirmPass = confirmPassEl ? confirmPassEl.value : "";

    if (!name || !phone || !email || !upi || !pass) {
        showToast("⚠️ All fields are required!");
        return;
    }
    if (!upi.includes('@')) {
        showToast("⚠️ Enter valid UPI ID (e.g. sunnypro@fam)");
        return;
    }
    if (!validatePasswordRules(pass)) {
        showToast("⚠️ Password does not meet security rules!");
        return;
    }
    if (pass !== confirmPass) {
        showToast("⚠️ Passwords do not match!");
        return;
    }

    showToast("⏳ Creating Merchant Account...");

    try {
        let users = {};
        if (db) {
            const usersSnap = await db.ref('users').once('value');
            users = usersSnap.val() || {};
        }

        for (const uid in users) {
            if (users[uid].email === email) {
                showToast("⚠️ Email already registered! Please Login.");
                return;
            }
            if (users[uid].phone === phone) {
                showToast("⚠️ Mobile number already registered!");
                return;
            }
        }

        const newUid = "usr_" + Date.now();
        const apiTok = generateRandomToken();

        const newUserData = {
            uid: newUid,
            merchantName: name,
            phone: phone,
            email: email,
            upiId: upi,
            password: pass,
            photo: DEFAULT_AVATAR_SVG,
            gasUrl: DEFAULT_GAS_URL,
            qrStyle: "tree",
            apiToken: apiTok,
            apiEnabled: true,
            createdAt: new Date().toISOString()
        };

        if (db) {
            await db.ref('users/' + newUid).set(newUserData);
            await db.ref('tokens/' + apiTok).set({
                uid: newUid,
                merchantName: name,
                email: email,
                upiId: upi,
                photo: DEFAULT_AVATAR_SVG,
                gasUrl: DEFAULT_GAS_URL,
                qrStyle: "tree",
                apiEnabled: true
            });
        }

        CURRENT_UID = newUid;
        MERCHANT = name;
        USER_PHONE = phone;
        USER_EMAIL = email;
        UPI_ID = upi;
        USER_PHOTO = DEFAULT_AVATAR_SVG;
        USER_GAS_URL = DEFAULT_GAS_URL;
        USER_QR_STYLE = "tree";
        USER_API_TOKEN = apiTok;
        USER_API_ENABLED = true;
        persistSession();

        syncUIWithState();
        showScreen('home');
        showToast("🎉 Account created successfully!");
    } catch (err) {
        showToast("⚠️ Signup Failed: " + (err.message || err));
    }
}

async function handleDatabaseLogin() {
    const idEl = document.getElementById('loginIdentifier');
    const passEl = document.getElementById('loginPassword');

    const identifier = idEl ? idEl.value.trim().toLowerCase() : "";
    const pass = passEl ? passEl.value : "";

    if (!identifier || !pass) {
        showToast("⚠️ Please enter Email/Phone and Password!");
        return;
    }

    showToast("🔐 Logging in...");

    try {
        let users = {};
        if (db) {
            const usersSnap = await db.ref('users').once('value');
            users = usersSnap.val() || {};
        }

        let matchedUser = null;
        for (const uid in users) {
            const u = users[uid];
            if (u && ((u.email && u.email.toLowerCase() === identifier) || (u.phone && u.phone === identifier))) {
                if (u.password === pass) {
                    matchedUser = u;
                    break;
                } else {
                    showToast("❌ Incorrect Password!");
                    return;
                }
            }
        }

        if (!matchedUser) {
            showToast("⚠️ Account not found. Please Sign Up!");
            return;
        }

        CURRENT_UID = matchedUser.uid;
        MERCHANT = matchedUser.merchantName || "Sunny Kumar";
        USER_PHONE = matchedUser.phone || "9876543210";
        USER_EMAIL = matchedUser.email || identifier;
        UPI_ID = matchedUser.upiId || "sunnypro@fam";
        USER_PHOTO = matchedUser.photo || DEFAULT_AVATAR_SVG;
        USER_GAS_URL = matchedUser.gasUrl || DEFAULT_GAS_URL;
        USER_QR_STYLE = matchedUser.qrStyle || "tree";
        USER_API_TOKEN = matchedUser.apiToken || generateRandomToken();
        USER_API_ENABLED = matchedUser.apiEnabled !== undefined ? matchedUser.apiEnabled : true;

        if (matchedUser.transactions) {
            const txArr = Array.isArray(matchedUser.transactions)
                ? matchedUser.transactions.filter(item => item && typeof item === 'object')
                : Object.values(matchedUser.transactions).filter(item => item && typeof item === 'object');
            localStorage.setItem('mp_transactions', JSON.stringify(txArr));
        }

        persistSession();
        syncUIWithState();
        showScreen('home');
        showToast("👋 Welcome back, " + MERCHANT + "!");
        pingUserGasBackend(false);
    } catch (err) {
        showToast("⚠️ Login Failed: " + (err.message || err));
    }
}

function persistSession() {
    try {
        localStorage.setItem('mp_logged_in', 'true');
        localStorage.setItem('mp_uid', CURRENT_UID || '');
        localStorage.setItem('mp_merchant', MERCHANT || '');
        localStorage.setItem('mp_phone', USER_PHONE || '');
        localStorage.setItem('mp_email', USER_EMAIL || '');
        localStorage.setItem('mp_upi', UPI_ID || '');
        localStorage.setItem('mp_photo', USER_PHOTO || DEFAULT_AVATAR_SVG);
        localStorage.setItem('mp_gas_url', USER_GAS_URL || DEFAULT_GAS_URL);
        localStorage.setItem('mp_qr_style', USER_QR_STYLE || 'tree');
        localStorage.setItem('mp_api_token', USER_API_TOKEN || '');
        localStorage.setItem('mp_api_enabled', String(USER_API_ENABLED));
    } catch (e) {}
}

function logoutGateway() {
    try {
        localStorage.removeItem('mp_logged_in');
    } catch (e) {}
    CURRENT_UID = null;
    showToast("Logged out safely");
    showScreen('auth');
}

// =========================================================================
// 2. PROFILE DP UPLOAD & UI SYNC
// =========================================================================
function handleProfileImageUpload(event) {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
        showToast("⚠️ Image size should be under 3MB");
        return;
    }

    showToast("⏳ Uploading Profile DP...");
    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Data = e.target.result;
        USER_PHOTO = base64Data;
        try {
            localStorage.setItem('mp_photo', USER_PHOTO);
        } catch (err) {}

        updateAllAvatars(USER_PHOTO);

        if (CURRENT_UID && db) {
            try {
                await db.ref('users/' + CURRENT_UID).update({ photo: base64Data });
                await db.ref('tokens/' + USER_API_TOKEN).update({ photo: base64Data });
            } catch (err) {}
        }
        showToast("✅ Profile DP Updated Everywhere!");
    };
    reader.readAsDataURL(file);
}

function updateAllAvatars(photoSrc) {
    const validSrc = photoSrc || DEFAULT_AVATAR_SVG;
    ['dashAvatarImg', 'profAvatarImg', 'qrBrandAvatar', 'billLogoImg'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.src = validSrc;
            el.onerror = function() {
                this.onerror = null;
                this.src = DEFAULT_AVATAR_SVG;
            };
        }
    });
}

function syncUIWithState() {
    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val !== undefined ? val : "";
    };
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val !== undefined ? val : "";
    };

    setTxt('dashMerchantName', MERCHANT);
    setTxt('dashMerchantUpi', UPI_ID);
    setTxt('profHeaderName', MERCHANT);
    setTxt('profHeaderUpi', `VIP Merchant • ${UPI_ID}`);
    setTxt('profHeaderPhone', `Mobile: ${USER_PHONE}`);
    setTxt('qrMerchantName', MERCHANT);
    setTxt('qrMerchantUpi', UPI_ID);
    setTxt('failMerchantUpi', UPI_ID);
    setTxt('numpadSubText', `Direct credit to ${MERCHANT}`);
    setTxt('procSubUpi', `Rendering ${(USER_QR_STYLE || 'tree').toUpperCase()} QR for ${UPI_ID}`);

    const styleLabelMap = { tree: "3D Tree QR Active", static: "Static QR Active", animated: "Animated QR Active" };
    setTxt('currentQrBadgeStyle', styleLabelMap[USER_QR_STYLE] || "3D Tree QR Active");

    setVal('setMerchantName', MERCHANT);
    setVal('setMerchantPhone', USER_PHONE);
    setVal('setMerchantUpi', UPI_ID);
    setVal('setGasUrl', USER_GAS_URL);
    setVal('merchantApiKeyInput', USER_API_TOKEN);

    handleQrStyleChange(USER_QR_STYLE, false);
    updateAllAvatars(USER_PHOTO);

    updateApiSwitchUI();
    updateApiEndpointPreviews();
    renderDashboardData();
}

function handleQrStyleChange(styleKey, doSave = true) {
    const key = (styleKey || "tree").toLowerCase();
    USER_QR_STYLE = key;

    ['qrStyleTreeLabel', 'qrStyleStaticLabel', 'qrStyleAnimatedLabel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    if (key === 'tree' || key.includes('tree')) {
        const el = document.getElementById('qrStyleTreeLabel');
        if (el) el.classList.add('active');
    } else if (key === 'static') {
        const el = document.getElementById('qrStyleStaticLabel');
        if (el) el.classList.add('active');
    } else if (key === 'animated') {
        const el = document.getElementById('qrStyleAnimatedLabel');
        if (el) el.classList.add('active');
    }

    if (doSave) {
        try {
            localStorage.setItem('mp_qr_style', USER_QR_STYLE);
        } catch (e) {}
        if (CURRENT_UID && db) {
            try {
                db.ref('users/' + CURRENT_UID).update({ qrStyle: USER_QR_STYLE });
                db.ref('tokens/' + USER_API_TOKEN).update({ qrStyle: USER_QR_STYLE });
            } catch (e) {}
        }
        showToast(`✨ Selected Style: ${USER_QR_STYLE.toUpperCase()} QR`);
    }
}

async function saveProfileSettings() {
    const nameEl = document.getElementById('setMerchantName');
    const phoneEl = document.getElementById('setMerchantPhone');
    const upiEl = document.getElementById('setMerchantUpi');
    const gasEl = document.getElementById('setGasUrl');

    const name = nameEl ? nameEl.value.trim() : "";
    const phone = phoneEl ? phoneEl.value.trim() : "";
    const upi = upiEl ? upiEl.value.trim() : "";
    const gas = gasEl ? gasEl.value.trim() : "";

    if (!name || !upi) {
        showToast("⚠️ Name and UPI ID are required!");
        return;
    }

    MERCHANT = name;
    USER_PHONE = phone;
    UPI_ID = upi;
    USER_GAS_URL = gas || DEFAULT_GAS_URL;
    persistSession();

    if (CURRENT_UID && db) {
        try {
            await db.ref('users/' + CURRENT_UID).update({
                merchantName: MERCHANT,
                phone: USER_PHONE,
                upiId: UPI_ID,
                gasUrl: USER_GAS_URL,
                qrStyle: USER_QR_STYLE
            });
            await db.ref('tokens/' + USER_API_TOKEN).update({
                merchantName: MERCHANT,
                upiId: UPI_ID,
                gasUrl: USER_GAS_URL,
                qrStyle: USER_QR_STYLE,
                photo: USER_PHOTO,
                apiEnabled: USER_API_ENABLED
            });
        } catch (e) {}
    }

    syncUIWithState();
    showToast("✅ Profile & Settings Saved!");
}

// =========================================================================
// 3. DELETE ALL TRANSACTIONS
// =========================================================================
function openDeleteAllConfirmModal() {
    const el = document.getElementById('deleteAllModal');
    if (el) el.classList.add('active');
}

function closeDeleteAllModal() {
    const el = document.getElementById('deleteAllModal');
    if (el) el.classList.remove('active');
}

async function confirmDeleteAllTransactions() {
    closeDeleteAllModal();
    showToast("🗑️ Deleting all records...");

    try {
        localStorage.removeItem('mp_transactions');
    } catch (e) {}

    if (CURRENT_UID && db) {
        try {
            await db.ref('users/' + CURRENT_UID + '/transactions').remove();
        } catch (e) {}
    }

    renderDashboardData();
    showToast("✅ All records deleted from Database!");
}

function getStoredTxns() {
    try {
        const raw = localStorage.getItem('mp_transactions');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.filter(item => item && typeof item === 'object');
            }
            if (parsed && typeof parsed === 'object') {
                return Object.values(parsed).filter(item => item && typeof item === 'object');
            }
        }
    } catch (e) {}
    return [];
}

function saveStoredTxns(list) {
    const cleanList = (list || []).filter(item => item && typeof item === 'object');
    try {
        localStorage.setItem('mp_transactions', JSON.stringify(cleanList));
    } catch (e) {}

    if (CURRENT_UID && db) {
        try {
            db.ref('users/' + CURRENT_UID + '/transactions').set(cleanList.slice(0, 30));
        } catch (e) {}
    }
    renderDashboardData();
}

function renderDashboardData() {
    const list = getStoredTxns();
    const completed = list.filter(t => t && t.status === 'COMPLETED');
    const totalVol = completed.reduce((acc, item) => acc + Number(item.amount || 0), 0);

    const volEl = document.getElementById('statTotalVol');
    const countEl = document.getElementById('statTotalCount');
    if (volEl) volEl.innerText = `₹${totalVol.toFixed(1)}`;
    if (countEl) countEl.innerText = list.length;

    const container = document.getElementById('recentTxnList');
    if (!container) return;
    container.innerHTML = "";

    if (list.length === 0) {
        container.innerHTML = `<div style="padding:18px;font-size:0.78rem;font-weight:700;color:var(--text-muted);text-align:center;">No records found. Generate a link to start!</div>`;
        return;
    }

    list.slice(0, 8).forEach(t => {
        if (!t) return;
        const isOk = t.status === 'COMPLETED';
        const isPend = t.status === 'PENDING';
        const iconGif = isOk ? 'tick.gif' : (isPend ? 'clock.gif' : 'block.gif');
        const col = isOk ? '#059669' : (isPend ? '#d97706' : '#dc2626');

        const row = document.createElement('div');
        row.className = 'txn-item';
        row.onclick = () => {
            const searchInp = document.getElementById('checkPaymentSearchInput');
            if (searchInp) searchInp.value = t.txn_id || "";
            showScreen('check');
            executePaymentCheckSearch();
        };
        row.innerHTML = `
            <div class="txn-left">
                <img src="${iconGif}" alt="" class="md-gif" onerror="this.src='tick.gif'">
                <div class="txn-meta">
                    <div class="txn-id-text">${t.payer_name && t.payer_name !== 'Waiting...' ? t.payer_name : (t.note && t.note !== 'None' ? t.note : (t.txn_id || 'Transaction'))}</div>
                    <div class="txn-time-text">${t.timestamp || 'Today'} • ID: ${t.txn_id || '-'}</div>
                </div>
            </div>
            <div style="text-align:right;">
                <div class="txn-amt-badge" style="color:${col};">₹${t.amount || 0}</div>
                <div style="font-size:0.64rem;font-weight:800;color:${col};">${t.status || 'PENDING'}</div>
            </div>
        `;
        container.appendChild(row);
    });
}

// =========================================================================
// 4. LINK GENERATOR WITH CREATOR DATA LINKED
// =========================================================================
function tapKey(key) {
    if (key === 'DEL') {
        currentAmountStr = currentAmountStr.slice(0, -1);
        if (!currentAmountStr || currentAmountStr === "") currentAmountStr = "0";
    } else if (key === '.') {
        if (!currentAmountStr.includes('.')) currentAmountStr += '.';
    } else {
        if (currentAmountStr === "0") currentAmountStr = key;
        else if (currentAmountStr.length < 7) currentAmountStr += key;
    }
    if (liveAmount) liveAmount.innerText = currentAmountStr;
}

function applyPreset(val) {
    currentAmountStr = String(val || "0");
    if (liveAmount) liveAmount.innerText = currentAmountStr;
}

function generateBillInvoice() {
    const num = parseFloat(currentAmountStr);
    if (!num || num <= 0) {
        showToast("⚠️ Enter an amount greater than ₹0");
        return;
    }

    currentTxnNote = "MintPay_Order";
    currentActiveTxnId = "TXN_" + Math.floor(100000 + Math.random() * 900000);

    const baseClean = window.location.href.split('?')[0];
    const payUrl = `${baseClean}?id=${currentActiveTxnId}`;

    activeCreatorUid = CURRENT_UID || "anonymous";
    activeCreatorGasUrl = USER_GAS_URL || DEFAULT_GAS_URL;
    activeCreatorName = MERCHANT;
    activeCreatorUpi = UPI_ID;
    activeCreatorPhoto = USER_PHOTO;
    activeCreatorQrStyle = USER_QR_STYLE;
    activeCreatorEmail = USER_EMAIL;

    activeBillPayload = {
        txn_id: currentActiveTxnId,
        utr: "PENDING",
        famx_id: "PENDING",
        payer_name: "Waiting...",
        amount: num,
        creator_uid: CURRENT_UID || "anonymous",
        creator_email: USER_EMAIL,
        merchant: MERCHANT,
        upi_id: UPI_ID,
        creator_photo: USER_PHOTO,
        creator_gas_url: USER_GAS_URL || DEFAULT_GAS_URL,
        qr_style: USER_QR_STYLE,
        note: currentTxnNote,
        status: "PENDING",
        created_ms: Date.now(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        pay_url: payUrl
    };

    const list = getStoredTxns();
    list.unshift(activeBillPayload);
    saveStoredTxns(list);

    if (db) {
        try {
            db.ref('transactions/' + currentActiveTxnId).set(activeBillPayload);
        } catch (e) {}
    }

    const billAmt = document.getElementById('billAmtText');
    const billTxn = document.getElementById('billTxnId');
    const billMerch = document.getElementById('billMerchantName');
    const billEmail = document.getElementById('billMerchantEmail');
    const billUpi = document.getElementById('billMerchantUpi');
    const billUrl = document.getElementById('billShortUrl');
    const billDate = document.getElementById('billDateText');

    if (billAmt) billAmt.innerText = num;
    if (billTxn) billTxn.innerText = currentActiveTxnId;
    if (billMerch) billMerch.innerText = MERCHANT;
    if (billEmail) billEmail.innerText = USER_EMAIL;
    if (billUpi) billUpi.innerText = UPI_ID;
    if (billUrl) billUrl.innerText = payUrl;
    if (billDate) billDate.innerText = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

    showScreen('bill');
    showToast("🧾 Payment Link Generated!");
}

function copyBillPaymentLink() {
    if (!activeBillPayload || !activeBillPayload.pay_url) return;
    navigator.clipboard.writeText(activeBillPayload.pay_url);
    showToast("📋 Link Copied: " + activeBillPayload.pay_url);
}

function shareBillPaymentLink() {
    if (!activeBillPayload || !activeBillPayload.pay_url) return;
    const shareText = `Pay ₹${activeBillPayload.amount} to ${activeBillPayload.merchant} via UPI:\n${activeBillPayload.pay_url}`;
    if (navigator.share) {
        navigator.share({
            title: `Payment to ${activeBillPayload.merchant}`,
            text: shareText,
            url: activeBillPayload.pay_url
        }).catch(() => copyBillPaymentLink());
    } else {
        copyBillPaymentLink();
    }
}

function openHostedCheckoutPage() {
    if (!activeBillPayload) return;
    IS_HOSTED_CHECKOUT_MODE = true;
    document.body.classList.add('checkout-link-mode');
    activeCreatorUid = activeBillPayload.creator_uid;
    activeCreatorGasUrl = activeBillPayload.creator_gas_url || USER_GAS_URL || DEFAULT_GAS_URL;
    activeCreatorName = activeBillPayload.merchant || MERCHANT;
    activeCreatorUpi = activeBillPayload.upi_id || UPI_ID;
    activeCreatorPhoto = activeBillPayload.creator_photo || USER_PHOTO;
    activeCreatorQrStyle = activeBillPayload.qr_style || USER_QR_STYLE;
    activeCreatorEmail = activeBillPayload.creator_email || USER_EMAIL;
    currentAmountStr = String(activeBillPayload.amount);
    currentActiveTxnId = activeBillPayload.txn_id;
    startQrRenderingFlow();
}

// =========================================================================
// 5. 3D TREE QR RENDERING & FULL-SCREEN CHECKOUT
// =========================================================================
function startQrRenderingFlow() {
    const num = parseFloat(currentAmountStr) || 1;
    qrStartTimeMs = Date.now();

    showScreen('processing');
    const procBar = document.getElementById('procBar');
    if (procBar) {
        procBar.style.width = "0%";
        setTimeout(() => { procBar.style.width = "100%"; }, 50);
    }

    setTimeout(() => {
        const upiUrl = `upi://pay?pa=${activeCreatorUpi}&pn=${encodeURIComponent(activeCreatorName)}&am=${num}&cu=INR`;

        if (qrAmtHero) qrAmtHero.innerText = `₹${num}`;

        const qrAvatar = document.getElementById('qrBrandAvatar');
        const qrName = document.getElementById('qrMerchantName');
        const qrUpi = document.getElementById('qrMerchantUpi');
        const failUpi = document.getElementById('failMerchantUpi');

        if (qrAvatar) qrAvatar.src = activeCreatorPhoto || DEFAULT_AVATAR_SVG;
        if (qrName) qrName.innerText = activeCreatorName;
        if (qrUpi) qrUpi.innerText = activeCreatorUpi;
        if (failUpi) failUpi.innerText = activeCreatorUpi;

        showScreen('qr');
        renderSelectedQrType(upiUrl, activeCreatorQrStyle);
        startCountdown(300);
    }, 1100);
}

function renderSelectedQrType(upiUrl, qrStyleType) {
    const treeCanvas = document.getElementById('treeQrCanvas');
    const staticBox = document.getElementById('staticQrBox');
    const toggleBtn = document.getElementById('toggleTreeBtn');

    const style = (qrStyleType || activeCreatorQrStyle || "tree").toLowerCase();

    if (style === 'tree' || style.includes('tree')) {
        if (treeCanvas) treeCanvas.style.display = 'block';
        if (staticBox) staticBox.style.display = 'none';
        if (toggleBtn) toggleBtn.style.display = 'inline-flex';
        initOrUpdate3DTreeQR(upiUrl);
    } else if (style === 'static') {
        if (treeCanvas) treeCanvas.style.display = 'none';
        if (staticBox) {
            staticBox.style.display = 'flex';
            staticBox.className = 'static-qr-container';
            render2DStaticQr(upiUrl, staticBox, false);
        }
        if (toggleBtn) toggleBtn.style.display = 'none';
    } else if (style === 'animated') {
        if (treeCanvas) treeCanvas.style.display = 'none';
        if (staticBox) {
            staticBox.style.display = 'flex';
            staticBox.className = 'static-qr-container animated-qr-matrix';
            render2DStaticQr(upiUrl, staticBox, true);
        }
        if (toggleBtn) toggleBtn.style.display = 'none';
    }
}

function render2DStaticQr(url, container, isAnimated) {
    if (!container) return;
    container.innerHTML = "";
    try {
        if (typeof qrcode === 'undefined') {
            container.innerHTML = `<div style="font-weight:700;font-size:0.8rem;padding:20px;">QR Generator ready for: ${url}</div>`;
            return;
        }
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();

        const count = qr.getModuleCount();
        const canvas = document.createElement('canvas');
        canvas.width = 240;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        const cellSize = 240 / count;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 240, 240);

        for (let r = 0; r < count; r++) {
            for (let c = 0; c < count; c++) {
                if (qr.isDark(r, c)) {
                    ctx.fillStyle = isAnimated ? '#059669' : '#0f172a';
                    ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
                }
            }
        }
        container.appendChild(canvas);
    } catch (e) {
        console.warn("2D QR render fallback:", e);
    }
}

// =========================================================================
// 6. GAS VERIFICATION (CREATOR-LINKED)
// =========================================================================
function openGasModal(type) {
    const modal = document.getElementById('gasInfoModal');
    const title = document.getElementById('gasModalTitle');
    const content = document.getElementById('gasModalContent');

    if (!modal) return;

    if (type === 'guide') {
        if (title) title.innerText = "📖 Backend Code Setup Guide";
        if (content) {
            content.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <p><b>1. Open Script:</b> Visit <a href="https://script.google.com" target="_blank" style="color:#059669;font-weight:800;">script.google.com</a>.</p>
                    <p><b>2. Deploy as Web App:</b> Click <b>Deploy > New Deployment > Web App</b>.</p>
                    <p><b>3. Mandatory Settings:</b></p>
                    <ul style="padding-left:16px;">
                        <li><b>Execute as:</b> Me (your email)</li>
                        <li><b>Who has access:</b> Anyone (Mandatory)</li>
                    </ul>
                    <p><b>4. Copy URL:</b> Paste the /exec URL into Settings.</p>
                </div>
            `;
        }
    } else {
        if (title) title.innerText = "⚙️ Required Features in Code";
        if (content) {
            content.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <p>Your script must handle <code>action=verify</code> and return JSON:</p>
                    <div class="code-block">function doGet(e) {
  var p = e.parameter;
  return ContentService.createTextOutput(JSON.stringify({
    status: "SUCCESS",
    verified: true,
    amount: p.amount,
    utr: p.utr || p.query,
    transaction_id: p.txn_id || p.query,
    payer_name: "Verified Payer"
  })).setMimeType(ContentService.MimeType.JSON);
}</div>
                </div>
            `;
        }
    }
    modal.classList.add('active');
}

function closeGasModal() {
    const modal = document.getElementById('gasInfoModal');
    if (modal) modal.classList.remove('active');
}

function openPaidVerificationModal() {
    const utrInp = document.getElementById('verifyUtrInput');
    const txnInp = document.getElementById('verifyTxnInput');
    if (utrInp) utrInp.value = "";
    if (txnInp) txnInp.value = "";
    const modal = document.getElementById('paidVerifyModal');
    if (modal) modal.classList.add('active');
}

function closePaidVerificationModal() {
    const modal = document.getElementById('paidVerifyModal');
    if (modal) modal.classList.remove('active');
}

async function resolveCreatorGasUrl() {
    if (currentActiveTxnId && db) {
        try {
            const txSnap = await db.ref('transactions/' + currentActiveTxnId).once('value');
            if (txSnap.exists()) {
                const txData = txSnap.val();
                if (txData.creator_uid && txData.creator_uid !== "anonymous") {
                    activeCreatorUid = txData.creator_uid;
                    const usrSnap = await db.ref('users/' + txData.creator_uid).once('value');
                    if (usrSnap.exists() && usrSnap.val().gasUrl) {
                        activeCreatorGasUrl = usrSnap.val().gasUrl;
                        return activeCreatorGasUrl;
                    }
                }
                if (txData.creator_gas_url) {
                    activeCreatorGasUrl = txData.creator_gas_url;
                    return activeCreatorGasUrl;
                }
            }
        } catch (e) {}
    }
    return activeCreatorGasUrl || USER_GAS_URL || DEFAULT_GAS_URL;
}

async function executeRealPaymentVerification() {
    const utrEl = document.getElementById('verifyUtrInput');
    const txnEl = document.getElementById('verifyTxnInput');

    const rawUtr = utrEl ? utrEl.value.trim() : "";
    const rawTxn = txnEl ? txnEl.value.trim() : "";
    const combinedInput = rawUtr || rawTxn;

    if (!combinedInput) {
        showToast("⚠️ Enter 12-Digit UTR or FamX Transaction ID!");
        return;
    }

    const isNumericUtr = /^\d{10,16}$/.test(combinedInput);
    const utrVal = isNumericUtr ? combinedInput : (rawUtr !== rawTxn ? rawUtr : "");
    const txnVal = !isNumericUtr ? combinedInput : (rawTxn !== rawUtr ? rawTxn : "");

    closePaidVerificationModal();
    if (timerInterval) clearInterval(timerInterval);

    showScreen('verify');
    const verifyBar = document.getElementById('verifyBar');
    if (verifyBar) {
        verifyBar.style.width = "0%";
        setTimeout(() => { verifyBar.style.width = "78%"; }, 80);
    }

    const num = parseFloat(currentAmountStr) || 0;
    const targetGasUrl = await resolveCreatorGasUrl();
    const targetMerchant = activeCreatorName || MERCHANT;

    try {
        const sep = targetGasUrl.includes('?') ? '&' : '?';
        const verifyUrl = `${targetGasUrl}${sep}action=verify&amount=${encodeURIComponent(num)}&query=${encodeURIComponent(combinedInput)}&utr=${encodeURIComponent(utrVal || combinedInput)}&txn_id=${encodeURIComponent(txnVal || combinedInput)}&startTime=${qrStartTimeMs}&merchant=${encodeURIComponent(targetMerchant)}`;

        const res = await fetch(verifyUrl, {
            method: 'GET',
            redirect: 'follow'
        });
        const data = await res.json();

        if (verifyBar) verifyBar.style.width = "100%";

        setTimeout(() => {
            if (data && (data.verified === true || data.status === "SUCCESS")) {
                const finalUtr = data.utr || (isNumericUtr ? combinedInput : "VERIFIED");
                const finalTxn = data.transaction_id || (!isNumericUtr ? combinedInput : (currentActiveTxnId || "FMPIB_VERIFIED"));
                const finalPayer = data.payer_name || data.sender || "Verified UPI Payer";

                finalizeTxnStatus('COMPLETED', finalUtr, finalTxn, finalPayer, num);

                const sAmt = document.getElementById('successAmtText');
                const sPayer = document.getElementById('receiptPayerName');
                const sTxn = document.getElementById('receiptTxnId');
                const sUtr = document.getElementById('receiptUtrNumber');
                const sDate = document.getElementById('receiptDateText');

                if (sAmt) sAmt.innerText = `₹${data.amount || num}`;
                if (sPayer) sPayer.innerText = finalPayer;
                if (sTxn) sTxn.innerText = finalTxn;
                if (sUtr) sUtr.innerText = finalUtr;
                if (sDate) sDate.innerText = data.date_str || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

                showScreen('success');
            } else {
                finalizeTxnStatus('FAILED', isNumericUtr ? combinedInput : 'NOT_FOUND', !isNumericUtr ? combinedInput : 'NONE', 'Unconfirmed', num);
                const fAmt = document.getElementById('failAmtText');
                const fUtr = document.getElementById('failSearchedUtr');
                const fTxn = document.getElementById('failSearchedTxnId');
                const fSub = document.getElementById('failReasonSub');

                if (fAmt) fAmt.innerText = `₹${num}`;
                if (fUtr) fUtr.innerText = combinedInput;
                if (fTxn) fTxn.innerText = combinedInput;
                if (fSub) fSub.innerText = (data && data.message) ? data.message : "No matching credit entry found in creator's Gmail.";
                showScreen('fail');
            }
        }, 400);

    } catch (e) {
        if (verifyBar) verifyBar.style.width = "100%";
        setTimeout(() => {
            finalizeTxnStatus('FAILED', combinedInput, combinedInput, 'Unconfirmed', num);
            const fAmt = document.getElementById('failAmtText');
            const fUtr = document.getElementById('failSearchedUtr');
            const fTxn = document.getElementById('failSearchedTxnId');
            const fSub = document.getElementById('failReasonSub');

            if (fAmt) fAmt.innerText = `₹${num}`;
            if (fUtr) fUtr.innerText = combinedInput;
            if (fTxn) fTxn.innerText = combinedInput;
            if (fSub) fSub.innerText = "Could not connect to Creator's GAS URL. Ensure Web App is deployed with 'Anyone' access.";
            showScreen('fail');
        }, 500);
    }
}

async function finalizeTxnStatus(status, utr, famxId, payerName, amount) {
    const list = getStoredTxns();
    const target = currentActiveTxnId ? list.find(t => t.txn_id === currentActiveTxnId) : list[0];
    if (target) {
        target.status = status;
        target.utr = utr;
        target.famx_id = famxId;
        target.payer_name = payerName;
        saveStoredTxns(list);
    }

    if (currentActiveTxnId && db) {
        try {
            await db.ref('transactions/' + currentActiveTxnId).update({
                status: status,
                utr: utr,
                famx_id: famxId,
                payer_name: payerName,
                verified_at: new Date().toISOString()
            });
        } catch (e) {}
    }

    const targetCreatorUid = activeCreatorUid || CURRENT_UID;
    if (targetCreatorUid && targetCreatorUid !== "anonymous" && currentActiveTxnId && db) {
        try {
            const creatorTxSnap = await db.ref(`users/${targetCreatorUid}/transactions`).once('value');
            if (creatorTxSnap.exists()) {
                let cList = creatorTxSnap.val();
                if (Array.isArray(cList)) {
                    cList = cList.map(item => {
                        if (item && item.txn_id === currentActiveTxnId) {
                            return { ...item, status, utr, famx_id: famxId, payer_name: payerName };
                        }
                        return item;
                    });
                    await db.ref(`users/${targetCreatorUid}/transactions`).set(cList);
                }
            }
        } catch (e) {}
    }
}

async function pingUserGasBackend(showToastMsg) {
    const sub = document.getElementById('gasConnectedSub');
    const pillText = document.getElementById('homeApiStatusText');

    try {
        const sep = USER_GAS_URL.includes('?') ? '&' : '?';
        const res = await fetch(`${USER_GAS_URL}${sep}action=ping`, { method: 'GET', redirect: 'follow' });
        if (res.ok) {
            const data = await res.json();
            if (sub) sub.innerText = data.merchant_email ? `Connected: ${data.merchant_email}` : "Automated Verification Active";
            if (pillText) pillText.innerText = "ONLINE";
            if (showToastMsg) showToast("✅ Creator GAS Verifier Live!");
            return;
        }
    } catch (e) {}

    if (sub) sub.innerText = "Verification Engine Ready";
    if (pillText) pillText.innerText = "READY";
    if (showToastMsg) showToast("⚡ Verification Engine Configured");
}

// =========================================================================
// 7. CHECK PAYMENT NAVIGATION & DEVELOPER API HUB (RAW JSON)
// =========================================================================
async function executePaymentCheckSearch() {
    const inp = document.getElementById('checkPaymentSearchInput');
    const q = inp ? inp.value.trim() : "";
    if (!q) {
        showToast("⚠️ Enter Txn ID, FamX ID, or UTR to search");
        return;
    }

    showToast("🔍 Searching records...");
    const list = getStoredTxns();

    let match = list.find(t =>
        t && ((t.txn_id && t.txn_id.toLowerCase() === q.toLowerCase()) ||
        (t.utr && t.utr === q) ||
        (t.famx_id && t.famx_id.toLowerCase() === q.toLowerCase()))
    );

    if (!match && db) {
        try {
            const directSnap = await db.ref('transactions/' + q).once('value');
            if (directSnap.exists()) {
                match = directSnap.val();
            } else {
                const allSnap = await db.ref('transactions').limitToLast(50).once('value');
                const allTx = allSnap.val() || {};
                for (const k in allTx) {
                    const item = allTx[k];
                    if (item && ((item.utr && item.utr === q) ||
                        (item.famx_id && item.famx_id.toLowerCase() === q.toLowerCase()) ||
                        (item.txn_id && item.txn_id.toLowerCase() === q.toLowerCase()))) {
                        match = item;
                        break;
                    }
                }
            }
        } catch (e) {}
    }

    if (!match) {
        try {
            const sep = USER_GAS_URL.includes('?') ? '&' : '?';
            const gasRes = await fetch(`${USER_GAS_URL}${sep}action=status&query=${encodeURIComponent(q)}`, { method: 'GET', redirect: 'follow' });
            const gasData = await gasRes.json();
            if (gasData && gasData.verified) {
                match = {
                    txn_id: gasData.transaction_id || q,
                    utr: gasData.utr || q,
                    amount: gasData.amount || 0,
                    creator_email: USER_EMAIL,
                    status: "COMPLETED",
                    timestamp: gasData.date_str || "Verified via Gmail"
                };
            }
        } catch (e) {}
    }

    const box = document.getElementById('checkSearchResultBox');
    if (box) box.style.display = 'block';

    const title = document.getElementById('searchResultTitle');
    const pill = document.getElementById('searchResultStatusPill');
    const amt = document.getElementById('searchResAmt');
    const txnId = document.getElementById('searchResTxnId');
    const utr = document.getElementById('searchResUtr');
    const email = document.getElementById('searchResEmail');
    const time = document.getElementById('searchResTime');

    if (match) {
        if (title) title.innerText = "Transaction Record";
        if (pill) {
            pill.innerText = match.status || "PENDING";
            pill.style.background = match.status === 'COMPLETED' ? '#d1fae5' : '#fee2e2';
            pill.style.color = match.status === 'COMPLETED' ? '#047857' : '#dc2626';
        }
        if (amt) amt.innerText = `₹${match.amount || 0}`;
        if (txnId) txnId.innerText = (match.famx_id && match.famx_id !== 'PENDING') ? `${match.txn_id} (${match.famx_id})` : (match.txn_id || '-');
        if (utr) utr.innerText = match.utr || "PENDING";
        if (email) email.innerText = match.creator_email || USER_EMAIL;
        if (time) time.innerText = match.timestamp || "Today";
        showToast("✅ Transaction Found!");
    } else {
        if (title) title.innerText = "No Record Found";
        if (pill) {
            pill.innerText = "NOT_FOUND";
            pill.style.background = '#fee2e2';
            pill.style.color = '#dc2626';
        }
        if (amt) amt.innerText = "₹0";
        if (txnId) txnId.innerText = q;
        if (utr) utr.innerText = "None";
        if (email) email.innerText = "None";
        if (time) time.innerText = "-";
        showToast("⚠️ No matching transaction found");
    }
}

// Developer API Engine
window.MintPayEngine = {
    createTxn: function(amount, note = "MintPay_Order") {
        if (!USER_API_ENABLED) {
            return { code: 403, status: "API_DISABLED", message: "API Gateway is turned off." };
        }
        const num = parseFloat(amount) || 1;
        const txnId = "TXN_" + Math.floor(100000 + Math.random() * 900000);
        const baseClean = window.location.href.split('?')[0];
        const payUrl = `${baseClean}?id=${txnId}`;

        const rec = {
            txn_id: txnId,
            utr: "PENDING",
            famx_id: "PENDING",
            payer_name: "Waiting...",
            amount: num,
            creator_uid: CURRENT_UID || "anonymous",
            creator_email: USER_EMAIL,
            merchant: MERCHANT,
            upi_id: UPI_ID,
            creator_photo: USER_PHOTO,
            creator_gas_url: USER_GAS_URL || DEFAULT_GAS_URL,
            qr_style: USER_QR_STYLE,
            note: note,
            status: "PENDING",
            created_ms: Date.now(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            payment_link: payUrl
        };

        const list = getStoredTxns();
        list.unshift(rec);
        saveStoredTxns(list);
        if (db) {
            try {
                db.ref('transactions/' + txnId).set(rec);
            } catch (e) {}
        }

        return {
            code: 200,
            status: "SUCCESS",
            data: {
                name: MERCHANT,
                creator_email: USER_EMAIL,
                upi_id: UPI_ID,
                amount: num,
                note: note,
                payment_link: payUrl,
                txn_id: txnId
            }
        };
    },

    checkTxn: async function(queryId) {
        if (!USER_API_ENABLED) {
            return { code: 403, status: "API_DISABLED", message: "API Gateway is turned off." };
        }
        const q = (queryId || "").trim();
        const list = getStoredTxns();
        let found = list.find(t =>
            t && (t.txn_id === q || t.utr === q || (t.famx_id && t.famx_id.toLowerCase() === q.toLowerCase()))
        );

        if (!found && q && db) {
            try {
                const snap = await db.ref('transactions/' + q).once('value');
                if (snap.exists()) found = snap.val();
            } catch (e) {}
        }

        if (found) {
            return { code: 200, status: "SUCCESS", source: "DATABASE", data: found };
        }
        return {
            code: 404,
            status: "NOT_FOUND",
            source: "DATABASE",
            message: "No transaction found matching: " + q
        };
    }
};

function runCreateTxnApi() {
    const amtEl = document.getElementById('apiCreateAmt');
    const noteEl = document.getElementById('apiCreateNote');
    const outEl = document.getElementById('apiCreateOutput');
    const checkInp = document.getElementById('apiCheckId');

    const amt = amtEl ? amtEl.value || "1" : "1";
    const note = noteEl ? noteEl.value || "MintPay_Order" : "MintPay_Order";

    const res = window.MintPayEngine.createTxn(amt, note);
    if (outEl) outEl.innerText = JSON.stringify(res, null, 2);
    if (res.data && res.data.txn_id && checkInp) {
        checkInp.value = res.data.txn_id;
        updateApiEndpointPreviews();
    }
    showToast(res.code === 200 ? "✅ Create API Executed!" : "🚫 API Disabled!");
}

async function runCheckStatusApi() {
    const inp = document.getElementById('apiCheckId');
    const outEl = document.getElementById('apiCheckOutput');

    const id = inp ? inp.value.trim() : "";
    if (outEl) outEl.innerText = "Checking Realtime Database...";
    const res = await window.MintPayEngine.checkTxn(id);
    if (outEl) outEl.innerText = JSON.stringify(res, null, 2);
    showToast(res.code === 200 ? "✅ Status Checked!" : "⚠️ Record Not Found");
}

function toggleUserApiActive() {
    USER_API_ENABLED = !USER_API_ENABLED;
    try {
        localStorage.setItem('mp_api_enabled', String(USER_API_ENABLED));
    } catch (e) {}
    updateApiSwitchUI();
    if (CURRENT_UID && db) {
        try {
            db.ref('users/' + CURRENT_UID).update({ apiEnabled: USER_API_ENABLED });
            db.ref('tokens/' + USER_API_TOKEN).update({ apiEnabled: USER_API_ENABLED });
        } catch (e) {}
    }
    showToast(USER_API_ENABLED ? "🟢 API Access Enabled" : "🔴 API Access Disabled");
}

function updateApiSwitchUI() {
    const sw = document.getElementById('apiMasterSwitch');
    const toggleIcon = document.getElementById('apiToggleIconGif');
    const toggleSub = document.getElementById('apiToggleSubText');
    const headerLabel = document.getElementById('apiHeaderStatusLabel');

    if (USER_API_ENABLED) {
        if (sw) sw.classList.add('on');
        if (toggleIcon) toggleIcon.src = 'live.gif';
        if (toggleSub) toggleSub.innerText = 'Requests are ENABLED';
        if (headerLabel) headerLabel.innerText = 'MintPay API v3.0 • Active';
    } else {
        if (sw) sw.classList.remove('on');
        if (toggleIcon) toggleIcon.src = 'off.gif';
        if (toggleSub) toggleSub.innerText = 'API is DISABLED';
        if (headerLabel) headerLabel.innerText = 'MintPay API v3.0 • Disabled';
    }
}

function updateApiEndpointPreviews() {
    const amtEl = document.getElementById('apiCreateAmt');
    const noteEl = document.getElementById('apiCreateNote');
    const idEl = document.getElementById('apiCheckId');

    const amt = amtEl ? amtEl.value || "1" : "1";
    const note = noteEl ? noteEl.value || "MintPay_Order" : "MintPay_Order";
    const id = idEl ? idEl.value || "TXN_720326" : "TXN_720326";

    const createPre = document.getElementById('createEndpointUrlPreview');
    const checkPre = document.getElementById('checkEndpointUrlPreview');

    if (createPre) createPre.innerText = `${HOSTED_DOMAIN}/api?token=${USER_API_TOKEN}?amount=${amt}&note=${encodeURIComponent(note)}`;
    if (checkPre) checkPre.innerText = `${HOSTED_DOMAIN}/api/status?token=${USER_API_TOKEN}&txn-id=${id}`;
}

async function regenerateApiToken() {
    const oldToken = USER_API_TOKEN;
    USER_API_TOKEN = generateRandomToken();
    const inp = document.getElementById('merchantApiKeyInput');
    if (inp) inp.value = USER_API_TOKEN;
    updateApiEndpointPreviews();

    if (db) {
        try {
            if (oldToken) await db.ref('tokens/' + oldToken).remove();
            if (CURRENT_UID) await db.ref('users/' + CURRENT_UID).update({ apiToken: USER_API_TOKEN });
            await db.ref('tokens/' + USER_API_TOKEN).set({
                uid: CURRENT_UID || "anonymous",
                merchantName: MERCHANT,
                email: USER_EMAIL,
                upiId: UPI_ID,
                photo: USER_PHOTO,
                gasUrl: USER_GAS_URL,
                qrStyle: USER_QR_STYLE,
                apiEnabled: USER_API_ENABLED
            });
        } catch (e) {}
    }

    showToast("🔄 New API Token Generated!");
}

function copyApiKey() {
    navigator.clipboard.writeText(USER_API_TOKEN);
    showToast("🔑 API Token Copied!");
}

// =========================================================================
// 8. THREE.JS 3D TREE FIRST ENGINE (GUARDED FROM CRASHES)
// =========================================================================
let qrScene = null;
let qrCamera = null;
let qrRenderer = null;
let qrModuleGroup = null;
let treeWorldGroup = null;
let foliageCrownGroup = null;
let qrModuleMeshes = [];
let foliageSprites = [];
let grassTufts = [];
let isTreeView = true;
let morphProgress = 1;
let animationRunning = false;

const QR_DARK_GREENS = [
    '#1b5e12', '#266e17', '#32821d', '#3e9123',
    '#4fa32d', '#5fb537', '#206314', '#688f26'
];
const QR_FINDER_GREEN = '#1e5e13';
const QR_LIGHT_TILES = ['#f7f5ee', '#efece2', '#e7e3d6'];

function isFinderPattern(r, c, count) {
    const inTL = r < 7 && c < 7;
    const inTR = r < 7 && c >= count - 7;
    const inBL = r >= count - 7 && c < 7;
    return inTL || inTR || inBL;
}

function createICQRFoliageTexture(baseCol, lightCol, darkCol) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');

    const drawLeafBlade = (x, y, rx, ry, rot, color) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(-rx, 0);
        ctx.quadraticCurveTo(0, -ry * 1.2, rx, 0);
        ctx.quadraticCurveTo(0, ry * 1.2, -rx, 0);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    };

    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        drawLeafBlade(64 + Math.cos(a) * 24, 66 + Math.sin(a) * 20, 22, 11, a + 0.25, darkCol);
    }
    for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + 0.15;
        const d = 14 + (i % 3) * 8;
        drawLeafBlade(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 21, 10.5, a, baseCol);
    }
    for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.4;
        drawLeafBlade(64 + Math.cos(a) * 13, 56 + Math.sin(a) * 12, 17, 8.5, a - 0.15, lightCol);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

function createCornerGrassTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');

    const cols = ['#38800e', '#4d9c18', '#64b824', '#7ed433', '#448f14'];
    for (let i = 0; i < 22; i++) {
        const sx = 18 + (i / 22) * 92;
        const tx = sx + (Math.random() - 0.5) * 42;
        const ty = 12 + Math.random() * 38;
        const cx = (sx + tx) / 2 + (Math.random() - 0.5) * 12;

        ctx.beginPath();
        ctx.moveTo(sx - 4.5, 124);
        ctx.quadraticCurveTo(cx, 66, tx, ty);
        ctx.quadraticCurveTo(cx + 5, 66, sx + 4.5, 124);
        ctx.closePath();
        ctx.fillStyle = cols[i % cols.length];
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

function initOrUpdate3DTreeQR(upiString) {
    const canvas = document.getElementById('treeQrCanvas');
    if (!canvas) return;

    if (typeof THREE === 'undefined') {
        const staticBox = document.getElementById('staticQrBox');
        if (staticBox) {
            staticBox.style.display = 'flex';
            render2DStaticQr(upiString, staticBox, false);
        }
        return;
    }

    try {
        const size = 300;

        if (!qrRenderer) {
            qrScene = new THREE.Scene();

            const frustum = 18.6;
            qrCamera = new THREE.OrthographicCamera(
                -frustum / 2, frustum / 2,
                frustum / 2, -frustum / 2,
                -50, 100
            );

            qrRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
            qrRenderer.setSize(size, size);
            qrRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            qrRenderer.setClearColor(0x000000, 0);

            qrScene.add(new THREE.AmbientLight(0xffffff, 0.96));
            const sunLight = new THREE.DirectionalLight(0xfffbeb, 0.45);
            sunLight.position.set(12, 26, 16);
            qrScene.add(sunLight);

            treeWorldGroup = new THREE.Group();
            foliageCrownGroup = new THREE.Group();
            qrModuleGroup = new THREE.Group();

            qrScene.add(treeWorldGroup);
            qrScene.add(foliageCrownGroup);
            qrScene.add(qrModuleGroup);

            buildSecondImageICQRTree();
        }

        isTreeView = true;
        morphProgress = 1.0;
        updateToggleUI();

        while (qrModuleGroup.children.length > 0) {
            qrModuleGroup.remove(qrModuleGroup.children[0]);
        }
        qrModuleMeshes = [];

        if (typeof qrcode === 'undefined') return;
        const qr = qrcode(0, 'M');
        qr.addData(upiString);
        qr.make();
        const count = qr.getModuleCount();

        const gridSpan = 15.2;
        const cellSize = gridSpan / count;
        const halfSpan = gridSpan / 2;

        const quietPadGeo = new THREE.BoxGeometry(gridSpan + 1.2, 0.08, gridSpan + 1.2);
        const quietPadMat = new THREE.MeshBasicMaterial({ color: '#f5f2e8', transparent: true, opacity: 0 });
        const quietPad = new THREE.Mesh(quietPadGeo, quietPadMat);
        quietPad.position.set(0, -0.08, 0);
        quietPad.userData = { isQuietPad: true };
        qrModuleGroup.add(quietPad);

        const moduleGeo = new THREE.BoxGeometry(cellSize * 1.01, 0.14, cellSize * 1.01);

        for (let r = 0; r < count; r++) {
            for (let c = 0; c < count; c++) {
                const isDark = qr.isDark(r, c);
                const isFinder = isFinderPattern(r, c, count);

                const qrX = (c + 0.5) * cellSize - halfSpan;
                const qrZ = (r + 0.5) * cellSize - halfSpan;
                const qrY = isDark ? 0.08 : 0.0;

                let colorHex = isDark
                    ? (isFinder ? QR_FINDER_GREEN : QR_DARK_GREENS[(r * 11 + c * 17) % QR_DARK_GREENS.length])
                    : QR_LIGHT_TILES[(r * 5 + c * 7) % QR_LIGHT_TILES.length];

                const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 1 });
                const mesh = new THREE.Mesh(moduleGeo, mat);

                const nx = qrX / halfSpan;
                const nz = qrZ / halfSpan;
                const dist = Math.sqrt(nx * nx + nz * nz);
                const angle = Math.atan2(nz, nx) + ((r + c) % 7) * 0.15;
                const rad = Math.min(dist * 2.8, 3.0) * 0.55;

                const treeX = isDark ? Math.cos(angle) * rad : qrX * 0.5;
                const treeZ = isDark ? Math.sin(angle) * rad : qrZ * 0.5;
                const treeY = isDark ? 3.2 + Math.max(0, 1.15 - dist * 0.65) * 3.4 : -0.5;

                mesh.position.set(treeX, treeY, treeZ);
                mesh.userData = {
                    isDark, isFinder, qrX, qrY, qrZ, treeX, treeY, treeZ,
                    phase: (r * 0.45) + (c * 0.55),
                    speed: 2.2 + ((r + c) % 4) * 0.3
                };

                qrModuleGroup.add(mesh);
                qrModuleMeshes.push(mesh);
            }
        }

        if (!animationRunning) {
            animationRunning = true;
            animateTreeQR();
        }
    } catch (e) {
        console.warn("Three.js Tree QR fallback triggered:", e);
        const staticBox = document.getElementById('staticQrBox');
        if (staticBox) {
            staticBox.style.display = 'flex';
            render2DStaticQr(upiString, staticBox, false);
        }
    }
}

function buildSecondImageICQRTree() {
    if (!treeWorldGroup) return;
    const patioSpan = 10.4;
    const halfPatio = patioSpan / 2;

    const slabGeo = new THREE.BoxGeometry(patioSpan + 0.45, 0.5, patioSpan + 0.45);
    const slabMat = new THREE.MeshLambertMaterial({ color: '#b8b3a8' });
    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.position.set(0, -1.85, 0);
    treeWorldGroup.add(slabMesh);

    const tilesPerSide = 14;
    const tileStep = patioSpan / tilesPerSide;
    const tileGeo = new THREE.BoxGeometry(tileStep * 0.94, 0.12, tileStep * 0.94);
    const stonePalette = ['#e5e1d7', '#d8d3c6', '#cfcabd', '#ebe7dd'];

    for (let r = 0; r < tilesPerSide; r++) {
        for (let c = 0; c < tilesPerSide; c++) {
            const tMat = new THREE.MeshLambertMaterial({ color: stonePalette[(r + c) % stonePalette.length] });
            const tMesh = new THREE.Mesh(tileGeo, tMat);
            tMesh.position.set((c + 0.5) * tileStep - halfPatio, -1.58, (r + 0.5) * tileStep - halfPatio);
            treeWorldGroup.add(tMesh);
        }
    }

    const grassTex = createCornerGrassTexture();
    const grassGeo = new THREE.PlaneGeometry(1.2, 1.1);

    const addGrassTuft = (gx, gz, scaleMul) => {
        const gMat = new THREE.MeshBasicMaterial({ map: grassTex, transparent: true, alphaTest: 0.14, side: THREE.DoubleSide });
        const tuft = new THREE.Mesh(grassGeo, gMat);
        tuft.position.set(gx, -1.12, gz);
        tuft.rotation.y = Math.PI / 4 + (Math.random() - 0.5) * 0.45;
        const s = (0.75 + Math.random() * 0.45) * scaleMul;
        tuft.scale.set(s, s, s);
        tuft.userData = { baseRotZ: (Math.random() - 0.5) * 0.12, phase: Math.random() * Math.PI * 2 };
        treeWorldGroup.add(tuft);
        grassTufts.push(tuft);
    };

    const corners = [
        { cx: halfPatio - 0.9, cz: halfPatio - 0.9 },
        { cx: -halfPatio + 0.9, cz: halfPatio - 0.9 },
        { cx: halfPatio - 0.9, cz: -halfPatio + 0.9 },
        { cx: -halfPatio + 0.9, cz: -halfPatio + 0.9 }
    ];
    corners.forEach(cn => {
        for (let k = 0; k < 16; k++) {
            addGrassTuft(cn.cx + (Math.random() - 0.5) * 1.7, cn.cz + (Math.random() - 0.5) * 1.7, 1.05);
        }
    });

    const barkMat = new THREE.MeshLambertMaterial({ color: '#54341e' });
    const mainTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.48, 5.4, 10), barkMat);
    mainTrunk.position.set(0, 1.0, 0);
    treeWorldGroup.add(mainTrunk);

    const branchList = [
        { x: -1.1, y: 1.9, z: 0.9, rx: 0.52, rz: 0.68, len: 3.1, r: 0.16 },
        { x: -0.95, y: 3.1, z: 0.6, rx: 0.35, rz: 0.58, len: 3.8, r: 0.19 },
        { x: 1.05, y: 3.2, z: -0.6, rx: -0.35, rz: -0.58, len: 3.8, r: 0.19 },
        { x: 0.75, y: 3.3, z: 0.85, rx: 0.45, rz: -0.40, len: 3.4, r: 0.17 },
        { x: -0.75, y: 3.4, z: -0.85, rx: -0.45, rz: 0.40, len: 3.4, r: 0.17 },
        { x: -0.2, y: 4.9, z: 0.1, rx: 0.08, rz: 0.12, len: 3.9, r: 0.16 }
    ];

    branchList.forEach(b => {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.38, b.r, b.len, 8), barkMat);
        br.position.set(b.x, b.y, b.z);
        br.rotation.x = b.rx;
        br.rotation.z = b.rz;
        treeWorldGroup.add(br);
    });

    const texSunlit = createICQRFoliageTexture('#8cd738', '#aae856', '#68b31e');
    const texLush   = createICQRFoliageTexture('#7bc62b', '#98e048', '#569c14');
    const texShade  = createICQRFoliageTexture('#65ad1b', '#83cc35', '#44820c');
    const leafTextures = [texSunlit, texLush, texShade];

    const boughClusters = [
        { cx: -0.3, cy: 7.3, cz: 0.2, rx: 1.0, ry: 1.2, rz: 1.0, count: 28 },
        { cx: 0.6,  cy: 6.7, cz: -0.3, rx: 1.2, ry: 1.1, rz: 1.2, count: 26 },
        { cx: -1.8, cy: 5.3, cz: 1.1, rx: 1.8, ry: 1.2, rz: 1.7, count: 38 },
        { cx: 1.9,  cy: 5.2, cz: -1.0, rx: 1.8, ry: 1.2, rz: 1.7, count: 38 },
        { cx: 0.0,  cy: 5.6, cz: 0.0, rx: 1.9, ry: 1.1, rz: 1.9, count: 34 }
    ];

    const puffGeo = new THREE.PlaneGeometry(1.48, 1.48);
    let idx = 0;
    boughClusters.forEach(m => {
        for (let i = 0; i < m.count; i++) {
            idx++;
            const tex = leafTextures[idx % 3];
            const pMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.12, side: THREE.DoubleSide });
            const puff = new THREE.Mesh(puffGeo, pMat);

            const u = Math.random();
            const v = Math.random();
            const theta = u * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * v - 1.0);
            const r = Math.cbrt(Math.random());

            const lx = m.cx + r * Math.sin(phi) * Math.cos(theta) * m.rx;
            const ly = m.cy + r * Math.cos(phi) * m.ry;
            const lz = m.cz + r * Math.sin(phi) * Math.sin(theta) * m.rz;

            puff.position.set(lx, ly, lz);
            puff.rotation.y = Math.PI / 4 + (Math.random() - 0.5) * 0.4;
            puff.rotation.x = -0.32 + (Math.random() - 0.5) * 0.3;
            puff.rotation.z = (Math.random() - 0.5) * 0.55;

            const baseScale = 0.68 + Math.random() * 0.48;
            puff.userData = {
                baseX: lx, baseY: ly, baseZ: lz,
                baseRotZ: puff.rotation.z, baseScale,
                phase: Math.random() * Math.PI * 2,
                windSpeed: 1.9 + Math.random() * 1.3
            };
            foliageCrownGroup.add(puff);
            foliageSprites.push(puff);
        }
    });
}

function toggleTreeMode() {
    isTreeView = !isTreeView;
    updateToggleUI();
}

function updateToggleUI() {
    const btnText = document.getElementById('toggleBtnText');
    const btnGif = document.getElementById('toggleBtnGif');
    if (btnText) btnText.innerText = isTreeView ? "Tap the tree to see QR code" : "Tap QR to see the 3D Tree";
    if (btnGif) btnGif.src = isTreeView ? "eye.gif" : "light.gif";
}

let clockTime = 0;
function animateTreeQR() {
    if (!animationRunning) return;
    requestAnimationFrame(animateTreeQR);
    try {
        clockTime += 0.032;

        const target = isTreeView ? 1 : 0;
        morphProgress += (target - morphProgress) * 0.09;

        const camX = morphProgress * 14.5;
        const camY = 24.0 - morphProgress * 12.8;
        const camZ = morphProgress * 14.5;

        const upY = morphProgress;
        const upZ = -(1 - morphProgress);
        if (qrCamera) {
            qrCamera.up.set(0, upY, upZ).normalize();
            qrCamera.position.set(camX, camY, camZ);
            qrCamera.lookAt(0, morphProgress * 2.35, 0);
        }

        const treeAlpha = Math.max(0, (morphProgress - 0.15) / 0.85);
        const treeVis = treeAlpha > 0.01;
        if (treeWorldGroup) treeWorldGroup.visible = treeVis;
        if (foliageCrownGroup) foliageCrownGroup.visible = treeVis;

        if (treeVis && treeWorldGroup) {
            treeWorldGroup.scale.setScalar(Math.max(0.001, treeAlpha));
            treeWorldGroup.position.y = (1 - treeAlpha) * -2.2;

            for (let i = 0; i < foliageSprites.length; i++) {
                const s = foliageSprites[i];
                const d = s.userData;
                const wave = Math.sin(clockTime * d.windSpeed + d.phase);
                s.position.x = d.baseX + wave * 0.11 * treeAlpha;
                s.position.y = d.baseY + Math.cos(clockTime * d.windSpeed + d.phase) * 0.07 * treeAlpha;
                s.rotation.z = d.baseRotZ + wave * 0.14;
                s.scale.setScalar(d.baseScale * treeAlpha);
            }

            for (let i = 0; i < grassTufts.length; i++) {
                const g = grassTufts[i];
                g.rotation.z = g.userData.baseRotZ + Math.sin(clockTime * 2.3 + g.userData.phase) * 0.11;
            }
        }

        if (qrModuleGroup) {
            qrModuleGroup.children.forEach(ch => {
                if (ch.userData && ch.userData.isQuietPad) {
                    ch.material.opacity = Math.max(0, 1 - morphProgress * 2.5);
                    ch.visible = ch.material.opacity > 0.02;
                }
            });
        }

        const qrVisibility = Math.max(0, 1 - morphProgress * 1.15);
        for (let i = 0; i < qrModuleMeshes.length; i++) {
            const m = qrModuleMeshes[i];
            const d = m.userData;
            const bx = d.qrX + (d.treeX - d.qrX) * morphProgress;
            const by = d.qrY + (d.treeY - d.qrY) * morphProgress;
            const bz = d.qrZ + (d.treeZ - d.qrZ) * morphProgress;

            if (d.isDark) {
                const wave = Math.sin(clockTime * d.speed + d.phase);
                const swayAmp = d.isFinder ? 0 : (0.008 * (1 - morphProgress));
                m.position.set(bx + wave * swayAmp, by, bz + wave * swayAmp);
                m.rotation.set(0, 0, 0);
                const pulseScale = d.isFinder ? 1.0 : (0.96 + 0.05 * Math.sin(clockTime * 2.4 + d.phase));
                const finalScale = Math.max(0.001, pulseScale * (1 - morphProgress * 0.95));
                m.scale.set(finalScale, 1, finalScale);
                m.visible = morphProgress < 0.92;
            } else {
                m.position.set(bx, by, bz);
                m.material.opacity = qrVisibility;
                m.visible = qrVisibility > 0.02;
            }
        }

        if (qrRenderer && qrScene && qrCamera) {
            qrRenderer.render(qrScene, qrCamera);
        }
    } catch (e) {}
}

// =========================================================================
// 8.1 SAFE BACKGROUND THREE.JS INITIALIZATION
// =========================================================================
try {
    const bgCanvas = document.getElementById('bg-canvas');
    if (bgCanvas && typeof THREE !== 'undefined') {
        const bgScene = new THREE.Scene();
        const bgCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        const bgRenderer = new THREE.WebGLRenderer({ canvas: bgCanvas, alpha: true, antialias: true });
        bgRenderer.setSize(window.innerWidth, window.innerHeight);
        bgRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        bgScene.add(new THREE.AmbientLight(0xffffff, 0.95));
        const bgDirLight = new THREE.DirectionalLight(0xd1fae5, 0.7);
        bgDirLight.position.set(10, 20, 15);
        bgScene.add(bgDirLight);

        const floaters = [];
        const mintPalette = [0x34d399, 0x10b981, 0x6ee7b7, 0xa7f3d0, 0x059669];

        for (let i = 0; i < 8; i++) {
            const geo = i % 2 === 0
                ? new THREE.TorusGeometry(Math.random() * 0.9 + 0.4, 0.16, 12, 28)
                : new THREE.IcosahedronGeometry(Math.random() * 0.7 + 0.3, 1);

            const mat = new THREE.MeshPhysicalMaterial({
                color: mintPalette[i % mintPalette.length],
                roughness: 0.2,
                metalness: 0.1,
                clearcoat: 0.9,
                transparent: true,
                opacity: 0.22
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(
                (Math.random() - 0.5) * 16,
                (Math.random() - 0.5) * 14,
                (Math.random() - 0.5) * 10 - 4
            );
            mesh.userData = {
                rx: (Math.random() - 0.5) * 0.01,
                ry: (Math.random() - 0.5) * 0.01,
                baseY: mesh.position.y,
                phase: Math.random() * Math.PI * 2
            };
            bgScene.add(mesh);
            floaters.push(mesh);
        }

        bgCamera.position.z = 14;
        let bgTime = 0;

        function animateBg() {
            requestAnimationFrame(animateBg);
            try {
                bgTime += 0.012;
                floaters.forEach(f => {
                    f.rotation.x += f.userData.rx;
                    f.rotation.y += f.userData.ry;
                    f.position.y = f.userData.baseY + Math.sin(bgTime + f.userData.phase) * 0.5;
                });
                bgRenderer.render(bgScene, bgCamera);
            } catch (e) {}
        }
        animateBg();

        window.addEventListener('resize', () => {
            try {
                bgCamera.aspect = window.innerWidth / window.innerHeight;
                bgCamera.updateProjectionMatrix();
                bgRenderer.setSize(window.innerWidth, window.innerHeight);
            } catch (e) {}
        });
    }
} catch (threeErr) {
    console.warn("Background Three.js disabled gracefully:", threeErr);
}

// =========================================================================
// 9. NAVIGATION, TOAST & APP BOOTSTRAP (ANTI-BLANK-SCREEN LOGIC)
// =========================================================================
function showScreen(name) {
    try {
        const screens = [
            'authScreen', 'homeScreen', 'numpadScreen', 'billScreen', 'processingScreen',
            'qrScreen', 'checkPaymentScreen', 'apiScreen', 'profileScreen',
            'paymentVerifyScreen', 'successScreen', 'failScreen'
        ];
        
        screens.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.setProperty('display', 'none', 'important');
        });

        const dock = document.getElementById('bottomNavDock');
        const shell = document.getElementById('appShell');

        const hideDock = ['auth', 'processing', 'qr', 'verify', 'success', 'fail'];

        if (IS_HOSTED_CHECKOUT_MODE || hideDock.includes(name)) {
            if (dock) dock.style.setProperty('display', 'none', 'important');
            if (shell) shell.classList.add('no-bottom-pad');
        } else {
            if (dock) dock.style.setProperty('display', 'flex', 'important');
            if (shell) shell.classList.remove('no-bottom-pad');
        }

        ['navHome', 'navPay', 'navCheck', 'navApi', 'navProfile'].forEach(t => {
            const btn = document.getElementById(t);
            if (btn) btn.classList.remove('active');
        });

        let targetId = name + 'Screen';
        if (name === 'check') targetId = 'checkPaymentScreen';
        if (name === 'verify') targetId = 'paymentVerifyScreen';

        const targetEl = document.getElementById(targetId) || document.getElementById(name);
        if (targetEl) {
            targetEl.style.setProperty('display', 'flex', 'important');
        } else {
            const fallback = document.getElementById('homeScreen') || document.getElementById('authScreen');
            if (fallback) fallback.style.setProperty('display', 'flex', 'important');
        }

        if (name === 'home') {
            const tab = document.getElementById('navHome');
            if (tab) tab.classList.add('active');
        } else if (name === 'numpad') {
            const tab = document.getElementById('navPay');
            if (tab) tab.classList.add('active');
        } else if (name === 'check') {
            const tab = document.getElementById('navCheck');
            if (tab) tab.classList.add('active');
        } else if (name === 'api') {
            updateApiEndpointPreviews();
            const tab = document.getElementById('navApi');
            if (tab) tab.classList.add('active');
        } else if (name === 'profile') {
            const tab = document.getElementById('navProfile');
            if (tab) tab.classList.add('active');
        }
    } catch (e) {
        console.error("showScreen safe error:", e);
    }
}

function startCountdown(seconds) {
    if (timerInterval) clearInterval(timerInterval);
    let rem = seconds;
    timerInterval = setInterval(() => {
        rem--;
        if (rem <= 0) {
            clearInterval(timerInterval);
            goToAmountScreen();
            return;
        }
        const m = String(Math.floor(rem / 60)).padStart(2, '0');
        const s = String(rem % 60).padStart(2, '0');
        if (countdownTimer) countdownTimer.innerText = `${m}:${s}`;
    }, 1000);
}

function copyUPI() {
    navigator.clipboard.writeText(activeCreatorUpi || UPI_ID);
    const tip = document.getElementById('copyTip');
    if (tip) tip.innerText = "Copied!";
    showToast("UPI ID Copied: " + (activeCreatorUpi || UPI_ID));
    setTimeout(() => { if (tip) tip.innerText = "Copy"; }, 2000);
}

function goToAmountScreen() {
    if (timerInterval) clearInterval(timerInterval);
    if (IS_HOSTED_CHECKOUT_MODE) {
        const newAmt = prompt("Enter amount (₹):", currentAmountStr);
        if (newAmt && parseFloat(newAmt) > 0) {
            currentAmountStr = String(parseFloat(newAmt));
            startQrRenderingFlow();
        } else {
            showScreen('qr');
            startCountdown(300);
        }
        return;
    }
    showScreen('numpad');
}

function backToQrFromFail() {
    showScreen('qr');
    startCountdown(300);
}

function showToast(text) {
    if (!toast) return;
    toast.innerText = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2300);
}

// =========================================================================
// UNIVERSAL BOOTSTRAP (ANTI-BLANK-SCREEN GUARANTEE)
// =========================================================================
async function initMintPay() {
    try {
        syncUIWithState();
    } catch (err) {
        console.warn("Initial syncUIWithState error guarded:", err);
    }

    const rawSearch = window.location.search || "";
    const normalized = rawSearch.replace(/\?/g, '&').replace(/^&/, '?');
    const params = new URLSearchParams(normalized);

    const hostedId = params.get('id') || params.get('pay') || params.get('txn-id') || params.get('txn_id');
    const urlToken = params.get('token');
    const urlAmt = parseFloat(params.get('amount') || params.get('am'));

    // Case 1: Opened via Payment Link (?id=TXN_...)
    if (hostedId) {
        IS_HOSTED_CHECKOUT_MODE = true;
        document.body.classList.add('checkout-link-mode');
        showScreen('processing');
        showToast("🔍 Loading hosted payment...");

        let loaded = false;
        if (db) {
            try {
                const snap = await db.ref('transactions/' + hostedId).once('value');
                if (snap.exists()) {
                    const data = snap.val();

                    activeCreatorUid = data.creator_uid || null;
                    activeCreatorGasUrl = data.creator_gas_url || data.gas_url || DEFAULT_GAS_URL;
                    activeCreatorName = data.merchant || "Sunny Kumar";
                    activeCreatorUpi = data.upi_id || "sunnypro@fam";
                    activeCreatorPhoto = data.creator_photo || DEFAULT_AVATAR_SVG;
                    activeCreatorQrStyle = data.qr_style || "tree";
                    activeCreatorEmail = data.creator_email || "merchant@mintpay.com";

                    currentAmountStr = String(data.amount || 1);
                    currentActiveTxnId = data.txn_id || hostedId;
                    loaded = true;

                    startQrRenderingFlow();
                    return;
                }
            } catch (e) {
                console.warn("Hosted fetch error from DB:", e);
            }
        }

        if (!loaded) {
            const list = getStoredTxns();
            const localTx = list.find(t => t && (t.txn_id === hostedId));
            if (localTx) {
                activeCreatorName = localTx.merchant || MERCHANT;
                activeCreatorUpi = localTx.upi_id || UPI_ID;
                activeCreatorPhoto = localTx.creator_photo || USER_PHOTO;
                activeCreatorQrStyle = localTx.qr_style || USER_QR_STYLE;
                currentAmountStr = String(localTx.amount || 1);
                currentActiveTxnId = localTx.txn_id;
                startQrRenderingFlow();
                return;
            }
            currentAmountStr = "1";
            currentActiveTxnId = hostedId;
            startQrRenderingFlow();
            return;
        }
    }

    // Case 2: Opened via Token + Amount API URL
    if (urlAmt && urlAmt > 0) {
        IS_HOSTED_CHECKOUT_MODE = true;
        document.body.classList.add('checkout-link-mode');
        showScreen('processing');

        if (urlToken && db) {
            try {
                const tokSnap = await db.ref('tokens/' + urlToken).once('value');
                if (tokSnap.exists()) {
                    const tData = tokSnap.val();
                    activeCreatorUid = tData.uid || null;
                    activeCreatorName = tData.merchantName || MERCHANT;
                    activeCreatorUpi = tData.upiId || UPI_ID;
                    activeCreatorPhoto = tData.photo || DEFAULT_AVATAR_SVG;
                    activeCreatorGasUrl = tData.gasUrl || DEFAULT_GAS_URL;
                    activeCreatorQrStyle = tData.qrStyle || "tree";
                }
            } catch (e) {}
        }

        currentAmountStr = String(urlAmt);
        currentActiveTxnId = "TXN_" + Math.floor(100000 + Math.random() * 900000);
        startQrRenderingFlow();
        return;
    }

    // Default route: Dashboard if logged in, otherwise Login/Signup
    try {
        if (localStorage.getItem('mp_logged_in') === 'true' && CURRENT_UID) {
            showScreen('home');
            pingUserGasBackend(false);
        } else {
            showScreen('auth');
        }
    } catch (routeErr) {
        showScreen('auth');
    }
}

// Ensure init executes reliably
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMintPay);
} else {
    initMintPay();
}
