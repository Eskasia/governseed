# AI System Design Workflow

適用：RAG、知識庫問答、AI agent、MCP、eval pipeline、多租戶 AI SaaS、文件智能、coding agent、tool-use agent，或任何 AI 功能要進入 production / preview / 客戶試用。

不適用：單次摘要、單次分類、內部手動研究、一次性 prompt 草稿；這些用 `TASK_CONTRACT.md` 和普通 smoke 即可。

## 使用原則

這份文件來自 LLMwiki 對 `ombharatiya/ai-system-design-guide` 的整理。它是 checklist，不是固定流程；模型價格、benchmark、provider 能力、API 行為和工具版本必須現查。

## 開工前分流

| 類型 | 必讀文件 | 必補產物 |
|---|---|---|
| RAG / 知識庫問答 | `startup/02-required-project-docs.md`、本文件 | `RAG_DESIGN.md`、`EVAL_PLAN.md` |
| Agent / MCP / tool-use | `workflows/production-agent.md`、本文件 | `AGENT_RUNTIME.md`、`EVAL_PLAN.md`、必要時 `AI_SECURITY_REVIEW.md` |
| 多租戶 AI SaaS | `workflows/fullstack.md`、本文件 | `DATA_MODEL.md`、`API_CONTRACT.md`、`AI_SECURITY_REVIEW.md` |
| 文件智能 / OCR / extraction | 本文件、必要時 `workflows/fullstack.md` | `EVAL_PLAN.md`、資料 schema、抽取錯誤樣本 |
| AI 上線 / preview | `workflows/validation-release.md`、本文件 | `EVAL_PLAN.md`、rollback / kill switch 記錄 |

## RAG Gate

- Ingestion：來源、格式、更新頻率、失敗重試、去重方式。
- Chunking：切分規則、metadata、parent-child 或章節關係。
- Retrieval：vector / keyword / hybrid、rerank、top-k、citation anchor。
- Permission：tenant、role、document ACL 必須在 retrieval 前過濾。
- Answering：引用來源、不可回答條件、低信心 fallback。
- Evaluation：retrieval recall、faithfulness、answer relevance、citation correctness。
- Monitoring：查詢樣本、missed retrieval、幻覺、成本、延遲、資料漂移。

## Agent / MCP Gate

- State：working / episodic / semantic memory 的儲存位置、TTL、provenance、衝突處理。
- Tools：schema、最小權限、副作用、idempotency、rollback、timeout。
- MCP：只當 agent-to-tool 邊界；不要把 agent-to-agent 協調混在同一層。
- Human approval：付款、刪除、權限、外部發布、資料遷移、客戶可見行為必須問人。
- Sandbox：shell、browser、filesystem、network、credential access 都要有邊界。
- Audit：只追蹤核准的 prompt-template version、stable tool / decision / check ID、相對路徑與 aggregate metadata；不保存原始輸入輸出。
- Kill switch：能停用背景 loop、外部 action、危險 tool。

## Eval / Observability Gate

- Golden set：至少覆蓋 happy path、權限錯誤、資料缺失、模糊需求、惡意輸入。
- Error taxonomy：把失敗分成 retrieval、reasoning、tool、permission、format、latency、cost。
- Traces：保留核准的 prompt-template version 與 privacy-safe trace metadata；不得保存 private prompt、masked excerpt、raw model stdout/stderr、raw tool trace、environment variables、absolute home path 或 raw diff hunk。
- LLM-as-judge：只當輔助評估；要有人工抽查或 deterministic metric 校準。
- Regression gate：每次改 prompt、retriever、tool schema、model、chunking 都要跑。
- Online monitoring：quality、cost、latency、fallback、rate limit、user correction。
- Evidence persistence：先做 closed-schema validation 與 fail-closed privacy scan，cleanup 證明完成後才保存 normalized evidence；scanner 或 cleanup 不確定時只回 stable code，不留 artifact。
- Real mode：governance-impact 只接受乾淨、已 commit 的 synthetic scenario；runtime proof 只接受生成的 synthetic fixture。
- Claim boundary：runtime proof 只驗證 entrypoint first-response contract；governance-impact evaluator 評估 intake 完成後的 delivery artifact，不宣稱測到 Q1-Q9 interview quality。
- Runtime capability：Codex governance-impact real adapter 因 detached / re-parented descendant containment 未證明而回 `SESSION_SAFETY_UNAVAILABLE`；Claude 因 workspace containment 未證明而拒絕；Antigravity 缺 binary 時 unavailable，日後有 binary 仍須先證明 non-persistence 與 containment。

## Security Gate

- Prompt injection：外部內容不能覆蓋 system / developer / tool policy。
- Data leakage：PII、tenant data、secret、internal notes 不得進不必要的 context。
- Output handling：LLM output 不得直接執行 shell、SQL、HTML、payment、delete。
- Access control：先驗證使用者和資料權限，再 retrieval / tool call。
- Key lifecycle：API key、OAuth token、webhook secret 有 owner、rotation、revocation。
- Compliance：醫療、金融、法務、人事、兒童資料等高風險領域要人工審查。

## MLOps / Release Gate

- Provider：primary、fallback、rate limit、timeout、budget alert。
- Cost：prompt caching、semantic cache、max token、batching 或降級策略。
- Deployment：canary、shadow、manual rollback、feature flag。
- Failure recovery：retry、circuit breaker、graceful degradation、manual escalation。
- Documentation：把實際選擇回寫到 `AGENT_RUNTIME.md`、`RAG_DESIGN.md`、`EVAL_PLAN.md` 或 `AI_SECURITY_REVIEW.md`。

## 不進 Runtime 的內容

- 具名模型排行、價格、benchmark、版本結論。
- 單篇文章的工具偏好。
- 未驗證的 agent framework 宣稱。
- 未通過 smoke / held-out task 的新規則。
