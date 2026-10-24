const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const orders = ref([]);
    const loading = ref(true);

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot/20 text-apricot' },
      paid: { label: '已付款', cls: 'bg-sage/20 text-sage' },
      failed: { label: '付款失敗', cls: 'bg-red-100 text-red-600' },
    };

    onMounted(async function () {
      try {
        // 列表 API 已分頁（每頁最多 50 筆），逐頁取完才不會漏掉較舊的訂單
        const all = [];
        let page = 1;
        let totalPages = 1;
        do {
          const res = await apiFetch('/api/orders?limit=50&page=' + page);
          all.push(...res.data.orders);
          totalPages = res.data.pagination.totalPages;
          page += 1;
        } while (page <= totalPages);
        orders.value = all;
      } catch (e) {
        orders.value = [];
      } finally {
        loading.value = false;
      }
    });

    return { orders, loading, statusMap, formatDate };
  }
}).mount('#app');
