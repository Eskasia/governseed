# TECH_STACK.md

## 技術路線決策

- 決策模式：user-declared route
- 唯一主路線：program-controlled agent loop with a model confined to structured output
- 選擇理由：事故現場的風險是模型自行決定動作，因此流程順序、工具呼叫與簽核關卡都由程式掌控，模型只負責在封閉 schema 內產生建議。
- 排除路線：不採自主 agent framework、不採模型直接呼叫 shell、不採多 agent 協商，因為它們都把動作決定權移出程式碼。
- 後期風險：告警來源格式變動會讓上下文收集失準；歷史事故庫過期會產生看似合理但錯誤的比對。
- 重評估條件：若量測到草稿的誤建議率低於既定門檻且事故指揮同意，再評估放寬部分可逆動作。
- 新技術引入 gate：引入任何可寫入生產環境的工具前，必須先在 AI_SECURITY_REVIEW 記錄權限、副作用、簽核與回滾。
- Decision status：active
- Evidence：SRC-401, SRC-402, SRC-403, REQ-401@1, REQ-402@1
- Nearest alternative：autonomous agent framework with post-hoc audit
- Review trigger：event-only when the measured false-suggestion rate supports widening the action boundary

## Runtime

| Layer | Choice | Version | Reason | Alternative considered |
|---|---|---|---|---|
| Frontend | Existing on-call console | unchanged | Draft appears where the responder already is | New standalone UI |
| Backend | Stateless reducer service | project pinned | Every step is replayable from the event log | Long-lived agent process |
| Database | Incident event log plus history index | project pinned | Business state and execution state stay separable | In-memory session state |
| Main framework / SDK | Model provider SDK with structured output | project pinned | Schema-constrained output is the containment boundary | Free-form completion |
| Package manager | Project standard | project pinned | No new toolchain introduced | Alternative registry |
| Deployment | Existing internal release pipeline | unchanged | Ships with the on-call service | Separate service |

## External Services

| Service | Purpose | Env vars | Owner |
|---|---|---|---|
| Model provider | Draft generation | `MODEL_API_KEY` | release-owner-role |
| Alert source | Incoming alert stream | `ALERT_STREAM_TOKEN` | operator-role |

## Version Policy

- Pin the model version in the prompt-template record; a version change requires an EVAL_PLAN regression run.

## Constraints

- No tool that writes to production may be reachable without an ask_human step.
