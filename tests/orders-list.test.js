const { app, request, getAdminToken, registerUser } = require('./setup');

const ORDER_BODY = {
  recipientName: '訂單列表測試',
  recipientEmail: 'list@example.com',
  recipientAddress: '台北市測試路 1 號',
  shippingMethod: 'home_delivery',
  isRemoteArea: false,
  isExpress: false
};

async function createProduct() {
  const adminToken = await getAdminToken();
  const res = await request(app)
    .post('/api/admin/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `列表測試商品 ${Date.now()}-${Math.random()}`, price: 100, stock: 100 });
  return res.body.data;
}

// 為會員連續建立 count 筆訂單，回傳依建立順序排列的訂單
async function createOrders(token, product, count) {
  const orders = [];
  for (let i = 0; i < count; i++) {
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(ORDER_BODY);
    orders.push(res.body.data);
  }
  return orders;
}

function listOrders(token, query = '') {
  return request(app).get(`/api/orders${query}`).set('Authorization', `Bearer ${token}`);
}

describe('Orders API - 列表篩選與分頁', () => {
  let product;

  beforeAll(async () => {
    product = await createProduct();
  });

  it('不帶參數時回傳第 1 頁、每頁 10 筆，同一秒建立的訂單也依新到舊排序', async () => {
    const { token } = await registerUser();
    const orders = await createOrders(token, product, 12);

    const res = await listOrders(token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 10, total: 12, totalPages: 2 });
    expect(res.body.data.orders.map(order => order.id)).toEqual(
      orders.slice(2).reverse().map(order => order.id)
    );
  });

  it('依 limit 分頁，最後一頁回傳剩餘筆數', async () => {
    const { token } = await registerUser();
    await createOrders(token, product, 12);

    const res = await listOrders(token, '?page=3&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(2);
    expect(res.body.data.pagination).toEqual({ page: 3, limit: 5, total: 12, totalPages: 3 });
  });

  it('超出範圍的頁數回傳空陣列', async () => {
    const { token } = await registerUser();
    await createOrders(token, product, 2);

    const res = await listOrders(token, '?page=5');

    expect(res.status).toBe(200);
    expect(res.body.data.orders).toEqual([]);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it('limit 超過 50 時以 50 計', async () => {
    const { token } = await registerUser();

    const res = await listOrders(token, '?limit=100');

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.limit).toBe(50);
  });

  it('status 篩選只回傳該狀態的訂單，total 為篩選後的筆數', async () => {
    const { token } = await registerUser();
    const orders = await createOrders(token, product, 3);
    await request(app)
      .patch(`/api/orders/${orders[1].id}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'success' });

    const paid = await listOrders(token, '?status=paid');
    expect(paid.body.data.orders.map(order => order.id)).toEqual([orders[1].id]);
    expect(paid.body.data.pagination.total).toBe(1);

    const pending = await listOrders(token, '?status=pending');
    expect(pending.body.data.orders).toHaveLength(2);

    const failed = await listOrders(token, '?status=failed');
    expect(failed.body.data.orders).toEqual([]);
    expect(failed.body.data.pagination).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
  });

  it.each([
    '?status=unknown',
    '?status=paid&status=pending',
    '?page=0',
    '?page=-1',
    '?page=1.5',
    '?page=abc',
    '?limit=0',
    '?limit=-1',
    '?limit=5abc',
    '?limit=1&limit=2'
  ])('不合法的查詢參數 %s 回傳 400', async query => {
    const { token } = await registerUser();

    const res = await listOrders(token, query);

    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('不會回傳其他會員的訂單', async () => {
    const { token } = await registerUser();
    const { token: otherToken } = await registerUser();
    const mine = await createOrders(token, product, 2);
    await createOrders(otherToken, product, 3);

    const res = await listOrders(token);

    expect(res.body.data.pagination.total).toBe(2);
    expect(res.body.data.orders.map(order => order.id).sort()).toEqual(mine.map(order => order.id).sort());
  });
});
