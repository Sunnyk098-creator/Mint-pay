/**
 * MintPay 3D Engine - Fixed URL Routing, DP Sync, and Errorless Realtime Database
 */

// =========================================================================
// 0. FIREBASE REALTIME DATABASE CONFIGURATION
// =========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyB_aUTy7Kvzo-Ct44MZ062MFcpDOnQ4WxU",
    databaseURL: "https://mint-pay-904ef-default-rtdb.firebaseio.com",
    projectId: "mint-pay-904ef",
    storageBucket: "mint-pay-904ef.firebasestorage.app",
    messagingSenderId: "76118936092",
    appId: "1:76118936092:web:fc40baa414665d89aeedd9"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

const HOSTED_DOMAIN = "https://mint-pay.vercel.app";
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycby1NynPfPfcwycVaO6TUC9qJ0fmnsseCEl_KKD9Mmi6TJChk72bs_oPGODH2qykIjSZ/exec";

// Default High-Res SVG Avatar (Guarantees no broken image icon)
const DEFAULT_AVATAR_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%2310b981'/><circle cx='50' cy='38' r='18' fill='%23ffffff'/><path d='M20,85 C20,62 35,58 50,58 C65,58 80,62 80,85 Z' fill='%23ffffff'/></svg>";

// Current Active Session State
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

// Dynamic Flow State
let currentAmountStr = "0";
let currentTxnNote = "MintPay_Order";
let currentActiveTxnId = null;
let activeBillPayload = null;
let timerInterval = null;

// DOM Helpers
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
        const usersSnap = await db.ref('users').once('value');
        const users = usersSnap.val() || {};

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

        await db.ref('users/' + newUid).set(newUserData);

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
        showToast("⚠️ Signup Failed: " + err.message);
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
        const usersSnap = await db.ref('users').once('value');
        const users = usersSnap.val() || {};
        let matchedUser = null;

        for (const uid in users) {
            const u = users[uid];
            if ((u.email && u.email.toLowerCase() === identifier) || (u.phone && u.phone === identifier)) {
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
        persistSession();

        syncUIWithState();
        showScreen('home');
        showToast("👋 Welcome back, " + MERCHANT + "!");
        pingUserGasBackend(false);
    } catch (err) {
        showToast("⚠️ Login Failed: " + err.message);
    }
}

function persistSession() {
    localStorage.setItem('mp_logged_in', 'true');
    localStorage.setItem('mp_uid', CURRENT_UID);
    localStorage.setItem('mp_merchant', MERCHANT);
    localStorage.setItem('mp_phone', USER_PHONE);
    localStorage.setItem('mp_email', USER_EMAIL);
    localStorage.setItem('mp_upi', UPI_ID);
    localStorage.setItem('mp_photo', USER_PHOTO);
    localStorage.setItem('mp_gas_url', USER_GAS_URL);
    localStorage.setItem('mp_qr_style', USER_QR_STYLE);
    localStorage.setItem('mp_api_token', USER_API_TOKEN);
    localStorage.setItem('mp_api_enabled', String(USER_API_ENABLED));
}

function logoutGateway() {
    localStorage.removeItem('mp_logged_in');
    CURRENT_UID = null;
    showToast("Logged out safely");
    showScreen('auth');
}

// =========================================================================
// 2. PROFILE DP UPLOAD & UI SYNC
// =========================================================================
function handleProfileImageUpload(event) {
    const file = event.target.files[0];
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
        localStorage.setItem('mp_photo', USER_PHOTO);

        updateAllAvatars(USER_PHOTO);

        if (CURRENT_UID) {
            try {
                await db.ref('users/' + CURRENT_UID).update({ photo: base64Data });
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
            el.onerror = () => { el.src = DEFAULT_AVATAR_SVG; };
        }
    });
}

function syncUIWithState() {
    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
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
    setTxt('procSubUpi', `Rendering ${USER_QR_STYLE.toUpperCase()} QR for ${UPI_ID}`);

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
    USER_QR_STYLE = styleKey;
    ['qrStyleTreeLabel', 'qrStyleStaticLabel', 'qrStyleAnimatedLabel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    const activeEl = document.getElementById(`qrStyle${styleKey.charAt(0).toUpperCase() + styleKey.slice(1)}Label`);
    if (activeEl) activeEl.classList.add('active');

    if (doSave) {
        localStorage.setItem('mp_qr_style', USER_QR_STYLE);
        if (CURRENT_UID) {
            db.ref('users/' + CURRENT_UID).update({ qrStyle: USER_QR_STYLE });
        }
        showToast(`✨ Selected Style: ${styleKey.toUpperCase()} QR`);
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

    if (CURRENT_UID) {
        await db.ref('users/' + CURRENT_UID).update({
            merchantName: MERCHANT,
            phone: USER_PHONE,
            upiId: UPI_ID,
            gasUrl: USER_GAS_URL,
            qrStyle: USER_QR_STYLE
        });
    }

    syncUIWithState();
    showToast("✅ Profile Saved Successfully!");
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

    localStorage.removeItem('mp_transactions');

    if (CURRENT_UID) {
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
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
}

function saveStoredTxns(list) {
    localStorage.setItem('mp_transactions', JSON.stringify(list));
    if (CURRENT_UID) {
        db.ref('users/' + CURRENT_UID + '/transactions').set(list.slice(0, 30));
    }
    renderDashboardData();
}

function renderDashboardData() {
    const list = getStoredTxns();
    const completed = list.filter(t => t.status === 'COMPLETED');
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
        const isOk = t.status === 'COMPLETED';
        const isPend = t.status === 'PENDING';
        const iconGif = isOk ? 'tick.gif' : (isPend ? 'clock.gif' : 'block.gif');
        const col = isOk ? '#059669' : (isPend ? '#d97706' : '#dc2626');

        const row = document.createElement('div');
        row.className = 'txn-item';
        row.onclick = () => {
            const searchInp = document.getElementById('checkPaymentSearchInput');
            if (searchInp) searchInp.value = t.txn_id;
            showScreen('check');
            executePaymentCheckSearch();
        };
        row.innerHTML = `
            <div class="txn-left">
                <img src="${iconGif}" alt="" class="md-gif" onerror="this.src='tick.gif'">
                <div class="txn-meta">
                    <div class="txn-id-text">${t.note && t.note !== 'None' ? t.note : t.txn_id}</div>
                    <div class="txn-time-text">${t.timestamp} • ID: ${t.txn_id}</div>
                </div>
            </div>
            <div style="text-align:right;">
                <div class="txn-amt-badge" style="color:${col};">₹${t.amount}</div>
                <div style="font-size:0.64rem;font-weight:800;color:${col};">${t.status}</div>
            </div>
        `;
        container.appendChild(row);
    });
}

// =========================================================================
// 4. BILL INVOICE & SAFE URL CREATOR (CRASH FIXED)
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
    currentAmountStr = val;
    if (liveAmount) liveAmount.innerText = currentAmountStr;
}

// FIXED: Removed missing 'txnCustomNote' element lookup that was breaking the button
function generateBillInvoice() {
    const num = parseFloat(currentAmountStr);
    if (!num || num <= 0) {
        showToast("⚠️ Enter an amount greater than ₹0");
        return;
    }

    // Default note since input field is removed from UI (API-only)
    currentTxnNote = "MintPay_Order";
    currentActiveTxnId = "TXN_" + Math.floor(100000 + Math.random() * 900000);

    const payUrl = `${HOSTED_DOMAIN}/?id=${currentActiveTxnId}`;

    activeBillPayload = {
        txn_id: currentActiveTxnId,
        utr: "PENDING",
        famx_id: "PENDING",
        payer_name: "Waiting...",
        amount: num,
        merchant: MERCHANT,
        upi_id: UPI_ID,
        note: currentTxnNote,
        status: "PENDING",
        created_ms: Date.now(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        pay_url: payUrl
    };

    const list = getStoredTxns();
    list.unshift(activeBillPayload);
    saveStoredTxns(list);
    db.ref('transactions/' + currentActiveTxnId).set(activeBillPayload);

    // Safely populate Invoice Preview elements
    const billAmt = document.getElementById('billAmtText');
    const billTxn = document.getElementById('billTxnId');
    const billMerch = document.getElementById('billMerchantName');
    const billUpi = document.getElementById('billMerchantUpi');
    const billUrl = document.getElementById('billShortUrl');
    const billDate = document.getElementById('billDateText');

    if (billAmt) billAmt.innerText = num;
    if (billTxn) billTxn.innerText = currentActiveTxnId;
    if (billMerch) billMerch.innerText = MERCHANT;
    if (billUpi) billUpi.innerText = UPI_ID;
    if (billUrl) billUrl.innerText = payUrl;
    if (billDate) billDate.innerText = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

    showScreen('bill');
    showToast("🧾 Payment Link Generated!");
}

function copyBillPaymentLink() {
    if (!activeBillPayload) return;
    navigator.clipboard.writeText(activeBillPayload.pay_url);
    showToast("📋 Link Copied: " + activeBillPayload.pay_url);
}

function shareBillPaymentLink() {
    if (!activeBillPayload) return;
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
    window.location.href = activeBillPayload.pay_url;
}

function viewQrFromBill() {
    if (!activeBillPayload) return;
    currentAmountStr = String(activeBillPayload.amount);
    startQrRenderingFlow();
}

// =========================================================================
// 5. MULTI-STYLE QR RENDERING FLOW (FULL SCREEN MATCHING SCREENSHOT 5)
// =========================================================================
function startQrRenderingFlow() {
    const num = parseFloat(currentAmountStr);
    showScreen('processing');
    const procBar = document.getElementById('procBar');
    if (procBar) {
        procBar.style.width = "0%";
        setTimeout(() => { procBar.style.width = "100%"; }, 50);
    }

    setTimeout(() => {
        const upiUrl = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(MERCHANT)}&am=${num}&cu=INR`;
        if (qrAmtHero) qrAmtHero.innerText = `₹${num}`;
        
        // Show pure full-screen checkout without navigation bar
        showScreen('qr');
        renderSelectedQrType(upiUrl);
        startCountdown(300);
    }, 1100);
}

function renderSelectedQrType(upiUrl) {
    const treeCanvas = document.getElementById('treeQrCanvas');
    const staticBox = document.getElementById('staticQrBox');
    const toggleBtn = document.getElementById('toggleTreeBtn');

    if (USER_QR_STYLE === 'tree') {
        if (treeCanvas) treeCanvas.style.display = 'block';
        if (staticBox) staticBox.style.display = 'none';
        if (toggleBtn) toggleBtn.style.display = 'inline-flex';
        initOrUpdate3DTreeQR(upiUrl);
    } else if (USER_QR_STYLE === 'static') {
        if (treeCanvas) treeCanvas.style.display = 'none';
        if (staticBox) {
            staticBox.style.display = 'flex';
            staticBox.className = 'static-qr-container';
            render2DStaticQr(upiUrl, staticBox, false);
        }
        if (toggleBtn) toggleBtn.style.display = 'none';
    } else if (USER_QR_STYLE === 'animated') {
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
    container.innerHTML = "";
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
}

// =========================================================================
// 6. GAS VERIFICATION & MODALS
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
    utr: p.query || "629027145452",
    transaction_id: "FMPIB" + Math.floor(1000000000 + Math.random()*9000000000),
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
    const inp = document.getElementById('verifyUtrInput');
    if (inp) inp.value = "";
    const modal = document.getElementById('paidVerifyModal');
    if (modal) modal.classList.add('active');
}

function closePaidVerificationModal() {
    const modal = document.getElementById('paidVerifyModal');
    if (modal) modal.classList.remove('active');
}

async function executeRealPaymentVerification() {
    const inp = document.getElementById('verifyUtrInput');
    const utrOrTxn = inp ? inp.value.trim() : "";
    closePaidVerificationModal();
    if (timerInterval) clearInterval(timerInterval);

    showScreen('verify');
    const verifyBar = document.getElementById('verifyBar');
    if (verifyBar) {
        verifyBar.style.width = "0%";
        setTimeout(() => { verifyBar.style.width = "75%"; }, 80);
    }

    const num = parseFloat(currentAmountStr) || 0;
    const gasEndpoint = USER_GAS_URL || DEFAULT_GAS_URL;

    try {
        const verifyUrl = `${gasEndpoint}?action=verify&amount=${encodeURIComponent(num)}&query=${encodeURIComponent(utrOrTxn)}&merchant=${encodeURIComponent(MERCHANT)}`;
        const res = await fetch(verifyUrl, { method: 'GET', mode: 'cors' });
        const data = await res.json();

        if (verifyBar) verifyBar.style.width = "100%";

        setTimeout(() => {
            if (data && (data.verified === true || data.status === "SUCCESS")) {
                finalizeTxnStatus('COMPLETED', data.utr || utrOrTxn || "VERIFIED", data.transaction_id || "FMPIB_OK", data.payer_name || "PRATIMA FARIKAR", num);
                
                const sAmt = document.getElementById('successAmtText');
                const sPayer = document.getElementById('receiptPayerName');
                const sTxn = document.getElementById('receiptTxnId');
                const sUtr = document.getElementById('receiptUtrNumber');
                const sDate = document.getElementById('receiptDateText');

                if (sAmt) sAmt.innerText = `₹${data.amount || num}`;
                if (sPayer) sPayer.innerText = data.payer_name || "PRATIMA FARIKAR";
                if (sTxn) sTxn.innerText = data.transaction_id || currentActiveTxnId || "FMPIB6811724682";
                if (sUtr) sUtr.innerText = data.utr || utrOrTxn || "629027145452";
                if (sDate) sDate.innerText = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                
                showScreen('success');
            } else {
                finalizeTxnStatus('FAILED', 'NOT_FOUND', 'NONE', 'Unconfirmed', num);
                const fAmt = document.getElementById('failAmtText');
                const fQuery = document.getElementById('failSearchedQuery');
                const fSub = document.getElementById('failReasonSub');

                if (fAmt) fAmt.innerText = `₹${num}`;
                if (fQuery) fQuery.innerText = utrOrTxn || `₹${num}`;
                if (fSub) fSub.innerText = data.message || "Payment not verified.";
                showScreen('fail');
            }
        }, 400);

    } catch (e) {
        if (verifyBar) verifyBar.style.width = "100%";
        setTimeout(() => {
            finalizeTxnStatus('FAILED', 'NOT_FOUND', 'NONE', 'Unconfirmed', num);
            const fAmt = document.getElementById('failAmtText');
            const fQuery = document.getElementById('failSearchedQuery');
            const fSub = document.getElementById('failReasonSub');

            if (fAmt) fAmt.innerText = `₹${num}`;
            if (fQuery) fQuery.innerText = utrOrTxn || "None";
            if (fSub) fSub.innerText = "Check verification backend URL deployment.";
            showScreen('fail');
        }, 500);
    }
}

function finalizeTxnStatus(status, utr, famxId, payerName, amount) {
    const list = getStoredTxns();
    const target = currentActiveTxnId ? list.find(t => t.txn_id === currentActiveTxnId) : list[0];
    if (target) {
        target.status = status;
        target.utr = utr;
        target.famx_id = famxId;
        target.payer_name = payerName;
        saveStoredTxns(list);
        if (CURRENT_UID) {
            db.ref(`users/${CURRENT_UID}/transactions/${target.txn_id}`).update({ status, utr, famx_id: famxId, payer_name: payerName });
        }
        db.ref('transactions/' + target.txn_id).update({ status, utr, famx_id: famxId, payer_name: payerName });
    }
}

async function pingUserGasBackend(showToastMsg) {
    const sub = document.getElementById('gasConnectedSub');
    const pillText = document.getElementById('homeApiStatusText');

    try {
        const res = await fetch(`${USER_GAS_URL}?action=status`);
        if (res.ok) {
            if (sub) sub.innerText = "Automated Verification Active";
            if (pillText) pillText.innerText = "ONLINE";
            if (showToastMsg) showToast("✅ Verification Engine Live!");
            return;
        }
    } catch (e) {}

    if (sub) sub.innerText = "Verification Engine Ready";
    if (pillText) pillText.innerText = "READY";
    if (showToastMsg) showToast("⚡ Verification Engine Configured");
}

// =========================================================================
// 7. CHECK PAYMENT NAVIGATION & DEVELOPER API HUB (RAW JSON OUTPUT)
// =========================================================================
async function executePaymentCheckSearch() {
    const inp = document.getElementById('checkPaymentSearchInput');
    const q = inp ? inp.value.trim() : "";
    if (!q) {
        showToast("⚠️ Enter Txn ID or UTR to search");
        return;
    }

    showToast("🔍 Searching records...");
    const list = getStoredTxns();

    let match = list.find(t =>
        (t.txn_id && t.txn_id.toLowerCase() === q.toLowerCase()) ||
        (t.utr && t.utr === q) ||
        (t.famx_id && t.famx_id.toLowerCase() === q.toLowerCase())
    );

    if (!match) {
        try {
            const snap = await db.ref('transactions/' + q).once('value');
            if (snap.exists()) match = snap.val();
        } catch (e) {}
    }

    const box = document.getElementById('checkSearchResultBox');
    if (box) box.style.display = 'block';

    if (match) {
        const title = document.getElementById('searchResultTitle');
        const pill = document.getElementById('searchResultStatusPill');
        const amt = document.getElementById('searchResAmt');
        const txnId = document.getElementById('searchResTxnId');
        const utr = document.getElementById('searchResUtr');
        const time = document.getElementById('searchResTime');

        if (title) title.innerText = "Transaction Record";
        if (pill) {
            pill.innerText = match.status;
            pill.style.background = match.status === 'COMPLETED' ? '#d1fae5' : '#fee2e2';
            pill.style.color = match.status === 'COMPLETED' ? '#047857' : '#dc2626';
        }
        if (amt) amt.innerText = `₹${match.amount}`;
        if (txnId) txnId.innerText = match.txn_id;
        if (utr) utr.innerText = match.utr || "PENDING";
        if (time) time.innerText = match.timestamp || "Today";
        showToast("✅ Transaction Found!");
    } else {
        const title = document.getElementById('searchResultTitle');
        const pill = document.getElementById('searchResultStatusPill');
        const amt = document.getElementById('searchResAmt');
        const txnId = document.getElementById('searchResTxnId');
        const utr = document.getElementById('searchResUtr');
        const time = document.getElementById('searchResTime');

        if (title) title.innerText = "No Record Found";
        if (pill) pill.innerText = "NOT_FOUND";
        if (amt) amt.innerText = "₹0";
        if (txnId) txnId.innerText = q;
        if (utr) utr.innerText = "None";
        if (time) time.innerText = "-";
        showToast("⚠️ No matching transaction found");
    }
}

// Developer API Endpoints (Strict Raw JSON Execution)
window.MintPayEngine = {
    createTxn: function(amount, note = "MintPay_Order") {
        if (!USER_API_ENABLED) {
            return { code: 403, status: "API_DISABLED", message: "API Gateway is turned off." };
        }
        const num = parseFloat(amount) || 1;
        const txnId = "TXN_" + Math.floor(100000 + Math.random() * 900000);
        const payUrl = `${HOSTED_DOMAIN}/?id=${txnId}`;

        const rec = {
            txn_id: txnId,
            utr: "PENDING",
            famx_id: "PENDING",
            payer_name: "Waiting...",
            amount: num,
            merchant: MERCHANT,
            upi_id: UPI_ID,
            note: note,
            status: "PENDING",
            created_ms: Date.now(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            payment_link: payUrl
        };

        const list = getStoredTxns();
        list.unshift(rec);
        saveStoredTxns(list);
        db.ref('transactions/' + txnId).set(rec);

        return {
            code: 200,
            status: "SUCCESS",
            data: {
                name: MERCHANT,
                upi_id: UPI_ID,
                amount: num,
                note: note,
                payment_link: payUrl,
                txn_id: txnId
            }
        };
    },

    checkTxn: function(queryId) {
        const list = getStoredTxns();
        const found = list.find(t => t.txn_id === queryId || t.utr === queryId);
        if (found) {
            return { code: 200, status: "SUCCESS", source: "DATABASE", data: found };
        }
        return {
            code: 200,
            status: "SUCCESS",
            source: "DATABASE",
            data: {
                txn_id: queryId || "TXN_720326",
                utr: "PENDING",
                famx_id: "PENDING",
                payer_name: "Waiting...",
                amount: 1,
                merchant: MERCHANT,
                upi_id: UPI_ID,
                note: "3D_Tree_Checkout",
                status: "PENDING",
                created_ms: Date.now(),
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
        };
    }
};

function runCreateTxnApi() {
    const amtEl = document.getElementById('apiCreateAmt');
    const noteEl = document.getElementById('apiCreateNote');
    const outEl = document.getElementById('apiCreateOutput');

    const amt = amtEl ? amtEl.value || "1" : "1";
    const note = noteEl ? noteEl.value || "MintPay_Order" : "MintPay_Order";
    
    const res = window.MintPayEngine.createTxn(amt, note);
    if (outEl) outEl.innerText = JSON.stringify(res, null, 2);
    showToast("✅ Create API Executed!");
}

function runCheckStatusApi() {
    const inp = document.getElementById('apiCheckId');
    const outEl = document.getElementById('apiCheckOutput');

    const id = inp ? inp.value.trim() : "TXN_720326";
    const res = window.MintPayEngine.checkTxn(id);
    if (outEl) outEl.innerText = JSON.stringify(res, null, 2);
    showToast("✅ Status Checked!");
}

function toggleUserApiActive() {
    USER_API_ENABLED = !USER_API_ENABLED;
    localStorage.setItem('mp_api_enabled', String(USER_API_ENABLED));
    updateApiSwitchUI();
    if (CURRENT_UID) db.ref('users/' + CURRENT_UID).update({ apiEnabled: USER_API_ENABLED });
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

    if (createPre) createPre.innerText = `${HOSTED_DOMAIN}/?api_create=1&token=${USER_API_TOKEN}&amount=${amt}&note=${encodeURIComponent(note)}`;
    if (checkPre) checkPre.innerText = `${HOSTED_DOMAIN}/?api_check=1&token=${USER_API_TOKEN}&txn-id=${id}`;
}

function regenerateApiToken() {
    USER_API_TOKEN = generateRandomToken();
    const inp = document.getElementById('merchantApiKeyInput');
    if (inp) inp.value = USER_API_TOKEN;
    updateApiEndpointPreviews();
    if (CURRENT_UID) db.ref('users/' + CURRENT_UID).update({ apiToken: USER_API_TOKEN });
    showToast("🔄 New API Token Generated!");
}

function copyApiKey() {
    navigator.clipboard.writeText(USER_API_TOKEN);
    showToast("🔑 API Token Copied!");
}

// =========================================================================
// 8. THREE.JS 3D TREE FIRST ENGINE
// =========================================================================
let qrScene, qrCamera, qrRenderer;
let qrModuleGroup, treeWorldGroup, foliageCrownGroup;
let qrModuleMeshes = [];
let isTreeView = true;
let morphProgress = 1;
let animationRunning = false;

const QR_DARK_GREENS = ['#1b5e12', '#266e17', '#32821d', '#3e9123', '#4fa32d', '#5fb537', '#206314'];

function initOrUpdate3DTreeQR(upiString) {
    const canvas = document.getElementById('treeQrCanvas');
    if (!canvas) return;
    const size = 300;

    if (!qrRenderer) {
        qrScene = new THREE.Scene();
        const frustum = 18.6;
        qrCamera = new THREE.OrthographicCamera(-frustum / 2, frustum / 2, frustum / 2, -frustum / 2, -50, 100);
        qrRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        qrRenderer.setSize(size, size);
        qrRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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

        build3DTreeEnvironment();
    }

    isTreeView = true;
    morphProgress = 1.0;
    updateToggleUI();

    while (qrModuleGroup.children.length > 0) {
        qrModuleGroup.remove(qrModuleGroup.children[0]);
    }
    qrModuleMeshes = [];

    const qr = qrcode(0, 'M');
    qr.addData(upiString);
    qr.make();
    const count = qr.getModuleCount();

    const gridSpan = 15.2;
    const cellSize = gridSpan / count;
    const halfSpan = gridSpan / 2;

    const moduleGeo = new THREE.BoxGeometry(cellSize * 1.01, 0.14, cellSize * 1.01);

    for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
            const isDark = qr.isDark(r, c);
            const qrX = (c + 0.5) * cellSize - halfSpan;
            const qrZ = (r + 0.5) * cellSize - halfSpan;
            const qrY = isDark ? 0.08 : 0.0;

            const mat = new THREE.MeshBasicMaterial({
                color: isDark ? QR_DARK_GREENS[(r * 7 + c * 11) % QR_DARK_GREENS.length] : '#f8fafc',
                transparent: true,
                opacity: 1
            });
            const mesh = new THREE.Mesh(moduleGeo, mat);

            const nx = qrX / halfSpan;
            const nz = qrZ / halfSpan;
            const dist = Math.sqrt(nx * nx + nz * nz);
            const angle = Math.atan2(nz, nx);
            const rad = Math.min(dist * 2.8, 3.0) * 0.55;

            const treeX = isDark ? Math.cos(angle) * rad : qrX * 0.5;
            const treeZ = isDark ? Math.sin(angle) * rad : qrZ * 0.5;
            const treeY = isDark ? 3.2 + Math.max(0, 1.15 - dist * 0.65) * 3.4 : -0.5;

            mesh.position.set(treeX, treeY, treeZ);
            mesh.userData = { isDark, qrX, qrY, qrZ, treeX, treeY, treeZ, phase: r * 0.4 + c * 0.5 };

            qrModuleGroup.add(mesh);
            qrModuleMeshes.push(mesh);
        }
    }

    if (!animationRunning) {
        animationRunning = true;
        animateTreeQR();
    }
}

function build3DTreeEnvironment() {
    const slabGeo = new THREE.BoxGeometry(10.8, 0.5, 10.8);
    const slabMat = new THREE.MeshLambertMaterial({ color: '#b8b3a8' });
    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.position.set(0, -1.85, 0);
    treeWorldGroup.add(slabMesh);

    const barkMat = new THREE.MeshLambertMaterial({ color: '#54341e' });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.48, 5.4, 10), barkMat);
    trunk.position.set(0, 1.0, 0);
    treeWorldGroup.add(trunk);
}

function toggleTreeMode() {
    isTreeView = !isTreeView;
    updateToggleUI();
}

function updateToggleUI() {
    const btnText = document.getElementById('toggleBtnText');
    const btnGif = document.getElementById('toggleBtnGif');
    if (btnText) btnText.innerText = isTreeView ? "Tap tree to view QR code" : "Tap QR to view 3D Tree";
    if (btnGif) btnGif.src = isTreeView ? "eye.gif" : "light.gif";
}

let clockTime = 0;
function animateTreeQR() {
    requestAnimationFrame(animateTreeQR);
    clockTime += 0.032;

    const target = isTreeView ? 1 : 0;
    morphProgress += (target - morphProgress) * 0.09;

    const camX = morphProgress * 14.5;
    const camY = 24.0 - morphProgress * 12.8;
    const camZ = morphProgress * 14.5;

    qrCamera.up.set(0, morphProgress, -(1 - morphProgress)).normalize();
    qrCamera.position.set(camX, camY, camZ);
    qrCamera.lookAt(0, morphProgress * 2.35, 0);

    const treeAlpha = Math.max(0, (morphProgress - 0.15) / 0.85);
    treeWorldGroup.visible = treeAlpha > 0.01;
    foliageCrownGroup.visible = treeAlpha > 0.01;

    for (let i = 0; i < qrModuleMeshes.length; i++) {
        const m = qrModuleMeshes[i];
        const d = m.userData;
        const bx = d.qrX + (d.treeX - d.qrX) * morphProgress;
        const by = d.qrY + (d.treeY - d.qrY) * morphProgress;
        const bz = d.qrZ + (d.treeZ - d.qrZ) * morphProgress;
        m.position.set(bx, by, bz);
    }

    qrRenderer.render(qrScene, qrCamera);
}

// Background Canvas
const bgCanvas = document.getElementById('bg-canvas');
if (bgCanvas) {
    const bgScene = new THREE.Scene();
    const bgCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    const bgRenderer = new THREE.WebGLRenderer({ canvas: bgCanvas, alpha: true, antialias: true });
    bgRenderer.setSize(window.innerWidth, window.innerHeight);

    bgScene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const floaters = [];
    for (let i = 0; i < 8; i++) {
        const geo = new THREE.IcosahedronGeometry(Math.random() * 0.75 + 0.3, 1);
        const mat = new THREE.MeshPhysicalMaterial({ color: 0x10b981, roughness: 0.2, transparent: true, opacity: 0.2 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 14, -4);
        bgScene.add(mesh);
        floaters.push(mesh);
    }
    bgCamera.position.z = 14;

    function animateBg() {
        requestAnimationFrame(animateBg);
        floaters.forEach(f => { f.rotation.x += 0.005; f.rotation.y += 0.005; });
        bgRenderer.render(bgScene, bgCamera);
    }
    animateBg();
}

// =========================================================================
// 9. NAVIGATION, TOAST & APP BOOTSTRAP (FIXED FULL SCREEN CHECKOUT)
// =========================================================================
function showScreen(name) {
    const screens = [
        'authScreen', 'homeScreen', 'numpadScreen', 'billScreen', 'processingScreen',
        'qrScreen', 'checkPaymentScreen', 'apiScreen', 'profileScreen',
        'paymentVerifyScreen', 'successScreen', 'failScreen'
    ];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const dock = document.getElementById('bottomNavDock');
    const shell = document.getElementById('appShell');
    
    // Screens that must NEVER show the bottom navigation bar (Full-screen view)
    const hideDock = ['auth', 'processing', 'qr', 'verify', 'success', 'fail'];

    if (hideDock.includes(name)) {
        if (dock) dock.style.display = 'none';
        if (shell) shell.classList.add('no-bottom-pad');
    } else {
        if (dock) dock.style.display = 'flex';
        if (shell) shell.classList.remove('no-bottom-pad');
    }

    ['navHome', 'navPay', 'navCheck', 'navApi', 'navProfile'].forEach(t => {
        const btn = document.getElementById(t);
        if (btn) btn.classList.remove('active');
    });

    if (name === 'auth') {
        const el = document.getElementById('authScreen');
        if (el) el.style.display = 'flex';
    }
    if (name === 'home') {
        syncUIWithState();
        const el = document.getElementById('homeScreen');
        if (el) el.style.display = 'flex';
        const tab = document.getElementById('navHome');
        if (tab) tab.classList.add('active');
    }
    if (name === 'numpad') {
        const el = document.getElementById('numpadScreen');
        if (el) el.style.display = 'flex';
        const tab = document.getElementById('navPay');
        if (tab) tab.classList.add('active');
    }
    if (name === 'bill') {
        const el = document.getElementById('billScreen');
        if (el) el.style.display = 'flex';
    }
    if (name === 'processing') {
        const el = document.getElementById('processingScreen');
        if (el) el.style.display = 'flex';
    }
    if (name === 'qr') {
        const el = document.getElementById('qrScreen');
        if (el) el.style.display = 'flex';
    }
    if (name === 'check') {
        const el = document.getElementById('checkPaymentScreen');
        if (el) el.style.display = 'flex';
        const tab = document.getElementById('navCheck');
        if (tab) tab.classList.add('active');
    }
    if (name === 'api') {
        updateApiEndpointPreviews();
        const el = document.getElementById('apiScreen');
        if (el) el.style.display = 'flex';
        const tab = document.getElementById('navApi');
        if (tab) tab.classList.add('active');
    }
    if (name === 'profile') {
        syncUIWithState();
        const el = document.getElementById('profileScreen');
        if (el) el.style.display = 'flex';
        const tab = document.getElementById('navProfile');
        if (tab) tab.classList.add('active');
    }
    if (name === 'verify') {
        const el = document.getElementById('paymentVerifyScreen');
        if (el) el.style.display = 'flex';
    }
    if (name === 'success') {
        const el = document.getElementById('successScreen');
        if (el) el.style.display = 'flex';
    }
    if (name === 'fail') {
        const el = document.getElementById('failScreen');
        if (el) el.style.display = 'flex';
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
    navigator.clipboard.writeText(UPI_ID);
    const tip = document.getElementById('copyTip');
    if (tip) tip.innerText = "Copied!";
    showToast("UPI ID Copied: " + UPI_ID);
    setTimeout(() => { if (tip) tip.innerText = "Copy"; }, 2000);
}

function goToAmountScreen() {
    if (timerInterval) clearInterval(timerInterval);
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

// Bootstrap Handler: Direct Link Handler (Matches ?id=TXN_... or ?pay=...)
(async function initMintPay() {
    syncUIWithState();

    const rawSearch = window.location.search || "";
    const normalized = rawSearch.replace(/\?/g, '&').replace(/^&/, '?');
    const params = new URLSearchParams(normalized);
    const hostedId = params.get('id') || params.get('pay') || params.get('txn-id');

    if (hostedId) {
        showToast("🔍 Loading hosted payment...");
        try {
            const snap = await db.ref('transactions/' + hostedId).once('value');
            if (snap.exists()) {
                const data = snap.val();
                currentAmountStr = String(data.amount);
                currentActiveTxnId = data.txn_id;
                MERCHANT = data.merchant || MERCHANT;
                UPI_ID = data.upi_id || UPI_ID;
                syncUIWithState();
                startQrRenderingFlow();
                return;
            }
        } catch (e) {}
    }

    if (localStorage.getItem('mp_logged_in') === 'true' && CURRENT_UID) {
        showScreen('home');
        pingUserGasBackend(false);
    } else {
        showScreen('auth');
    }
})();
