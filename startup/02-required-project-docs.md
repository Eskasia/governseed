# 02 Required Project Docs

## 固定文件

| 檔案 | 目的 | 完成標準 |
|---|---|---|
| `README.md` | 初始化後的專案入口、讀檔順序、doctor 指令 | 新 agent 能先找到 `START_HERE.md` 與 runtime entrypoint |
| `PROJECT_BRIEF.md` | 專案的一句話、使用者、問題、MVP、產品形態決策 | 能讓新 agent 30 秒理解方向 |
| `SPEC.md` | 功能範圍、非目標、驗收標準 | 每條驗收可用 yes/no 判斷 |
| `CONTEXT.md` | shared language、角色、資料物件、易混淆詞 | 名詞不再漂移 |
| `TASK_CONTRACT.md` | 把 MVP 拆成可執行任務 | 每個任務有輸入、工具、輸出、驗證、不做事項 |
| `OPEN_LOOPS.md` | 未決問題、風險、待確認項 | 不把未知當已知 |
| `AGENTS.md` | 專案內 agent 規則 | 明確常用命令、禁止事項、測試規範 |
| `TECH_STACK.md` | 技術路線、前端、後端、資料庫、框架 / SDK、部署、版本 | 技術選擇可追溯 |

Generated `AGENTS.md` 是 `GATE-INTENT-001` 與 `GATE-ROUTE-001` 的唯一 lifecycle owner；其他固定文件只保存 gate 所需證據或引用 ID。

## 文件結構分流

收尾時判斷新經驗該寫到哪裡，詳見 `workflows/agent-file-structure.md`。

## 條件式文件

| 檔案 | 何時需要 |
|---|---|
| `UI_SPEC.md` | 有任何 UI、網站、App、後台、dashboard、landing page |
| `DESIGN_SYSTEM.md` | 有截圖、現有 UI 或競品畫面，要反推設計規範、設計圖、tokens、icon、背景圖素材 |
| `DESIGN_REVIEW.md` | UI 要給人試用、上線、或需要記錄設計審查 |
| `DATA_MODEL.md` | 有 DB、Auth、tenant、權限、核心資料物件 |
| `API_CONTRACT.md` | 前後端資料交換、API route、server action、webhook、adapter |
| `ENV_CHECKLIST.md` | 要部署、串 OpenAI/Supabase/Stripe/Email/Storage/第三方 API |
| `MACOS_RELEASE_CHECKLIST.md` | build / package macOS app，或涉及 TCC 權限、簽名、notarization |
| `AGENT_RUNTIME.md` | production-facing LLM agent、自動化、多步工具調用、human approval |
| `RAG_DESIGN.md` | 有 retrieval、知識庫、文件問答、citation、permission-aware search |
| `EVAL_PLAN.md` | 有 LLM / RAG / agent 產出需要回歸驗證、golden set、LLM-as-judge、online monitoring |
| `AI_SECURITY_REVIEW.md` | 有 prompt injection、tool use、tenant data、PII、權限、外部 action、HTML / SQL / shell output |
| `docs/adr/*.md` | 不容易回頭的架構、資料模型、部署、外部服務選擇 |

## TASK_CONTRACT 任務格式

```md
## 任務：<任務名稱>

- 輸入：
- 可用工具：
- 預期輸出：
- 驗證方式：
- 不做事項：
```
