/* Phase 2 smoke tests: register, profile, password update, forgot, firebase-auth */
const base = 'http://localhost:4001/api/v1';

// 1x1 transparent PNG as base64 avatar
const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const j = async (path, opts = {}) => {
    try {
        const res = await fetch(base + path, {
            ...opts,
            headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        return { status: res.status, data };
    } catch (e) {
        return { status: 0, data: { message: e.message } };
    }
};

const results = [];
const check = (name, ok, extra = '') => {
    results.push({ name, ok, extra });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
};

(async () => {
    const email = `phase2test${Date.now()}@example.com`;

    // 1. Register (JSON + base64 avatar)
    let r = await j('/register', { method: 'POST', body: { name: 'Phase Two', email, password: 'secret123', avatar } });
    check('POST /register creates user + token', r.status === 200 && r.data.token && r.data.user, `status=${r.status}`);
    const token = r.data.token;
    const auth = { Authorization: `Bearer ${token}` };

    // 2. Duplicate email returns JSON error (new global error handler)
    r = await j('/register', { method: 'POST', body: { name: 'Dup', email, password: 'secret123', avatar } });
    check('duplicate register -> JSON message', r.status >= 400 && typeof r.data.message === 'string', `status=${r.status} msg=${r.data.message}`);

    // 3. GET /me
    r = await j('/me', { headers: auth });
    check('GET /me returns profile', r.status === 200 && r.data.user.email === email, `status=${r.status}`);

    // 4. Update profile (name + email, no new avatar)
    r = await j('/me/update', { method: 'PUT', headers: auth, body: { name: 'Phase Two Updated', email } });
    check('PUT /me/update changes name', r.status === 200 && r.data.success === true, `status=${r.status}`);

    // 5. Verify name persisted
    r = await j('/me', { headers: auth });
    check('updated name persisted', r.data.user && r.data.user.name === 'Phase Two Updated', `name=${r.data.user && r.data.user.name}`);

    // 6. Update password
    r = await j('/password/update', { method: 'PUT', headers: auth, body: { oldPassword: 'secret123', password: 'newsecret456' } });
    check('PUT /password/update works', r.status === 200 && r.data.success === true, `status=${r.status}`);

    // 7. Login with the NEW password
    r = await j('/login', { method: 'POST', body: { email, password: 'newsecret456' } });
    check('login with new password', r.status === 200 && r.data.token, `status=${r.status}`);

    // 8. Login with OLD password must fail
    r = await j('/login', { method: 'POST', body: { email, password: 'secret123' } });
    check('old password rejected', r.status === 401, `status=${r.status}`);

    // 9. firebase-auth without config -> clear JSON error (not a crash)
    r = await j('/firebase-auth', { method: 'POST', body: { idToken: 'fake.token.here' } });
    check('firebase-auth unconfigured -> JSON message', r.status >= 400 && typeof r.data.message === 'string' && r.data.message.length > 10, `status=${r.status} msg=${r.data.message}`);

    // 10. firebase-auth missing idToken -> 400
    r = await j('/firebase-auth', { method: 'POST', body: {} });
    check('firebase-auth no token -> 400', r.status === 400, `status=${r.status}`);

    // 11. Forgot password (sends via Mailtrap SMTP)
    r = await j('/password/forgot', { method: 'POST', body: { email } });
    check('POST /password/forgot sends email', r.status === 200 && r.data.success === true, `status=${r.status} msg=${r.data.message || r.data.error}`);

    // 12. Unauthenticated /me -> 401
    r = await j('/me');
    check('GET /me without token -> 401', r.status === 401, `status=${r.status}`);

    const failed = results.filter(x => !x.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length ? 1 : 0);
})();
