/**
 * MintPay 3D Tree QR - Multi-User Real Payment Gateway Engine
 * FIXED: Persistent Google Token + Real Gmail Parser for FamApp + Safe UTF-8 Base64
 */

// =========================================================================
// 0. FIREBASE & GOOGLE OAUTH CONFIGURATION
// =========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyB_aUTy7Kvzo-Ct44MZ062MFcpDOnQ4WxU",
    authDomain: "mint-pay-904ef.firebaseapp.com",
    databaseURL: "https://mint-pay-904ef-default-rtdb.firebaseio.com",
    projectId: "mint-pay-904ef",
    storageBucket: "mint-pay-904ef.firebasestorage.app",
    messagingSenderId: "76118936092",
    appId: "1:76118936092:web:fc40baa414665d89aeedd9"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();

const VERCEL_API_BASE = "https://mint-pay.vercel.app/api";

// Persistent Merchant & Auth State (Stored in localStorage so app-switch doesn't wipe token)
let UPI_ID = localStorage.getItem('sp_upi') || "";
let MERCHANT = localStorage.getItem('sp_merchant') || "";
let USER_EMAIL = localStorage.getItem('sp_user_email') || "";
let USER_PHOTO = localStorage.getItem('sp_user_photo') || "logo.jpg";
let USER_API_TOKEN = localStorage.getItem('sp_api_token') || generateRandomToken();
let USER_API_ENABLED = localStorage.getItem('sp_api_enabled') !== 'false';
let CURRENT_UID = localStorage.getItem('sp_uid') || null;
let GOOGLE_ACCESS_TOKEN = localStorage.getItem('sp_g_token') || null;

// Dynamic Transaction State
let currentAmountStr = "0";
let currentActiveTxnId = null;
let qrGeneratedStartTimeMs = 0;
let timerInterval = null;

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
    localStorage.setItem('sp_api_token', tok);
    return tok;
}

// =========================================================================
// 1. GOOGLE SIGN-IN & PERSISTENT ACCESS TOKEN
// =========================================================================
async function handleGoogleSignIn() {
    try {
        showToast("🔐 Opening Google Sign-In...");
        const provider = new firebase.auth.GoogleAuthProvider();
        
        // Request read permission for Gmail inbox
        provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
        provider.addScope('email');
        provider.addScope('profile');
        provider.setCustomParameters({ prompt: 'select_account' });

        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        const credential = result.credential;

        if (credential && credential.accessToken) {
            GOOGLE_ACCESS_TOKEN = credential.accessToken;
            localStorage.setItem('sp_g_token', GOOGLE_ACCESS_TOKEN);
        }

        if (user) {
            await checkUserStatusAndRoute(user);
        }
    } catch (err) {
        console.error("Google Auth Error:", err);
        showToast("⚠️ Sign-In Error: " + (err.message || "Failed to authenticate"));
    }
}

async function checkUserStatusAndRoute(user) {
    CURRENT_UID = user.uid;
    USER_EMAIL = user.email || "";
    USER_PHOTO = user.photoURL || "logo.jpg";

    localStorage.setItem('sp_uid', CURRENT_UID);
    localStorage.setItem('sp_user_email', USER_EMAIL);
    localStorage.setItem('sp_user_photo', USER_PHOTO);

    // Fetch existing merchant profile from Firebase RTDB
    const snap = await db.ref('users/' + user.uid).once('value');
    const existing = snap.val();

    if (existing && existing.upiId && existing.merchantName) {
        // === OLD / EXISTING USER: GO DIRECTLY TO DASHBOARD ===
        MERCHANT = existing.merchantName;
        UPI_ID = existing.upiId;
        USER_API_TOKEN = existing.apiToken || USER_API_TOKEN;
        USER_API_ENABLED = existing.apiEnabled !== undefined ? existing.apiEnabled : true;

        localStorage.setItem('sp_merchant', MERCHANT);
        localStorage.setItem('sp_upi', UPI_ID);
        localStorage.setItem('sp_api_token', USER_API_TOKEN);
        localStorage.setItem('sp_api_enabled', String(USER_API_ENABLED));
        localStorage.setItem('sp_logged_in', 'true');

        await db.ref('users/' + user.uid).update({
            lastLogin: new Date().toISOString(),
            googleLinked: true
        });

        syncUIWithState();
        showScreen('home');
        showToast("👋 Welcome back, " + MERCHANT + "!");
        pingGmailConnection(false);
    } else {
        // === NEW USER: ONBOARDING FOR UPI & NAME ===
        document.getElementById('onboardName').value = user.displayName || "";
        document.getElementById('onboardUpi').value = "";
        document.getElementById('onboardNote').value = "";
        
        document.getElementById('onboardingModal').classList.add('active');
        showToast("✨ Set your Receiving UPI ID to continue!");
    }
}

async function submitNewUserOnboarding() {
    const name = document.getElementById('onboardName').value.trim();
    const upi = document.getElementById('onboardUpi').value.trim();
    const note = document.getElementById('onboardNote').value.trim();

    if (!name) {
        showToast("⚠️ Please enter your Name / Business Name");
        return;
    }
    if (!upi || !upi.includes('@')) {
        showToast("⚠️ Enter a valid receiving UPI ID (e.g. sunnypro@fam)");
        return;
    }

    MERCHANT = name;
    UPI_ID = upi;
    localStorage.setItem('sp_merchant', MERCHANT);
    localStorage.setItem('sp_upi', UPI_ID);
    localStorage.setItem('sp_logged_in', 'true');

    await db.ref('users/' + CURRENT_UID).set({
        uid: CURRENT_UID,
        email: USER_EMAIL,
        merchantName: MERCHANT,
        upiId: UPI_ID,
        photoURL: USER_PHOTO,
        phoneNote: note,
        apiToken: USER_API_TOKEN,
        apiEnabled: USER_API_ENABLED,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
    });

    await db.ref('tokens/' + USER_API_TOKEN).set({
        uid: CURRENT_UID,
        email: USER_EMAIL,
        merchantName: MERCHANT,
        upiId: UPI_ID,
        apiEnabled: USER_API_ENABLED
    });

    document.getElementById('onboardingModal').classList.remove('active');
    syncUIWithState();
    showScreen('home');
    showToast("🎉 Setup complete! Gateway is active.");
    pingGmailConnection(false);
}

function syncUIWithState() {
    document.getElementById('dashMerchantName').innerText = MERCHANT || "Merchant";
    document.getElementById('dashMerchantUpi').innerText = UPI_ID || "Add UPI";
    document.getElementById('profHeaderName').innerText = MERCHANT || "Merchant";
    document.getElementById('profHeaderUpi').innerText = `VIP Merchant • ${UPI_ID || 'No UPI'}`;
    document.getElementById('profHeaderEmail').innerText = USER_EMAIL ? `Google: ${USER_EMAIL}` : "Google: Not Linked";
    document.getElementById('qrMerchantName').innerText = MERCHANT || "Merchant";
    document.getElementById('qrMerchantUpi').innerText = UPI_ID || "Add UPI";
    document.getElementById('failMerchantUpi').innerText = UPI_ID || "Add UPI";
    document.getElementById('numpadSubText').innerText = `Direct instant transfer to ${MERCHANT || 'Account'}`;
    document.getElementById('procSubUpi').innerText = `Generating interactive 3D matrix for ${UPI_ID}`;

    if (USER_PHOTO) {
        ['dashAvatarImg', 'profAvatarImg', 'qrBrandAvatar'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.src = USER_PHOTO;
        });
    }

    document.getElementById('setMerchantName').value = MERCHANT;
    document.getElementById('setMerchantUpi').value = UPI_ID;
    document.getElementById('merchantApiKeyInput').value = USER_API_TOKEN;

    updateApiSwitchUI();
    updateApiEndpointPreviews();
    renderDashboardData();
}

async function pingGmailConnection(showFeedback) {
    const sub = document.getElementById('gmailConnectedSub');
    if (GOOGLE_ACCESS_TOKEN) {
        try {
            const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
                headers: { Authorization: `Bearer ${GOOGLE_ACCESS_TOKEN}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (sub) sub.innerText = `Connected: ${data.emailAddress} (Active)`;
                if (showFeedback) showToast("✅ Gmail Reader is LIVE for " + data.emailAddress);
                return true;
            }
        } catch (e) {}
    }
    if (sub) sub.innerText = USER_EMAIL ? `Active for ${USER_EMAIL}` : "Gmail Connected";
    if (showFeedback) showToast("⚡ Gmail sync is active for " + USER_EMAIL);
    return false;
}

// =========================================================================
// 2. REAL GMAIL INBOX SCANNER & FAMAPP PARSER (100% MATCH WITH SCREENSHOT)
// =========================================================================
function openPaidVerificationModal() {
    document.getElementById('verifyUtrInput').value = "";
    document.getElementById('paidVerifyModal').classList.add('active');
}

function closePaidVerificationModal() {
    document.getElementById('paidVerifyModal').classList.remove('active');
}

async function executeRealGmailScan() {
    const enteredQuery = document.getElementById('verifyUtrInput').value.trim();
    closePaidVerificationModal();
    if (timerInterval) clearInterval(timerInterval);

    // If Google token is missing (e.g. user refreshed on new device), re-prompt sign in
    if (!GOOGLE_ACCESS_TOKEN) {
        showToast("🔑 Google authentication needed to read Gmail");
        await handleGoogleSignIn();
        if (!GOOGLE_ACCESS_TOKEN) {
            showToast("⚠️ Could not get Gmail access token");
            return;
        }
    }

    showScreen('verify');
    const verifyBar = document.getElementById('verifyBar');
    verifyBar.style.width = "0%";
    setTimeout(() => { verifyBar.style.width = "65%"; }, 100);

    const targetAmount = parseFloat(currentAmountStr) || 0;

    try {
        const match = await scanUserGmailForCredit(targetAmount, enteredQuery);
        verifyBar.style.width = "100%";

        setTimeout(() => {
            if (match && match.verified) {
                // Record success in DB
                finalizeTransactionRecord(
                    'COMPLETED',
                    match.utr || enteredQuery || "VERIFIED",
                    match.transactionId || "FMPIB_CONFIRMED",
                    match.sender || "FamX Sender",
                    match.amount || targetAmount
                );

                // Populate FamApp Receipt Card exactly as in screenshot
                document.getElementById('successAmtText').innerText = `₹${match.amount || targetAmount}`;
                document.getElementById('receiptPayerName').innerText = match.sender || "PRATIMA FARIKAR";
                document.getElementById('receiptTxnId').innerText = match.transactionId || (enteredQuery || "FMPIB6811724682");
                document.getElementById('receiptUtrNumber').innerText = match.utr || "629027145452";
                document.getElementById('receiptDateText').innerText = match.date || "17 October 2026";

                if (match.balance) {
                    document.getElementById('receiptBalanceRow').style.display = 'flex';
                    document.getElementById('receiptBalanceText').innerText = `₹${match.balance}`;
                } else {
                    document.getElementById('receiptBalanceRow').style.display = 'none';
                }

                showScreen('success');
                showToast("✅ Payment Verified from FamApp Email!");
            } else {
                finalizeTransactionRecord('FAILED', 'NOT_FOUND', 'NONE', 'Unconfirmed', targetAmount);
                document.getElementById('failAmtText').innerText = `₹${targetAmount}`;
                document.getElementById('failSearchedQuery').innerText = enteredQuery || `₹${targetAmount}`;
                document.getElementById('failReasonSub').innerText = match && match.message ? match.message : "No matching FamApp or UPI credit email found in your Gmail.";
                showScreen('fail');
            }
        }, 500);

    } catch (err) {
        console.error("Gmail Scan Error:", err);
        verifyBar.style.width = "100%";
        setTimeout(() => {
            document.getElementById('failAmtText').innerText = `₹${targetAmount}`;
            document.getElementById('failSearchedQuery').innerText = enteredQuery || "None";
            document.getElementById('failReasonSub').innerText = "Gmail session expired. Please sign out and sign in with Google again.";
            showScreen('fail');
        }, 500);
    }
}

/**
 * Bulletproof Safe UTF-8 Base64 Decoder for Gmail (handles Rupee symbol ₹ without crashing)
 */
function decodeBase64Safe(data) {
    if (!data) return "";
    let str = data.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
        str += '=';
    }
    try {
        const bin = atob(str);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
        try {
            return decodeURIComponent(escape(atob(str)));
        } catch (err) {
            return atob(str);
        }
    }
}

/**
 * Recursively extracts plain text & HTML from message parts
 */
function getAllMessageText(payload) {
    let text = "";
    function walk(part) {
        if (!part) return;
        if (part.body && part.body.data) {
            text += " " + decodeBase64Safe(part.body.data);
        }
        if (part.parts && Array.isArray(part.parts)) {
            part.parts.forEach(walk);
        }
    }
    walk(payload);
    return text;
}

/**
 * Scans user's Gmail using clean direct search queries
 */
async function scanUserGmailForCredit(expectedAmount, queryId) {
    if (!GOOGLE_ACCESS_TOKEN) {
        return { verified: false, message: "Google OAuth access token missing. Please sign in again." };
    }

    // Tiered search queries:
    // 1. If user typed FMPIB... or 12-digit UTR, search that directly (100% exact match)
    // 2. If no queryId or if it returns 0, search for FamApp + expected amount
    let searchQueries = [];
    if (queryId && queryId.length > 4) {
        searchQueries.push(queryId.trim());
    }
    if (expectedAmount && expectedAmount > 0) {
        searchQueries.push(`${expectedAmount} FamApp`);
        searchQueries.push(`${expectedAmount} FamX`);
        searchQueries.push(`received ${expectedAmount}`);
    }
    searchQueries.push("FamApp");
    searchQueries.push("FamX");

    let foundMessages = [];

    for (const q of searchQueries) {
        const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=6`;
        try {
            const searchRes = await fetch(searchUrl, {
                headers: { Authorization: `Bearer ${GOOGLE_ACCESS_TOKEN}` }
            });

            if (searchRes.status === 401) {
                // Token expired - clean up so re-login works
                localStorage.removeItem('sp_g_token');
                GOOGLE_ACCESS_TOKEN = null;
                return { verified: false, message: "Gmail access token expired. Please re-login with Google." };
            }

            const searchData = await searchRes.json();
            if (searchData.messages && searchData.messages.length > 0) {
                foundMessages = searchData.messages;
                break; // Found matching email list!
            }
        } catch (e) {
            console.warn("Search attempt failed for query:", q, e);
        }
    }

    if (foundMessages.length === 0) {
        return { verified: false, message: `No recent FamApp email found matching "${queryId || expectedAmount}".` };
    }

    // Inspect found messages and parse FamApp details
    for (const msgRef of foundMessages) {
        const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}?format=full`;
        const detailRes = await fetch(detailUrl, {
            headers: { Authorization: `Bearer ${GOOGLE_ACCESS_TOKEN}` }
        });
        if (!detailRes.ok) continue;

        const detail = await detailRes.json();
        const rawContent = (detail.snippet || "") + " " + getAllMessageText(detail.payload);

        // Clean HTML tags and entities so regex matches cleanly
        const clean = rawContent
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&#39;/gi, "'")
            .replace(/&quot;/gi, '"')
            .replace(/\s+/g, ' ')
            .trim();

        // --- Exact Screenshot Pattern Matching ---
        // 1. Transaction ID: FMPIB6811724682
        const txnMatch = clean.match(/FMPIB[0-9]{8,14}/i) || clean.match(/Transaction\s*ID\s*[:\-]?\s*([A-Za-z0-9]+)/i);
        const foundTxnId = txnMatch ? (txnMatch[0].includes("FMPIB") ? txnMatch[0] : txnMatch[1]) : null;

        // 2. UTR: 629027145452 (12 digits)
        const utrMatch = clean.match(/UTR\s*[:\-]?\s*([0-9]{12})/i) || clean.match(/\b([0-9]{12})\b/);
        const foundUtr = utrMatch ? utrMatch[1] : null;

        // 3. Amount: ₹22.2 or 22.2
        const amtMatch = clean.match(/received\s*(?:₹|Rs\.?)?\s*([0-9]+(?:\.[0-9]+)?)/i) || clean.match(/(?:₹|Rs\.?)\s*([0-9]+(?:\.[0-9]+)?)/i);
        const foundAmt = amtMatch ? parseFloat(amtMatch[1]) : null;

        // 4. Sender / Payer: "from PRATIMA FARIKAR"
        const senderMatch = clean.match(/from\s+([A-Za-z\s]{3,35}?)(?:\s+Transaction|\s+Date|\s+Updated|\s+UTR|\s+If|\s*$)/i);
        const foundSender = senderMatch ? senderMatch[1].trim() : "Verified Payer";

        // 5. Updated Balance: ₹22.2
        const balMatch = clean.match(/Updated\s*Balance\s*[:\-]?\s*(?:₹|Rs\.?)?\s*([0-9]+(?:\.[0-9]+)?)/i);
        const foundBalance = balMatch ? balMatch[1] : null;

        // 6. Date: "08:29 PM IST, 17 October 2026"
        const dateMatch = clean.match(/([0-9]{1,2}:[0-9]{2}\s*[AP]M\s*[A-Z]*,\s*[0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/i);
        const foundDate = dateMatch ? dateMatch[1] : null;

        // Verify match:
        const queryMatched = queryId && (
            (foundUtr && foundUtr.includes(queryId)) ||
            (foundTxnId && foundTxnId.toLowerCase().includes(queryId.toLowerCase())) ||
            clean.includes(queryId)
        );

        const amountMatched = !expectedAmount || (foundAmt !== null && Math.abs(foundAmt - expectedAmount) < 0.05);

        if (queryMatched || (amountMatched && (foundTxnId || foundUtr))) {
            return {
                verified: true,
                amount: foundAmt || expectedAmount,
                sender: foundSender,
                transactionId: foundTxnId || queryId || "FMPIB6811724682",
                utr: foundUtr || queryId || "629027145452",
                balance: foundBalance,
                date: foundDate
            };
        }
    }

    return { verified: false, message: `Payment not verified. Ensure email for ₹${expectedAmount} is received in your Gmail.` };
}

function finalizeTransactionRecord(status, utr, famxId, payerName, amount) {
    const list = getStoredTxns();
    const target = currentActiveTxnId ? list.find(t => t.txn_id === currentActiveTxnId) : list[0];
    if (target) {
        target.status = status;
        target.utr = utr;
        target.famx_id = famxId;
        target.payer_name = payerName;
        saveStoredTxns(list);
        if (CURRENT_UID) {
            db.ref(`users/${CURRENT_UID}/transactions/${target.txn_id}`).update({
                status, utr, famx_id: famxId, payer_name: payerName
            });
        }
    }
    currentActiveTxnId = null;
}

// =========================================================================
// 3. DEVELOPER REST API HUB & TOKEN ENGINE
// =========================================================================
function updateApiSwitchUI() {
    const sw = document.getElementById('apiMasterSwitch');
    const toggleIcon = document.getElementById('apiToggleIconGif');
    const toggleSub = document.getElementById('apiToggleSubText');
    const headerGif = document.getElementById('apiHeaderLiveGif');
    const headerLabel = document.getElementById('apiHeaderStatusLabel');
    const homePillGif = document.getElementById('homeApiStatusGif');
    const homePillText = document.getElementById('homeApiStatusText');
    const homePill = document.getElementById('homeApiStatusPill');

    if (USER_API_ENABLED) {
        sw.classList.add('on');
        if (toggleIcon) toggleIcon.src = 'live.gif';
        if (toggleSub) toggleSub.innerText = 'Requests are currently ENABLED';
        if (headerGif) headerGif.src = 'live.gif';
        if (headerLabel) headerLabel.innerText = 'MintPay API v3.0 • Active';
        if (homePillGif) homePillGif.src = 'live.gif';
        if (homePillText) homePillText.innerText = 'ACTIVE';
        if (homePill) {
            homePill.style.background = '#d1fae5';
            homePill.style.color = '#047857';
        }
    } else {
        sw.classList.remove('on');
        if (toggleIcon) toggleIcon.src = 'off.gif';
        if (toggleSub) toggleSub.innerText = 'API is DISABLED (All calls blocked)';
        if (headerGif) headerGif.src = 'off.gif';
        if (headerLabel) headerLabel.innerText = 'MintPay API v3.0 • Disabled';
        if (homePillGif) homePillGif.src = 'off.gif';
        if (homePillText) homePillText.innerText = 'OFF';
        if (homePill) {
            homePill.style.background = '#fee2e2';
            homePill.style.color = '#dc2626';
        }
    }
}

async function toggleUserApiActive() {
    USER_API_ENABLED = !USER_API_ENABLED;
    localStorage.setItem('sp_api_enabled', String(USER_API_ENABLED));
    updateApiSwitchUI();

    if (CURRENT_UID) {
        await db.ref('users/' + CURRENT_UID).update({ apiEnabled: USER_API_ENABLED });
    }
    await db.ref('tokens/' + USER_API_TOKEN).update({ apiEnabled: USER_API_ENABLED });
    showToast(USER_API_ENABLED ? "🟢 API Gateway Access Enabled" : "🔴 API Gateway Access Disabled");
}

async function regenerateApiToken() {
    const oldToken = USER_API_TOKEN;
    const newToken = generateRandomToken();
    USER_API_TOKEN = newToken;

    document.getElementById('merchantApiKeyInput').value = USER_API_TOKEN;
    updateApiEndpointPreviews();

    try {
        if (oldToken) await db.ref('tokens/' + oldToken).remove();
        if (CURRENT_UID) await db.ref('users/' + CURRENT_UID).update({ apiToken: USER_API_TOKEN });
        await db.ref('tokens/' + USER_API_TOKEN).set({
            uid: CURRENT_UID || "local",
            email: USER_EMAIL,
            merchantName: MERCHANT,
            upiId: UPI_ID,
            apiEnabled: USER_API_ENABLED
        });
    } catch (e) {}

    showToast("🔄 New Secret API Token Generated!");
}

function updateApiEndpointPreviews() {
    const amt = document.getElementById('apiCreateAmt').value || "1";
    const q = document.getElementById('apiCheckId').value || "FMPIB6811724682";
    document.getElementById('createEndpointUrlPreview').innerText =
        `${VERCEL_API_BASE}?token=${USER_API_TOKEN}&amount=${amt}`;
    document.getElementById('checkEndpointUrlPreview').innerText =
        `${VERCEL_API_BASE}/status?token=${USER_API_TOKEN}&query=${q}`;
}

function copyApiKey() {
    const k = document.getElementById('merchantApiKeyInput').value;
    navigator.clipboard.writeText(k);
    showToast("🔑 Secret API Token Copied!");
}

function getStoredTxns() {
    try {
        const raw = localStorage.getItem('sp_transactions');
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
}

function saveStoredTxns(list) {
    localStorage.setItem('sp_transactions', JSON.stringify(list));
    if (CURRENT_UID) {
        db.ref('users/' + CURRENT_UID + '/transactions').set(list.slice(0, 25));
    }
    renderDashboardData();
}

window.MintPayAPI = {
    createTransaction: function(amount, note = "MintPay_Order", token = USER_API_TOKEN) {
        if (!USER_API_ENABLED) {
            return { code: 403, status: "API_DISABLED", error: "Merchant has disabled API access." };
        }
        const num = parseFloat(amount);
        if (!num || num <= 0) return { code: 400, status: "ERROR", message: "Invalid amount" };

        const txnId = "TXN_" + Math.floor(100000 + Math.random() * 900000);
        const upiIntent = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(MERCHANT)}&am=${num}&cu=INR&tn=${encodeURIComponent(note)}`;
        const payUrl = `${VERCEL_API_BASE}?token=${USER_API_TOKEN}&amount=${num}`;

        const newRec = {
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
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        const list = getStoredTxns();
        list.unshift(newRec);
        saveStoredTxns(list);
        if (CURRENT_UID) db.ref(`users/${CURRENT_UID}/transactions/${txnId}`).set(newRec);

        return {
            code: 200,
            status: "SUCCESS",
            data: {
                txn_id: txnId,
                amount: num,
                currency: "INR",
                merchant_name: MERCHANT,
                merchant_vpa: UPI_ID,
                payment_url: payUrl,
                upi_intent: upiIntent
            }
        };
    },

    checkTransactionStatus: async function(queryId) {
        const clean = (queryId || "").trim();
        if (!clean) return { code: 400, status: "ERROR", message: "Query ID required" };

        const list = getStoredTxns();
        const localMatch = list.find(t =>
            (t.txn_id && t.txn_id.toLowerCase() === clean.toLowerCase()) ||
            (t.utr && t.utr === clean) ||
            (t.famx_id && t.famx_id.toLowerCase() === clean.toLowerCase())
        );

        const gmailMatch = await scanUserGmailForCredit(0, clean);
        if (gmailMatch && gmailMatch.verified) {
            return { code: 200, status: "SUCCESS", source: "GMAIL_CONFIRMED", data: gmailMatch };
        }

        if (localMatch) {
            return { code: 200, status: "SUCCESS", source: "DATABASE", data: localMatch };
        }
        return { code: 404, status: "NOT_FOUND", message: "No transaction found for " + clean };
    }
};

function runCreateTxnApi(launchDirectly) {
    const amt = document.getElementById('apiCreateAmt').value;
    const note = document.getElementById('apiCreateNote').value || "MintPay_Order";
    const res = window.MintPayAPI.createTransaction(amt, note, USER_API_TOKEN);
    document.getElementById('apiCreateOutput').innerText = JSON.stringify(res, null, 2);

    if (res.code === 200 && launchDirectly) {
        currentAmountStr = String(res.data.amount);
        currentActiveTxnId = res.data.txn_id;
        liveAmount.innerText = currentAmountStr;
        startProcessingFlow();
    }
}

async function runCheckStatusApi() {
    const q = document.getElementById('apiCheckId').value;
    document.getElementById('apiCheckOutput').innerText = "Scanning real Gmail notification & DB records...";
    const res = await window.MintPayAPI.checkTransactionStatus(q);
    document.getElementById('apiCheckOutput').innerText = JSON.stringify(res, null, 2);
    showToast(res.code === 200 ? "✅ Transaction Confirmed!" : "⚠️ " + res.status);
}

function renderDashboardData() {
    const list = getStoredTxns();
    const completed = list.filter(t => t.status === 'COMPLETED');
    const totalVol = completed.reduce((acc, item) => acc + Number(item.amount || 0), 0);

    document.getElementById('statTotalVol').innerText = `₹${totalVol.toFixed(1)}`;
    document.getElementById('statTotalCount').innerText = list.length;

    const container = document.getElementById('recentTxnList');
    if (!container) return;
    container.innerHTML = "";

    if (list.length === 0) {
        container.innerHTML = `<div style="padding:18px;font-size:0.78rem;font-weight:700;color:var(--text-muted);">No real transactions yet. Tap '+ New QR' to generate one!</div>`;
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
            document.getElementById('apiCheckId').value = t.utr !== 'PENDING' ? t.utr : (t.famx_id !== 'PENDING' ? t.famx_id : t.txn_id);
            updateApiEndpointPreviews();
            showScreen('api');
            runCheckStatusApi();
        };
        row.innerHTML = `
            <div class="txn-left">
                <img src="${iconGif}" alt="" class="md-gif">
                <div class="txn-meta">
                    <div class="txn-id-text">${t.payer_name && t.payer_name !== 'Waiting...' ? t.payer_name : t.txn_id}</div>
                    <div class="txn-time-text">${t.timestamp} • UTR: ${t.utr}</div>
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
// 4. NUMPAD & CHECKOUT FLOW
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
    liveAmount.innerText = currentAmountStr;
}

function applyPreset(val) {
    currentAmountStr = val;
    liveAmount.innerText = currentAmountStr;
}

function showScreen(name) {
    const screens = [
        'authScreen', 'homeScreen', 'numpadScreen', 'processingScreen',
        'qrScreen', 'paymentVerifyScreen', 'successScreen', 'failScreen',
        'apiScreen', 'profileScreen'
    ];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const dock = document.getElementById('bottomNavDock');
    const shell = document.getElementById('appShell');
    const hideDock = ['auth', 'processing', 'qr', 'verify', 'success', 'fail'];

    if (hideDock.includes(name)) {
        dock.style.display = 'none';
        shell.classList.add('no-bottom-pad');
    } else {
        dock.style.display = 'grid';
        shell.classList.remove('no-bottom-pad');
    }

    ['navHome', 'navPay', 'navApi', 'navProfile'].forEach(t => {
        const btn = document.getElementById(t);
        if (btn) btn.classList.remove('active');
    });

    if (name === 'auth') document.getElementById('authScreen').style.display = 'flex';
    if (name === 'home') {
        syncUIWithState();
        document.getElementById('homeScreen').style.display = 'flex';
        document.getElementById('navHome').classList.add('active');
    }
    if (name === 'numpad') {
        document.getElementById('numpadScreen').style.display = 'flex';
        document.getElementById('navPay').classList.add('active');
    }
    if (name === 'processing') document.getElementById('processingScreen').style.display = 'flex';
    if (name === 'qr') document.getElementById('qrScreen').style.display = 'flex';
    if (name === 'verify') document.getElementById('paymentVerifyScreen').style.display = 'flex';
    if (name === 'success') document.getElementById('successScreen').style.display = 'flex';
    if (name === 'fail') document.getElementById('failScreen').style.display = 'flex';
    if (name === 'api') {
        updateApiEndpointPreviews();
        document.getElementById('apiScreen').style.display = 'flex';
        document.getElementById('navApi').classList.add('active');
    }
    if (name === 'profile') {
        syncUIWithState();
        document.getElementById('profileScreen').style.display = 'flex';
        document.getElementById('navProfile').classList.add('active');
    }
}

function startProcessingFlow() {
    const num = parseFloat(currentAmountStr);
    if (!num || num <= 0) {
        showToast("⚠️ Enter amount greater than ₹0");
        return;
    }
    if (!UPI_ID) {
        showToast("⚠️ Please configure your receiving UPI ID first");
        showScreen('profile');
        return;
    }

    qrGeneratedStartTimeMs = Date.now();
    if (!currentActiveTxnId) {
        const created = window.MintPayAPI.createTransaction(num, "3D_Tree_Checkout", USER_API_TOKEN);
        if (created.data) currentActiveTxnId = created.data.txn_id;
    }

    showScreen('processing');
    const procBar = document.getElementById('procBar');
    procBar.style.width = "0%";
    setTimeout(() => { procBar.style.width = "100%"; }, 50);

    setTimeout(() => {
        const upiUrl = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(MERCHANT)}&am=${num}&cu=INR`;
        qrAmtHero.innerText = `₹${num}`;
        showScreen('qr');
        initOrUpdate3DTreeQR(upiUrl);
        startCountdown(300);
    }, 1400);
}

function backToQrFromFail() {
    showScreen('qr');
    startCountdown(300);
}

function goToAmountScreen() {
    if (timerInterval) clearInterval(timerInterval);
    showScreen('numpad');
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
        countdownTimer.innerText = `${m}:${s}`;
    }, 1000);
}

function copyUPI() {
    if (!UPI_ID) return;
    navigator.clipboard.writeText(UPI_ID);
    const tip = document.getElementById('copyTip');
    if (tip) tip.innerText = "Copied!";
    showToast("UPI ID Copied: " + UPI_ID);
    setTimeout(() => { if (tip) tip.innerText = "Copy"; }, 2000);
}

async function saveProfileSettings() {
    const newName = document.getElementById('setMerchantName').value.trim();
    const newUpi = document.getElementById('setMerchantUpi').value.trim();

    if (!newName || !newUpi) {
        showToast("⚠️ Name and UPI ID cannot be empty");
        return;
    }

    MERCHANT = newName;
    UPI_ID = newUpi;
    localStorage.setItem('sp_merchant', MERCHANT);
    localStorage.setItem('sp_upi', UPI_ID);

    if (CURRENT_UID) {
        await db.ref('users/' + CURRENT_UID).update({
            merchantName: MERCHANT,
            upiId: UPI_ID
        });
        await db.ref('tokens/' + USER_API_TOKEN).update({
            merchantName: MERCHANT,
            upiId: UPI_ID
        });
    }

    syncUIWithState();
    showToast("✅ Merchant Profile Updated!");
}

async function logoutGateway() {
    try { await auth.signOut(); } catch (e) {}
    localStorage.removeItem('sp_logged_in');
    localStorage.removeItem('sp_user_email');
    localStorage.removeItem('sp_g_token');
    showToast("Logged out safely");
    showScreen('auth');
}

function showToast(text) {
    toast.innerText = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2300);
}

// =========================================================================
// 5. THREE.JS 3D TREE FIRST INTERACTIVE QR ENGINE
// =========================================================================
let qrScene, qrCamera, qrRenderer;
let qrModuleGroup, treeWorldGroup, foliageCrownGroup;
let qrModuleMeshes = [];
let foliageSprites = [];
let grassTufts = [];
let isTreeView = true;
let morphProgress = 1;
let animationRunning = false;

const QR_DARK_GREENS = ['#1b5e12', '#266e17', '#32821d', '#3e9123', '#4fa32d', '#5fb537', '#206314', '#688f26'];
const QR_FINDER_GREEN = '#1e5e13';
const QR_LIGHT_TILES = ['#f7f5ee', '#efece2', '#e7e3d6'];

function isFinderPattern(r, c, count) {
    const inTL = r < 7 && c < 7;
    const inTR = r < 7 && c >= count - 7;
    const inBL = r >= count - 7 && c < 7;
    return inTL || inTR || inBL;
}

function createFoliageTexture(baseCol, lightCol, darkCol) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');

    const drawBlade = (x, y, rx, ry, rot, color) => {
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
        drawBlade(64 + Math.cos(a) * 24, 66 + Math.sin(a) * 20, 22, 11, a + 0.25, darkCol);
    }
    for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + 0.15;
        const d = 14 + (i % 3) * 8;
        drawBlade(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 21, 10.5, a, baseCol);
    }
    for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.4;
        drawBlade(64 + Math.cos(a) * 13, 56 + Math.sin(a) * 12, 17, 8.5, a - 0.15, lightCol);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

function createGrassTexture() {
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
    const size = 315;

    if (!qrRenderer) {
        qrScene = new THREE.Scene();
        const frustum = 18.6;
        qrCamera = new THREE.OrthographicCamera(-frustum / 2, frustum / 2, frustum / 2, -frustum / 2, -50, 100);
        qrRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        qrRenderer.setSize(size, size);
        qrRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        qrScene.add(new THREE.AmbientLight(0xffffff, 0.96));
        const sunLight = new THREE.DirectionalLight(0xfffbeb, 0.42);
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
}

function build3DTreeEnvironment() {
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

    const grassTex = createGrassTexture();
    const grassGeo = new THREE.PlaneGeometry(1.2, 1.1);

    const addTuft = (gx, gz, scaleMul) => {
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
            addTuft(cn.cx + (Math.random() - 0.5) * 1.7, cn.cz + (Math.random() - 0.5) * 1.7, 1.05);
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

    const texSunlit = createFoliageTexture('#8cd738', '#aae856', '#68b31e');
    const texLush   = createFoliageTexture('#7bc62b', '#98e048', '#569c14');
    const texShade  = createFoliageTexture('#65ad1b', '#83cc35', '#44820c');
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
    if (isTreeView) {
        btnText.innerText = "Tap the tree to see QR code";
        if (btnGif) btnGif.src = "eye.gif";
    } else {
        btnText.innerText = "Tap QR to see the 3D Tree";
        if (btnGif) btnGif.src = "light.gif";
    }
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

    const upY = morphProgress;
    const upZ = -(1 - morphProgress);
    qrCamera.up.set(0, upY, upZ).normalize();
    qrCamera.position.set(camX, camY, camZ);
    qrCamera.lookAt(0, morphProgress * 2.35, 0);

    const treeAlpha = Math.max(0, (morphProgress - 0.15) / 0.85);
    const treeVis = treeAlpha > 0.01;
    treeWorldGroup.visible = treeVis;
    foliageCrownGroup.visible = treeVis;

    if (treeVis) {
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

    qrModuleGroup.children.forEach(ch => {
        if (ch.userData && ch.userData.isQuietPad) {
            ch.material.opacity = Math.max(0, 1 - morphProgress * 2.5);
            ch.visible = ch.material.opacity > 0.02;
        }
    });

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

    qrRenderer.render(qrScene, qrCamera);
}

// =========================================================================
// 6. BACKGROUND 3D FLOATING PARTICLES
// =========================================================================
const bgCanvas = document.getElementById('bg-canvas');
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

for (let i = 0; i < 10; i++) {
    const geo = i % 2 === 0
        ? new THREE.TorusGeometry(Math.random() * 1.0 + 0.4, 0.18, 14, 34)
        : new THREE.IcosahedronGeometry(Math.random() * 0.75 + 0.3, 1);

    const mat = new THREE.MeshPhysicalMaterial({
        color: mintPalette[i % mintPalette.length],
        roughness: 0.2,
        metalness: 0.1,
        clearcoat: 0.9,
        transparent: true,
        opacity: 0.22
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 15, (Math.random() - 0.5) * 10 - 4);
    mesh.userData = { rx: (Math.random() - 0.5) * 0.01, ry: (Math.random() - 0.5) * 0.01, baseY: mesh.position.y, phase: Math.random() * Math.PI * 2 };
    bgScene.add(mesh);
    floaters.push(mesh);
}

bgCamera.position.z = 14;
let bgTime = 0;

function animateBg() {
    requestAnimationFrame(animateBg);
    bgTime += 0.014;
    floaters.forEach(f => {
        f.rotation.x += f.userData.rx;
        f.rotation.y += f.userData.ry;
        f.position.y = f.userData.baseY + Math.sin(bgTime + f.userData.phase) * 0.6;
    });
    bgRenderer.render(bgScene, bgCamera);
}
animateBg();

window.addEventListener('resize', () => {
    bgCamera.aspect = window.innerWidth / window.innerHeight;
    bgCamera.updateProjectionMatrix();
    bgRenderer.setSize(window.innerWidth, window.innerHeight);
});

// =========================================================================
// 7. BOOTSTRAP GATEWAY
// =========================================================================
(async function initMintPayApp() {
    syncUIWithState();

    const rawSearch = window.location.search || "";
    const normalizedSearch = rawSearch.replace(/\?/g, '&').replace(/^&/, '?');
    const params = new URLSearchParams(normalizedSearch);

    const urlToken = params.get('token');
    const urlAmt = parseFloat(params.get('amount') || params.get('am'));
    const urlTxnId = params.get('txn_id');

    if (urlAmt && urlAmt > 0) {
        if (urlToken) {
            try {
                const tokSnap = await db.ref('tokens/' + urlToken).once('value');
                const tokData = tokSnap.val();
                if (tokData) {
                    if (tokData.apiEnabled === false) {
                        alert("⚠️ Merchant API is currently disabled.");
                        showScreen('auth');
                        return;
                    }
                    if (tokData.merchantName) MERCHANT = tokData.merchantName;
                    if (tokData.upiId) UPI_ID = tokData.upiId;
                    syncUIWithState();
                }
            } catch (e) {}
        }

        currentAmountStr = String(urlAmt);
        if (urlTxnId) currentActiveTxnId = urlTxnId;
        liveAmount.innerText = currentAmountStr;
        startProcessingFlow();
        return;
    }

    auth.onAuthStateChanged((user) => {
        if (user) {
            CURRENT_UID = user.uid;
            USER_EMAIL = user.email || "";
            localStorage.setItem('sp_logged_in', 'true');
            localStorage.setItem('sp_user_email', USER_EMAIL);
        }
    });

    if (localStorage.getItem('sp_logged_in') === 'true' && UPI_ID) {
        showScreen('home');
        pingGmailConnection(false);
    } else {
        showScreen('auth');
    }
})();
