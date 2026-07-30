# Context Pressure Workflow

適用：長任務、大 repo 掃描、多工具輸出、Playwright snapshot 很大、反覆 compaction、需要跨 session continuity 的工作。

> 狀態：**EXPERIMENTAL / NOT BUNDLED / NOT DEFAULT**
>
> 2026-07-29 稽核快照：上游
> [`mksglu/context-mode`](https://github.com/mksglu/context-mode) commit
> `06276b959d5e605e428ab59981b461f3521558b6`、package `1.0.169`、
> Elastic License 2.0、Node.js `>=22.5.0` 或 Bun。版本、授權與 runtime
> 支援在任何實驗前都必須重新查證。

## 定位

`mksglu/context-mode` 是 context / token 壓力緩解層，不是 `startup/01-bootstrap-gates.md`、LLMwiki、handoff、OPEN_LOOPS 的替代品。

它只在以下情況列入實驗：

- 單次任務需要大量讀檔、grep、WebFetch、Playwright snapshot 或 log 分析。
- 長 thread 經常因 compaction 失去任務狀態。
- 需要把大型工具輸出放到外部索引，再用 search/fetch 取回重點。
- 已經用了 CodeGraph / repomix / handoff，仍覺得 context 壓力太大。

## 不放進預設主流程

- 不要求每個新專案安裝。
- 不取代專案文件與 memory as files。
- 不取代 `handoff` skill 的交接摘要。
- 不取代 LLMwiki 的長期知識沉澱。
- 不用在短任務、小 repo、單檔修改、簡答。

## 實驗前提

- 先重新確認 pinned source、package 版本、Node.js/Bun 要求與 ELv2
  授權限制。
- 安裝會執行 package `postinstall`，且工具可執行 JavaScript/Python
  分析程式；先做供應鏈與任意程式執行邊界審查。
- 工具以本機 SQLite/FTS5 保存 session 與索引內容。先確認儲存路徑、
  保留期限、purge 行為，且不得輸入 secrets、客戶資料或私人證據。
- hooks 可攔截工具事件、prompt 與 compaction 狀態，也可能寫入使用者
  scope 設定。只在隔離的 sandbox/runtime home 測試，不直接全域安裝。
- 此稽核快照的上游提供 Codex MCP/hook 路徑，但本 repo 尚未驗證其相容性、
  trust prompt、hook 事件、清理或不覆寫 `AGENTS.md` 的行為。

## 命令語境

- 在 agent chat 中輸入 `ctx stats` 或 `ctx doctor`，是要求模型呼叫 MCP
  tool，不是 terminal executable。
- Claude Code plugin 使用 `/context-mode:ctx-stats` 與
  `/context-mode:ctx-doctor` slash commands。
- Terminal 診斷使用 `context-mode doctor`；實際命令仍以 pinned upstream
  文件與安裝型態為準。

## 建議測試場景

1. 大 repo 掃描：比較 raw `rg` / `cat` 與 context-mode sandbox 後的 token 使用。
2. Playwright UI debug：比較 snapshot 直接進 context 與 sandbox 後摘要。
3. 長任務 continuity：中途 compaction 後，確認是否能找回最近文件、錯誤、決策。
4. 錯誤排查：將大型 logs index 後，只取相關錯誤片段。

## 驗收

- `context-mode doctor` 與對應 runtime 的 MCP `ctx doctor` 都通過。
- `ctx stats` 能顯示可重現的 context saving，而不是只接受上游宣稱。
- 已列出 hooks、user-scope 寫入、本機資料庫與 purge 後殘留。
- agent 不會因為 context-mode 忘記讀專案 `AGENTS.md`、`TASK_CONTRACT.md`、`OPEN_LOOPS.md`。
- 工具不會覆寫或降低 active project gates，且 optional tools 只在當前
  環境可用、任務需要並獲授權時啟用。
