// Import Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    RecaptchaVerifier,
    signInWithPhoneNumber,
    PhoneAuthProvider,
    signInWithCredential,
    linkWithCredential,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc,
    collection,
    onSnapshot,
    updateDoc,
    deleteDoc,
    query,
    orderBy
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDdPzWgCcpQeb2tP16kaHLxH38_F7EANFU",
            authDomain: "nasimstore20-5bd7c.firebaseapp.com",
            projectId: "nasimstore20-5bd7c",
            storageBucket: "nasimstore20-5bd7c.firebasestorage.app",
            messagingSenderId: "990327087244",
            appId: "1:990327087244:web:6ce012045d2ea701ba1ba9",
            measurementId: "G-7F5630V59P"
        };


// Initialize Firebase
let app, auth, db;
let currentUser = null;
let confirmationResult = null;
let tempUserData = null;
let recaptchaVerifier = null;
let resendTimer = null;
let resendCountdown = 60;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    // Set auth language to Arabic
    auth.languageCode = 'ar';
} catch (error) {
    console.error("خطأ في تهيئة Firebase:", error);
    showMessage('حدث خطأ في تهيئة التطبيق. تحقق من الإعدادات.', 'error');
}

// DOM Elements
const loadingOverlay = document.getElementById('loading-overlay');
const registrationStep = document.getElementById('registration-step');
const otpStep = document.getElementById('otp-step');
const loginStep = document.getElementById('login-step');
const dashboard = document.getElementById('dashboard');
const adminPanel = document.getElementById('admin-panel');
const messageDiv = document.getElementById('message');

// Form Elements
const registrationForm = document.getElementById('registration-form');
const otpForm = document.getElementById('otp-form');
const loginForm = document.getElementById('login-form');

// Utility Functions
function showLoading() {
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

function showMessage(message, type = 'info') {
    messageDiv.textContent = message;
    messageDiv.classList.remove('hidden', 'text-red-500', 'text-green-500', 'text-blue-500');
    
    switch(type) {
        case 'error':
            messageDiv.classList.add('text-red-500');
            break;
        case 'success':
            messageDiv.classList.add('text-green-500');
            break;
        default:
            messageDiv.classList.add('text-blue-500');
    }
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 5000);
}

function hideAllSteps() {
    registrationStep.classList.add('hidden');
    otpStep.classList.add('hidden');
    loginStep.classList.add('hidden');
    dashboard.classList.add('hidden');
}

function showStep(stepElement) {
    hideAllSteps();
    stepElement.classList.remove('hidden');
    stepElement.classList.add('fade-in');
}

// Initialize reCAPTCHA
function initializeRecaptcha() {
    if (recaptchaVerifier) {
        recaptchaVerifier.clear();
    }
    
    recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'normal',
        'callback': (response) => {
            console.log('reCAPTCHA solved');
        },
        'expired-callback': () => {
            console.log('reCAPTCHA expired');
            showMessage('انتهت صلاحية reCAPTCHA. يرجى المحاولة مرة أخرى.', 'error');
        }
    });
    
    recaptchaVerifier.render();
}

// OTP Input Handling
function setupOTPInputs() {
    const otpInputs = document.querySelectorAll('.otp-input');
    
    otpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            
            if (value.length > 1) {
                e.target.value = value.slice(0, 1);
            }
            
            if (value && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                otpInputs[index - 1].focus();
            }
        });
        
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            
            for (let i = 0; i < pastedData.length && i < otpInputs.length; i++) {
                otpInputs[i].value = pastedData[i];
            }
            
            if (pastedData.length > 0) {
                otpInputs[Math.min(pastedData.length, otpInputs.length - 1)].focus();
            }
        });
    });
}

// Resend OTP Timer
function startResendTimer() {
    const resendBtn = document.getElementById('resend-otp');
    const resendTimerDisplay = document.getElementById('resend-timer');
    
    resendCountdown = 60;
    resendBtn.disabled = true;
    resendBtn.classList.add('opacity-50', 'cursor-not-allowed');
    
    resendTimer = setInterval(() => {
        resendCountdown--;
        resendTimerDisplay.textContent = `يمكنك إعادة الإرسال بعد ${resendCountdown} ثانية`;
        
        if (resendCountdown <= 0) {
            clearInterval(resendTimer);
            resendBtn.disabled = false;
            resendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            resendTimerDisplay.textContent = '';
        }
    }, 1000);
}

// Registration Form Handler
registrationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fullname = document.getElementById('fullname').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const countryCode = document.getElementById('country-code').value;
    const phoneNumber = document.getElementById('phone-number').value.trim();
    
    // Validate inputs
    if (!fullname || !email || !password || !phoneNumber) {
        showMessage('يرجى ملء جميع الحقول المطلوبة', 'error');
        return;
    }
    
    if (password.length < 6) {
        showMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
        return;
    }
    
    // Format phone number
    const fullPhoneNumber = countryCode + phoneNumber.replace(/^0+/, '');
    
    // Store temporary user data
    tempUserData = {
        fullname,
        email,
        password,
        phoneNumber: fullPhoneNumber
    };
    
    showLoading();
    
    try {
        // Initialize reCAPTCHA if not already initialized
        if (!recaptchaVerifier) {
            initializeRecaptcha();
        }
        
        // Send OTP to phone number
        confirmationResult = await signInWithPhoneNumber(auth, fullPhoneNumber, recaptchaVerifier);
        
        // Update UI
        document.getElementById('phone-display').textContent = fullPhoneNumber;
        showStep(otpStep);
        startResendTimer();
        
        showMessage('تم إرسال رمز التحقق بنجاح', 'success');
        
        // Focus first OTP input
        document.querySelector('.otp-input').focus();
        
    } catch (error) {
        console.error('خطأ في إرسال OTP:', error);
        
        let errorMessage = 'حدث خطأ في إرسال رمز التحقق';
        
        switch(error.code) {
            case 'auth/invalid-phone-number':
                errorMessage = 'رقم الهاتف غير صحيح';
                break;
            case 'auth/missing-phone-number':
                errorMessage = 'يرجى إدخال رقم الهاتف';
                break;
            case 'auth/quota-exceeded':
                errorMessage = 'تم تجاوز حد الإرسال. حاول لاحقاً';
                break;
            case 'auth/captcha-check-failed':
                errorMessage = 'فشل التحقق من reCAPTCHA. حاول مرة أخرى';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'تم إرسال عدد كبير من الطلبات. انتظر قليلاً';
                break;
        }
        
        showMessage(errorMessage, 'error');
        
        // Reset reCAPTCHA
        if (recaptchaVerifier) {
            recaptchaVerifier.clear();
            recaptchaVerifier = null;
        }
        initializeRecaptcha();
    } finally {
        hideLoading();
    }
});

// OTP Verification Handler
otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Collect OTP from inputs
    const otpInputs = document.querySelectorAll('.otp-input');
    let otpCode = '';
    
    otpInputs.forEach(input => {
        otpCode += input.value;
    });
    
    if (otpCode.length !== 6) {
        showMessage('يرجى إدخال رمز التحقق المكون من 6 أرقام', 'error');
        return;
    }
    
    showLoading();
    
    try {
        // Verify OTP
        const credential = await confirmationResult.confirm(otpCode);
        
        // Create user account with email and password
        const userCredential = await createUserWithEmailAndPassword(auth, tempUserData.email, tempUserData.password);
        
        // Link phone number to the account
        await linkWithCredential(userCredential.user, credential.credential);
        
        // Update user profile
        await updateProfile(userCredential.user, {
            displayName: tempUserData.fullname
        });
        
        // Save user data to Firestore
        const userDocRef = doc(db, 'users', userCredential.user.uid);
        await setDoc(userDocRef, {
            fullname: tempUserData.fullname,
            email: tempUserData.email,
            phoneNumber: tempUserData.phoneNumber,
            role: 'user',
            createdAt: new Date().toISOString(),
            verified: true
        });
        
        showMessage('تم إنشاء الحساب بنجاح!', 'success');
        
        // Clear temp data
        tempUserData = null;
        confirmationResult = null;
        
    } catch (error) {
        console.error('خطأ في التحقق من OTP:', error);
        
        let errorMessage = 'حدث خطأ في التحقق من الرمز';
        
        switch(error.code) {
            case 'auth/invalid-verification-code':
                errorMessage = 'رمز التحقق غير صحيح';
                break;
            case 'auth/code-expired':
                errorMessage = 'انتهت صلاحية رمز التحقق. اطلب رمز جديد';
                break;
            case 'auth/email-already-in-use':
                errorMessage = 'البريد الإلكتروني مستخدم بالفعل';
                break;
        }
        
        showMessage(errorMessage, 'error');
    } finally {
        hideLoading();
    }
});

// Resend OTP Handler
document.getElementById('resend-otp').addEventListener('click', async () => {
    if (!tempUserData) {
        showMessage('حدث خطأ. يرجى البدء من جديد', 'error');
        showStep(registrationStep);
        return;
    }
    
    showLoading();
    
    try {
        // Re-initialize reCAPTCHA
        if (recaptchaVerifier) {
            recaptchaVerifier.clear();
        }
        initializeRecaptcha();
        
        // Resend OTP
        confirmationResult = await signInWithPhoneNumber(auth, tempUserData.phoneNumber, recaptchaVerifier);
        
        showMessage('تم إعادة إرسال رمز التحقق', 'success');
        startResendTimer();
        
        // Clear OTP inputs
        document.querySelectorAll('.otp-input').forEach(input => {
            input.value = '';
        });
        document.querySelector('.otp-input').focus();
        
    } catch (error) {
        console.error('خطأ في إعادة إرسال OTP:', error);
        showMessage('حدث خطأ في إعادة الإرسال. حاول مرة أخرى', 'error');
    } finally {
        hideLoading();
    }
});

// Change Phone Number Handler
document.getElementById('change-phone').addEventListener('click', () => {
    if (resendTimer) {
        clearInterval(resendTimer);
    }
    showStep(registrationStep);
});

// Login Form Handler
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    showLoading();
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        showMessage('تم تسجيل الدخول بنجاح', 'success');
    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        
        let errorMessage = 'حدث خطأ في تسجيل الدخول';
        
        switch(error.code) {
            case 'auth/user-not-found':
                errorMessage = 'البريد الإلكتروني غير مسجل';
                break;
            case 'auth/wrong-password':
                errorMessage = 'كلمة المرور غير صحيحة';
                break;
            case 'auth/invalid-email':
                errorMessage = 'البريد الإلكتروني غير صحيح';
                break;
        }
        
        showMessage(errorMessage, 'error');
    } finally {
        hideLoading();
    }
});

// Logout Handler
document.getElementById('logout-btn').addEventListener('click', async () => {
    showLoading();
    
    try {
        await signOut(auth);
        showMessage('تم تسجيل الخروج بنجاح', 'success');
    } catch (error) {
        console.error('خطأ في تسجيل الخروج:', error);
        showMessage('حدث خطأ في تسجيل الخروج', 'error');
    } finally {
        hideLoading();
    }
});

// Toggle between Login and Registration
document.getElementById('show-login').addEventListener('click', () => {
    showStep(loginStep);
});

document.getElementById('show-register').addEventListener('click', () => {
    showStep(registrationStep);
    initializeRecaptcha();
});

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is signed in
        currentUser = user;
        
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                
                // Update dashboard UI
                document.getElementById('user-name').textContent = userData.fullname || user.displayName || 'المستخدم';
                document.getElementById('user-email').textContent = userData.email || user.email;
                document.getElementById('user-phone').textContent = userData.phoneNumber || 'غير محدد';
                
                const roleElement = document.getElementById('user-role');
                roleElement.textContent = userData.role === 'admin' ? 'مدير' : 'مستخدم';
                
                // Style role badge
                roleElement.className = 'font-semibold px-3 py-1 rounded-full text-sm';
                if (userData.role === 'admin') {
                    roleElement.classList.add('bg-purple-100', 'text-purple-800');
                    loadAdminPanel();
                } else {
                    roleElement.classList.add('bg-blue-100', 'text-blue-800');
                    adminPanel.classList.add('hidden');
                }
                
                showStep(dashboard);
            } else {
                // Create user document if it doesn't exist
                await setDoc(doc(db, 'users', user.uid), {
                    fullname: user.displayName || '',
                    email: user.email || '',
                    phoneNumber: user.phoneNumber || '',
                    role: 'user',
                    createdAt: new Date().toISOString()
                });
                
                showStep(dashboard);
            }
        } catch (error) {
            console.error('خطأ في جلب بيانات المستخدم:', error);
            showMessage('حدث خطأ في جلب البيانات', 'error');
        }
    } else {
        // User is signed out
        currentUser = null;
        showStep(registrationStep);
        initializeRecaptcha();
    }
    
    hideLoading();
});

// Admin Panel Functions
let unsubscribeUsers = null;

function loadAdminPanel() {
    adminPanel.classList.remove('hidden');
    
    // Listen to users collection
    const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    
    unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        const tbody = document.getElementById('users-table');
        tbody.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const userData = doc.data();
            const row = createUserRow(doc.id, userData);
            tbody.appendChild(row);
        });
    }, (error) => {
        console.error('خطأ في جلب المستخدمين:', error);
        showMessage('حدث خطأ في جلب قائمة المستخدمين', 'error');
    });
}

function createUserRow(userId, userData) {
    const row = document.createElement('tr');
    row.className = 'border-b hover:bg-gray-50';
    
    const isCurrentUser = userId === currentUser.uid;
    
    row.innerHTML = `
        <td class="py-3 px-4">${userData.fullname || 'غير محدد'}</td>
        <td class="py-3 px-4">${userData.email}</td>
        <td class="py-3 px-4" dir="ltr">${userData.phoneNumber || 'غير محدد'}</td>
        <td class="py-3 px-4">
            <select class="role-select bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2"
                    data-uid="${userId}" ${isCurrentUser ? 'disabled' : ''}>
                <option value="user" ${userData.role === 'user' ? 'selected' : ''}>مستخدم</option>
                <option value="admin" ${userData.role === 'admin' ? 'selected' : ''}>مدير</option>
            </select>
        </td>
        <td class="py-3 px-4">
            <button class="delete-user-btn bg-red-500 text-white px-3 py-1 text-sm rounded hover:bg-red-600"
                    data-uid="${userId}" ${isCurrentUser ? 'disabled' : ''}>
                حذف
            </button>
        </td>
    `;
    
    // Add event listeners
    const roleSelect = row.querySelector('.role-select');
    if (!isCurrentUser) {
        roleSelect.addEventListener('change', async (e) => {
            await updateUserRole(userId, e.target.value);
        });
    }
    
    const deleteBtn = row.querySelector('.delete-user-btn');
    if (!isCurrentUser) {
        deleteBtn.addEventListener('click', async () => {
            await deleteUser(userId);
        });
    }
    
    return row;
}

async function updateUserRole(userId, newRole) {
    showLoading();
    
    try {
        await updateDoc(doc(db, 'users', userId), {
            role: newRole
        });
        showMessage('تم تحديث الصلاحية بنجاح', 'success');
    } catch (error) {
        console.error('خطأ في تحديث الصلاحية:', error);
        showMessage('حدث خطأ في تحديث الصلاحية', 'error');
    } finally {
        hideLoading();
    }
}

async function deleteUser(userId) {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
        return;
    }
    
    showLoading();
    
    try {
        await deleteDoc(doc(db, 'users', userId));
        showMessage('تم حذف المستخدم بنجاح', 'success');
    } catch (error) {
        console.error('خطأ في حذف المستخدم:', error);
        showMessage('حدث خطأ في حذف المستخدم', 'error');
    } finally {
        hideLoading();
    }
}

// Initialize OTP inputs
setupOTPInputs();

// Initialize app
window.addEventListener('load', () => {
    hideLoading();
});
Response
Created file js/app.js (19587 characters)
