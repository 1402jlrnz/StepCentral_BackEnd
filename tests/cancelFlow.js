/* E2E: customer cancel flow — Pending order can be cancelled + stock restored,
   non-Pending cannot, and other users cannot cancel your order. */
const base = 'http://localhost:4001/api/v1';

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

const check = (name, ok, extra = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
    return ok;
};

(async () => {
    const results = [];
    const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    // Register user A
    const emailA = `cancelA${Date.now()}@example.com`;
    let r = await j('/register', { method: 'POST', body: { name: 'CancelA', email: emailA, password: 'secret123', avatar } });
    results.push(check('Register user A', r.status === 200 && !!r.data.token));
    const authA = { Authorization: `Bearer ${r.data.token}` };

    // Register user B
    const emailB = `cancelB${Date.now()}@example.com`;
    r = await j('/register', { method: 'POST', body: { name: 'CancelB', email: emailB, password: 'secret123', avatar } });
    const authB = { Authorization: `Bearer ${r.data.token}` };

    // Pick a product and record stock
    r = await j('/products');
    const product = r.data.products[0];
    const pid = product._id;
    const stockBefore = product.stock;

    // User A creates an order (Pending)
    const payload = {
        orderItems: [{ name: product.name, quantity: 1, image: product.images[0].url, price: product.price, product: pid }],
        shippingInfo: { address: '1 Cancel St', city: 'Cebu', phoneNo: '09171234567', postalCode: '6000', country: 'Philippines' },
        itemsPrice: product.price,
        shippingPrice: 0,
        taxPrice: Number((0.05 * product.price).toFixed(2)),
        totalPrice: Number((1.05 * product.price).toFixed(2)),
        paymentInfo: { id: `COD-${Date.now()}`, status: 'pending', method: 'COD' }
    };
    r = await j('/order/new', { method: 'POST', headers: authA, body: payload });
    results.push(check('Create order (Pending)', r.status === 200 && r.data.order?.orderStatus === 'Pending'));
    const orderId = r.data.order._id;

    // Stock was decremented
    r = await j('/product/' + pid);
    const stockAfterOrder = r.data.product.stock;
    results.push(check('Stock decremented on order', stockAfterOrder === stockBefore - 1, `${stockBefore} -> ${stockAfterOrder}`));

    // User B cannot cancel A's order
    r = await j(`/order/${orderId}/cancel`, { method: 'PUT', headers: authB });
    results.push(check('Other user cancel -> 403', r.status === 403, r.data.message));

    // User A CAN cancel own Pending order
    r = await j(`/order/${orderId}/cancel`, { method: 'PUT', headers: authA });
    results.push(check('Owner cancels Pending order', r.status === 200 && r.data.order?.orderStatus === 'Cancelled'));

    // Stock restored
    r = await j('/product/' + pid);
    results.push(check('Stock restored on cancel', r.data.product.stock === stockBefore, `${stockBefore} == ${r.data.product.stock}`));

    // Cancelling again fails (not Pending)
    r = await j(`/order/${orderId}/cancel`, { method: 'PUT', headers: authA });
    results.push(check('Re-cancel -> 400', r.status === 400, r.data.message));

    // Admin status update still works, and full status set is accepted
    r = await j('/login', { method: 'POST', body: { email: 'admin@stepcentral.com', password: 'admin123' } });
    const adminAuth = { Authorization: `Bearer ${r.data.token}` };
    r = await j('/order/new', { method: 'POST', headers: authA, body: payload });
    const orderId2 = r.data.order._id;
    r = await j(`/admin/order/${orderId2}`, { method: 'PUT', headers: adminAuth, body: { status: 'Out for Delivery' } });
    results.push(check("Admin sets 'Out for Delivery'", r.status === 200));
    r = await j(`/admin/order/${orderId2}`, { method: 'PUT', headers: adminAuth, body: { status: 'Bogus' } });
    results.push(check('Invalid status -> 400', r.status === 400, r.data.message));
    r = await j(`/admin/order/${orderId2}`, { method: 'PUT', headers: adminAuth, body: { status: 'Cancelled' } });
    results.push(check('Admin cancels -> restores stock', r.status === 200));
    r = await j('/product/' + pid);
    results.push(check('Stock restored after admin cancel', r.data.product.stock === stockBefore, `${stockBefore} == ${r.data.product.stock}`));

    // Admin delete order cleans up orderdetails
    r = await j('/admin/orders', { headers: adminAuth });
    results.push(check('Admin orders list populated items', Array.isArray(r.data.orders) && r.data.orders.every(o => Array.isArray(o.orderItems))));
    r = await j(`/admin/order/${orderId2}`, { method: 'DELETE', headers: adminAuth });
    results.push(check('Delete order', r.status === 200));

    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exit(passed === results.length ? 0 : 1);
})();

