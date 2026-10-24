const { app, request, getAdminToken, registerUser } = require('./setup');

const ORDER_BODY = {
  recipientName: '優惠碼測試',
  recipientEmail: 'coupon@example.com',
  recipientAddress: '台北市測試路 1 號',
  shippingMethod: 'home_delivery',
  isRemoteArea: false,
  isExpress: false
};

// 建立指定單價的商品、加入購物車並下單
async function placeOrder({ price, couponCode, stock = 10 }) {
  const adminToken = await getAdminToken();
  const productRes = await request(app)
    .post('/api/admin/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `優惠碼商品 ${Date.now()}-${Math.random()}`, price, stock });
  const product = productRes.body.data;

  const { token } = await registerUser();
  await request(app)
    .post('/api/cart')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId: product.id, quantity: 1 });

  const res = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send(couponCode === undefined ? ORDER_BODY : { ...ORDER_BODY, couponCode });

  return { token, product, res };
}

describe('Orders API - 優惠碼', () => {
  it.each([
    // [小計, 優惠碼, 折扣, 運費]
    [1600, 'FLOWER100', 100, 0], // 折扣後剛好 1,500 元，免基本運費
    [1550, 'FLOWER100', 100, 120], // 折扣後 1,450 元，仍收運費
    [1667, 'SPRING10', 167, 0], // 折扣後 1,500 元
    [1666, 'SPRING10', 167, 120], // 折扣後 1,499 元
    [3500, 'SPRING10', 300, 0] // 折扣上限 300 元
  ])('小計 %i 元使用 %s：折扣 %i 元、運費 %i 元', async (price, couponCode, discount, shippingFee) => {
    const { res } = await placeOrder({ price, couponCode });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      subtotal: price,
      discount,
      shipping_fee: shippingFee,
      total_amount: price - discount + shippingFee,
      coupon_code: couponCode
    });
  });

  it('小寫優惠碼可使用，並以大寫記錄', async () => {
    const { token, res } = await placeOrder({ price: 800, couponCode: 'flower100' });

    expect(res.status).toBe(201);
    expect(res.body.data.coupon_code).toBe('FLOWER100');

    const detail = await request(app)
      .get(`/api/orders/${res.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.body.data).toMatchObject({ coupon_code: 'FLOWER100', discount: 100 });
  });

  it('未使用優惠碼時 discount 為 0、coupon_code 為 null', async () => {
    const { res } = await placeOrder({ price: 1000 });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      discount: 0,
      coupon_code: null,
      total_amount: 1000 + res.body.data.shipping_fee
    });
  });

  it.each([
    ['無效', 'NOT-A-COUPON', 1000],
    ['已失效', 'SUMMER50', 1000],
    ['未達門檻', 'FLOWER100', 799],
    ['非字串', 123, 1000]
  ])('%s的優惠碼回 400，且不建單、不扣庫存、不清空購物車', async (_label, couponCode, price) => {
    const { token, product, res } = await placeOrder({ price, couponCode });

    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBe('COUPON_INVALID');

    const orders = await request(app).get('/api/orders').set('Authorization', `Bearer ${token}`);
    expect(orders.body.data.orders).toHaveLength(0);

    const stock = await request(app).get(`/api/products/${product.id}`);
    expect(stock.body.data.stock).toBe(10);

    const cart = await request(app).get('/api/cart').set('Authorization', `Bearer ${token}`);
    expect(cart.body.data.items).toHaveLength(1);
  });
});
