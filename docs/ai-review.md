# AI Code Review 報告

由 `code-reviewer`、`security-reviewer`、`test-runner` 三個 SubAgent 檢查後整理。本階段只記錄問題，未修改程式碼。

## 測試基準線（test-runner）

| 指令 | 通過 | 失敗 | 跳過 |
| --- | --- | --- | --- |
| `npm run test:unit` | 54 | 0 | 1 |
| `npm run test:integration` | 10 | 0 | 0 |

測試全過，但有 1 個測試被 `it.skip`（見問題 3）。`tests/acceptance/` 經 `git diff main --stat` 確認未被修改。

## 主要問題（對應五個範圍）

### 1. [高] 訂單詳情未限制擁有者（IDOR）— 訂單查詢
- 位置：`src/routes/orderRoutes.js:350-364`（`GET /api/orders/:id`）
- 問題說明：使用 `findOrderById(req.params.id)`，只依 id 查詢，沒有帶 user_id。同檔的 `/pay`、`/check-payment` 都使用 `findOrderForUser`（`src/services/orderService.js:25`），只有這條漏掉。
- 影響：任何已登入會員拿到他人訂單 UUID，就能讀到收件人姓名、Email、地址、品項與金額。
- 修法：改用 `findOrderForUser(req.params.id, req.user.userId)`，查不到回 404，並補跨會員整合測試。

### 2. [高] 綠界查詢結果缺少 CheckMacValue 時略過簽章驗證 — 付款狀態
- 位置：`src/services/paymentService.js:15`
- 問題說明：條件為 `tradeInfo.CheckMacValue && !verifyCheckMacValue(...)`，回應沒有 CheckMacValue 欄位時整段驗證被跳過，之後只比對 MerchantTradeNo 與 TradeAmt。
- 影響：偽造或被竄改的查詢回應只要帶 `TradeStatus=1` 且不帶簽章，就能把訂單標成已付款。
- 修法：缺少 CheckMacValue 視同驗證失敗，改為 `!tradeInfo.CheckMacValue || !verifyCheckMacValue(...)` 時 throw；整合測試補「TradeStatus=1 但無 CheckMacValue」案例。

### 3. [高] 免運門檻使用 `>`，剛好 1,500 元仍收運費 — 運費計算
- 位置：`src/utils/shipping.js:39-41`（`qualifiesForFreeShipping`）
- 問題說明：規格為滿 1,500 元免基本運費（`>=`），實作為 `subtotal > 1500`。前端 `public/js/pages/checkout.js:28` 與 `tests/orders.test.js:48` 都使用 `>=`。
- 影響：小計剛好 1,500 時宅配多收 120 元、超商多收 60 元，且前端顯示與實際付款金額不一致。
- 修法：改為 `>=`。

### 4. [高] 購物車 PATCH 數量未驗證正整數 — 購物車數量
- 位置：`src/routes/cartRoutes.js:296-315`
- 問題說明：只用 `Number(quantity)` 加 `isNaN` 檢查，未使用 POST 路徑已採用的 `parsePositiveInteger`。`0`、`-5`、`1.5`、`null`、`""`、`[]` 都能通過。
- 影響：`quantity: -3` 會寫入負數，購物車與訂單小計變成負值，庫存檢查被繞過，下單後甚至會「增加」庫存。
- 修法：改用 `parsePositiveInteger(quantity)`，失敗回 400 `VALIDATION_ERROR`，並補 0、-1、1.5、`"3abc"`、null 的測試。

### 5. [高] 免運邊界測試被 skip，測試掩蓋問題 3 — 測試
- 位置：`tests/shipping.test.js:29`（`it.skip('商品小計 1,500 元時免基本運費')`）
- 問題說明：唯一驗證「剛好 1,500 元」的測試被跳過且沒有註解說明原因，所以問題 3 在測試全綠下沒被發現。
- 修法：移除 `.skip`，確認修正問題 3 後通過；另補超商 1,499、1,500、1,501 的案例。

## 次要問題

### 6. [中] 訂單與付款測試斷言過鬆
- 位置：`tests/orders.test.js:46-49`、`:97-108`、`:110-130`、`:177-194`
- 說明：
  - 免運預期值在測試內用 `productPrice >= 1500 ? 0 : 60` 重算，等於複製實作邏輯，且依賴 seed 價格，未必測到邊界。
  - 訂單列表只檢查 `length > 0`，沒驗證只含自己的訂單與 created_at 降冪。
  - 詳情缺跨使用者案例（所以問題 1 沒被抓到）。
  - 付款測試缺 `failed` 後再付款、他人訂單回 404 的案例。
- 修法：建立兩個使用者各自下單並斷言列表內容與順序；API 層用固定價格商品（如 750 x 2）斷言 `shipping_fee` 為固定值。

### 7. [中] 購物車以 `X-Session-Id` 為唯一憑證，無格式限制
- 位置：`src/middleware/sessionMiddleware.js:1-7`、`src/routes/cartRoutes.js:38-40`
- 說明：任何字串都被視為有效 session，若 id 可猜測或洩漏，他人可讀寫訪客購物車。
- 修法：驗證 UUID 格式。

### 8. [低] 購物車測試缺邊界案例
- 位置：`tests/cart.test.js`
- 說明：缺 POST 數量為 0/負數、加入數量等於庫存／庫存加 1、重複加入累加超過庫存、PATCH/DELETE 他人項目回 404；第 27 行只檢查 `quantity` 屬性存在而未檢查值。

### 9. [低] 訂單列表排序不穩定
- 位置：`src/services/orderService.js:33`（`ORDER BY created_at DESC`）
- 說明：`datetime('now')` 只到秒，同秒建立的訂單順序不確定。
- 修法：改為 `ORDER BY created_at DESC, rowid DESC`。

### 10. [低] 庫存扣除缺少條件式保護
- 位置：`src/services/orderService.js:58-60, 83-106`
- 說明：庫存檢查在 transaction 外，`UPDATE products SET stock = stock - ?` 沒有 `AND stock >= ?`。better-sqlite3 為同步執行，單程序風險低，多程序部署可能超賣。

### 11. [低] 綠界金鑰有預設值
- 位置：`src/utils/ecpay.js:4-6`
- 說明：環境變數缺失時退回綠界公開的 staging 測試值。若 production 漏設環境變數會用公開金鑰簽章。
- 修法：`ECPAY_ENV=production` 且缺少環境變數時拒絕啟動。

## 已確認無問題
- admin 路由皆有 `authMiddleware, adminMiddleware`
- SQL 皆為參數化查詢
- `/pay` 模擬付款有 `testEnvOnly` 保護
- 建立訂單僅接受 JWT
- `.env` 未進版控

## 統計

共 11 個問題（高 5 / 中 3 / 低 3），其中前 5 項對應作業提示的訂單查詢、付款狀態、運費計算、購物車數量與測試五個範圍。
