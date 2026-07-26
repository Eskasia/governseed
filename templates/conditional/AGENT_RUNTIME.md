# AGENT_RUNTIME.md

## Agent 目標

- 使用者：
- 要完成的工作：
- 不做事項：

## 觸發入口

- UI：
- cron：
- webhook：
- Slack / Gmail / connector：
- CLI / manual：

## State

- 業務狀態：
- 執行狀態：
- 儲存位置：
- 是否可從事件重建：

## Event

- 事件類型：
- 事件來源：
- 推進規則：

## Context Window

- 格式：
- 來源：
- 壓縮方式：
- 禁止放入：

## Prompts

- Prompt template 儲存位置：
- 核准的 prompt-template version：
- privacy-safe trace metadata：
- 修改規則：
- 禁止保存：私密 prompt 文字、遮罩後私密摘錄或 runtime prompt 副本。

## Structured Outputs

- action schema：
- done / pause / ask_human：
- invalid output handling：

## Evidence Persistence

- 可保存內容：通過 validator 與 privacy scanner 的 normalized closed-schema evidence。
- 禁止保存：raw model stdout/stderr、raw tool trace、environment variables、credentials、absolute home paths、raw diff hunks。
- Real mode：governance-impact 只接受乾淨且已 commit 的 synthetic scenario；runtime proof 只使用生成的 synthetic fixture。
- Fail closed：scanner、output schema、session persistence 或 cleanup 無法證明安全時，僅回傳 stable code，不產生 artifact。
- Cleanup-before-persist：先終止並 reap child、移除 isolated HOME/TMP/workspace、確認沒有殘留，再原子保存證據。
- Claim boundary：runtime proof 只證明 entrypoint first-response contract；governance-impact evaluator 才能在獨立 evidence gate 後陳述 delivery impact。
- Current evaluator capability：Codex real run 因 detached / re-parented descendant containment 未證明而拒絕；Claude 因 workspace containment 未證明而拒絕；Antigravity 缺 binary 時 unavailable，存在 binary 時仍須先證明 non-persistence 與 containment。

## Tools

| Tool | 權限 | 副作用 | idempotency | rollback |
|---|---|---|---|---|

## Control Flow

- 程式掌控：
- 模型判斷：
- 最大步數：

## Human Approval

- 必須問人的 action：
- approver：
- timeout：
- fallback：

## Launch / Pause / Resume

- launch：
- pause：
- resume：
- retry：
- cancel：

## Error Compaction

- 錯誤來源：
- 壓縮格式：
- 重試上限：

## Verifier

- tests：
- eval：
- replay：
- E2E：
- 人工抽查：

## Agent Boundary

- 預期步數：
- 是否小而聚焦：
- 拆分建議：

## Stateless Reducer

```text
state + event -> next action
```
