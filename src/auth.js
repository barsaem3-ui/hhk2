export const SUPABASE_URL = 'https://mntkqjglpzkhokbfpjcl.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udGtxamdscHpraG9rYmZwamNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDAwNjMsImV4cCI6MjA5NDE3NjA2M30.CeOFhlNX-Vi44toM5tpxAlxZLaNrkbv-XlXbtwkpJZU';

export const AUTH_CONFIG = {
    email: 'barsaem3@gmail.com',
    password: 'guswjd71'
};

export function initAuth() {
    const loginOverlay = document.getElementById('login-overlay');
    const appContainer = document.getElementById('app-container');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');

    // Check session
    const session = localStorage.getItem('workorder_session');
    if (session) {
        showApp();
    }

    loginBtn.addEventListener('click', () => {
        const email = emailInput.value;
        const password = passwordInput.value;

        if (email === AUTH_CONFIG.email && password === AUTH_CONFIG.password) {
            localStorage.setItem('workorder_session', JSON.stringify({
                email,
                loginTime: new Date().getTime(),
                deviceId: navigator.userAgent
            }));
            showApp();
        } else {
            alert('아이디 또는 비밀번호가 올바르지 않습니다.');
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('workorder_session');
        window.location.reload(); // 로그아웃 시 페이지 새로고침하여 초기 상태로
    });

    function showApp() {
        loginOverlay.style.opacity = '0';
        setTimeout(() => {
            loginOverlay.style.display = 'none';
            appContainer.style.display = 'flex';
        }, 500);
    }
}
