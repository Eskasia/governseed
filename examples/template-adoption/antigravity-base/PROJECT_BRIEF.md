# PROJECT_BRIEF.md

## 一句話

證明 Antigravity runtime 的 `.agents/` adapter 是被產生器產出的，而不是手寫維護的副本。

## 使用者

- 專案維護者
- Antigravity managed agent

## 要解決的問題

三個 runtime 之中，只有 Antigravity 沒有 filled fixture。產生的 `.agents/` 檔案沒有任何 checked-in 對照，adapter 內容漂移時不會有任何檢查失敗。

## MVP

- 保存一份與產生器輸出逐位元相同的 `.agents/` adapter。
- 驗證每個 SKILL.md 的 frontmatter 可被 runtime 路由。
- 確認 `--agent codex` 不會意外產生 `.agents/`。

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-31 |
| SRC-002 | public | public-pointer | https://github.com/Eskasia/governseed | no | confirmed | maintainer-role | 2026-07-31 |

## 產品形態決策

- 決策模式：user-declared route
- 第一版產品形態：governance CLI / document generator
- Q1-Q9 依據：這個 fixture 的使用者是維護者與 managed agent，需要的是可比對的產生輸出，不是任何使用者介面或應用 runtime。
- 為什麼不是網站 / App / 小程序 / 純後端 / 管理系統等其他形態：fixture 只驗證產生的檔案與 doctor 訊號，任何 UI、native shell、API service 都會引入這裡不需要的 runtime 邊界。
- 何時重新評估：若 Antigravity adapter 需要互動式安裝流程或遠端共享狀態，再評估 web app / management system。
- Decision status：active
- Evidence：SRC-001, SRC-002, REQ-001@1, REQ-003@1
- Nearest alternative：只在測試中斷言 adapter 字串，不保存 fixture
- Review trigger：event-only when the Antigravity adapter gains a surface the generator does not own

## 明確不做

- 不宣稱 Antigravity 讀取或執行了這些檔案。
- 不提供 app runtime。
- 不宣稱外部採用。

## 驗收者

- Repo maintainer runs `node scripts/doctor.mjs --json examples/template-adoption/antigravity-base`.

## 完成標準

- doctor JSON status is `ready`.
