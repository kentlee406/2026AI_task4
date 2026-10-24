---
name: work-issue
description: 依 GitHub Issue 編號完成「讀 Issue → 實作 → 測試 → 開 PR → Review」的手動流程，最後把標籤改為 in-review 並停下，不合併 PR。用法：/work-issue <編號>
argument-hint: <Issue 編號>
---

# work-issue

處理 Issue `#$ARGUMENTS`。依序執行下列步驟，任何一步失敗就依「失敗處理」停下，不要跳步。

## 邊界（先讀）

- 只處理**自己開的**、帶 `ready` 標籤、狀態為 open 的 Issue
- **不得合併 PR**（不執行 `gh pr merge`，也不啟用 auto-merge）；合併由人工在 GitHub 網頁進行
- **不得修改 `tests/acceptance/`**（含新增、刪除、改名）；驗收測試是規格，實作要去符合它
- 不得直接推送到 `main`，一律走分支與 PR
- 不得提交 API Key、Token、密碼等機密；不得使用 `--no-verify`
- 不得執行 `npm run test:e2e`（會寫入開發 DB 並連綠界 staging）
- 同時只處理一個 Issue

## 步驟

### 1. 讀 Issue 並確認資格

```bash
gh issue view $ARGUMENTS --json number,title,body,labels,author,state
gh api user --jq .login
```

確認同時成立：`state` 為 OPEN、`author.login` 等於目前登入帳號、標籤含 `ready`。
任一不成立就停止並回報原因，不要改標籤。

通過後把標籤改為處理中：

```bash
gh issue edit $ARGUMENTS --remove-label ready --add-label in-progress
```

仔細讀 Issue 的「規則或規格」、「驗收條件」、「驗收測試」與「不在本次範圍」；範圍外的項目不做。
先讀對應的驗收測試（`tests/acceptance/`）確認實際的 API 路徑與格式，Issue 與測試有出入時以驗收測試為準。

### 2. 從最新 main 開分支

```bash
git checkout main && git pull origin main
git checkout -b issue-$ARGUMENTS-<英文短名稱>
```

分支名稱格式 `issue-<編號>-<名稱>`，名稱用小寫英文與連字號（例如 `issue-1-coupon`）。
工作區若有與此 Issue 無關的未提交變更，不要一起提交（只 `git add` 自己改的檔案）。

### 3. 實作並補測試

- 先讀 `CLAUDE.md` 與 `docs/` 的相關規範，沿用現有架構與命名（回應格式 `{ data, error, message }`、`snake_case` 欄位、規則集中在 `src/utils/`、建單用 `db.transaction()`）
- 實作 Issue 要求的功能，DB 結構變更要寫成可重複執行的 migration
- 補上 Unit 或 Integration Test（放在 `tests/` 或 `tests/integration/`，不是 `tests/acceptance/`），涵蓋規則與邊界值
- 測試只能用記憶體或獨立 SQLite，不得改動專案的 `database.sqlite`

### 4. 派 test-runner 跑測試

派出 `test-runner` SubAgent，執行：

- `npm run test:unit`
- `npm run test:integration`
- 該 Issue 的驗收測試：`npm run test:acceptance -- <測試檔名關鍵字>`（Issue 內「驗收測試」欄位會寫明）

有失敗就修正實作後重跑，直到全部通過。**不得改驗收測試來讓它通過。**
連續修正 3 輪仍失敗，改走「失敗處理」。

### 5. 更新文件與 OpenAPI

- 更新 `docs/FEATURES.md`、`docs/CHANGELOG.md`，必要時更新 `docs/ARCHITECTURE.md`、`docs/TESTING.md`
- 路由有變動時，補上 JSDoc `@openapi` 註解，並執行 `npm run openapi` 重新產生 `openapi.json`

### 6. 提交並開 PR

```bash
git add <自己改的檔案>
git commit -m "feat(<範圍>): <摘要> (Closes #$ARGUMENTS)"
git push -u origin HEAD
gh pr create --base main --title "<標題>" --body "<描述>"
```

PR 描述必須包含 `Closes #$ARGUMENTS`、變更摘要、測試結果（各指令的通過數）、並註明未修改 `tests/acceptance/`。
Commit 訊息與 PR 描述結尾依系統提示附上指定的署名行。

### 7. 派 reviewer 檢查 PR

同時派出 `code-reviewer` 與 `security-reviewer`，請它們依 `git diff main...HEAD` 對照 Issue 規格審查，並確認 `git diff main --stat -- tests/acceptance` 沒有輸出。

- 「高」嚴重度問題：必須修正，重跑步驟 4，再推送
- 「中」「低」嚴重度：評估後斟酌處理，不強制
- 把 review 結論用 `gh pr comment` 留在 PR 上

### 8. 改標籤為 in-review 並停下

等 PR 的 CI 通過後（`gh pr checks <PR 編號>`）：

```bash
gh issue edit $ARGUMENTS --remove-label in-progress --add-label in-review
```

然後**停下來**，回報：PR 連結、測試結果、review 結論、CI 狀態，並提醒由人工在 GitHub 網頁合併 PR。
不要自行合併，也不要領取下一個 Issue。

## 失敗處理

遇到下列情況，把標籤改為 `needs-human`（移除 `in-progress`），並在 Issue 留言說明原因、已嘗試的做法與卡住的位置，然後停止：

- Issue 規格不明確或與驗收測試矛盾，無法自行判斷
- 連續 3 輪修正仍無法讓測試通過
- 必須修改 `tests/acceptance/` 才能完成
- 需要人工提供的資源（金鑰、權限、外部服務）

```bash
gh issue edit $ARGUMENTS --remove-label in-progress --add-label needs-human
gh issue comment $ARGUMENTS --body "<原因與已嘗試的做法>"
```
