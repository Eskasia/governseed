# Production Agent Workflow

適用：產品裡有 LLM agent、自動化、多步工具調用、human approval、背景任務、Slack/Gmail/webhook 觸發，或任何「AI 會替使用者做事」的功能。

不適用：單次 AI draft、單次摘要、單次分類、只在本機手動執行的研究輔助；這些先用普通 `TASK_CONTRACT.md` 和測試驗證即可。

若同時涉及 RAG、MCP、long-term memory、eval pipeline、多租戶資料、文件智能或 provider fallback，還要讀 `workflows/ai-system-design.md`。

## 核心原則

可靠 agent 不是「prompt + 一袋 tools + loop 到完成」。可靠 agent 是可觀測、可暫停、可恢復、可驗證的軟體流程，LLM 只負責需要語言理解或模糊判斷的步驟。

## 必補文件

做 production-facing agent 時，建立 `AGENT_RUNTIME.md`。

必填欄位：

- Agent 目標：要替誰完成什麼工作。
- 觸發入口：UI、cron、webhook、Slack、Gmail、CLI、人工手動。
- State：業務狀態、執行狀態、儲存位置、可否從事件重建。
- Event：哪些事件會推進 agent。
- Context window：每次給模型的格式、來源、壓縮方式、不得放入的內容。
- Prompts：prompt template 儲存位置、核准版本、誰可改；trace 只記 version 與 privacy-safe metadata，不保存 private runtime prompt。
- Structured outputs：模型只能輸出的 JSON / schema / action 類型。
- Tools：每個 tool 的權限、副作用、idempotency、rollback。
- Control flow：哪些流程由程式掌控，哪些交給模型判斷。
- Human approval：何時必須問人、誰批准、逾時怎麼辦。
- Launch / pause / resume：如何啟動、暫停、恢復、重試、取消。
- Error compaction：錯誤如何壓縮後回到 context，不把整段噪音塞回模型。
- Verifier：測試、eval、benchmark、replay、E2E、人工抽查。
- Agent boundary：任務是否小而聚焦，預期步數是否控制在 3-10 步。
- Stateless reducer：能否用 `state + event -> next action` 描述。
- Audit / observability：stable tool / decision / check ID、aggregate cost / latency、failure code 如何查；不保存 raw tool trace、model stdout/stderr、environment variables 或 raw diff。
- Kill switch：如何立即停用背景任務、外部 action 或高風險 tool。

## 12 Factor Gate

進入實作前逐項回答：

| Factor | 檢查問題 |
|---|---|
| Natural language to tool calls | 模型是否只把自然語言轉成結構化 action？ |
| Own prompts | 核准的 prompt template 與 version 是否在 repo / docs 內可 review，且 private runtime prompt 不落盤？ |
| Own context window | context 格式是否由我們設計、可測、可壓縮？ |
| Tools are structured outputs | tool call 是否只是 JSON，副作用由程式控制？ |
| Unify state | 執行狀態是否盡量和業務狀態合一？ |
| Launch / pause / resume | 是否能啟動、暫停、恢復、重試、取消？ |
| Contact humans | 問人是否是一等 tool/action，不是臨時例外？ |
| Own control flow | 重要流程是否由程式掌控，而不是交給無限 loop？ |
| Compact errors | 錯誤是否會被整理成短而有用的 context？ |
| Small focused agents | agent 是否小而聚焦，避免巨大通用任務？ |
| Trigger anywhere | 是否定義使用者實際入口，而不是只支援 chat？ |
| Stateless reducer | 是否能用 state + event 推導下一步？ |

## Governance Evidence Boundary

- Real mode 是 synthetic-only：governance-impact 只跑乾淨、已 commit 的 synthetic scenario；runtime proof 只跑生成的 synthetic fixture。
- Raw buffer 只能在 bounded memory 中被掃描與解析；private prompt、masked excerpt、raw stdout/stderr、raw tool trace、environment variable、credential、absolute home path 與 raw diff hunk 都不得持久化。
- 只在 closed-schema validation、fail-closed privacy scan 與 cleanup proof 全部通過後，原子保存 normalized evidence。
- Scanner、session persistence、output schema 或 cleanup 無法證明安全時，回傳 stable code 且不產生 artifact，不得降級成較弱模式。
- Runtime proof 只證明 entrypoint first-response contract；governance-impact evaluator 才評估 intake 後的 delivery artifact，且需通過獨立 evidence gate 才能支撐 effectiveness claim。
- Codex evaluator real run 因 detached / re-parented descendant containment 未證明而拒絕；Claude 因 workspace containment 未證明而拒絕；Antigravity 缺 binary 時 unavailable，存在 binary 時仍拒絕到 non-persistence 與 containment 都被證明。

## 實作順序

1. 先做 deterministic thin slice：固定輸入、固定 action、固定 verifier。
2. 再接 structured output：模型只輸出 action，不直接執行副作用。
3. 再接 tools：每個 tool 寫清權限、副作用、idempotency、rollback。
4. 再接 state：狀態可查、可重播、可恢復。
5. 再接 human approval：高風險 action 必須先問人。
6. 最後才做 automation / background loop。

## 不要一開始就做

- 不要先接一大包 tools。
- 不要把 control flow 交給框架黑盒。
- 不要讓模型直接做有副作用的操作。
- 不要把完整 stack trace 原樣塞回 context。
- 不要在沒有 verifier 時開長任務或背景 automation。
- 不要把一個 agent 做成所有事情都會的通用角色。

## 驗收

- `AGENT_RUNTIME.md` 已完成。
- 每個 tool 都有 schema、權限、副作用、idempotency、rollback。
- 每個高風險 action 都有 human approval。
- 每個錯誤都有 compact 格式。
- 至少有一個 replay / eval / E2E / smoke 可以證明 agent 沒跑偏。
- 可以暫停、恢復、重試或取消。
- 可以解釋目前 state、下一個 event、下一個 action。
- Trace 只記核准的 prompt-template version 與 privacy-safe metadata，持久化內容符合 normalized closed-schema。
- Real-mode synthetic-only、scanner fail-closed、cleanup-before-persist 與 claim boundary 都有可執行 verifier。
