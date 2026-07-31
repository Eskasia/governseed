# ENV_CHECKLIST.md

## 環境變數清單

| Variable | 用途 | Local | Preview | Production | 機密等級 | 來源 / 取得方式 |
|---|---|---|---|---|---|---|
| `MODEL_API_KEY` | 呼叫模型供應商產生草稿 | 使用測試金鑰 | 使用測試金鑰 | 使用正式金鑰 | secret | 供應商後台建立，存入平台 secret store |
| `ALERT_STREAM_TOKEN` | 讀取告警串流 | 使用合成串流 | 使用合成串流 | 使用正式串流 | secret | 告警平台服務帳號 |
| `APPROVAL_SERVICE_URL` | 簽核服務端點 | 本機模擬服務 | preview 環境端點 | 正式端點 | public | 平台服務目錄 |
| `HISTORY_INDEX_URL` | 歷史事故索引端點 | 本機合成索引 | preview 合成索引 | 正式索引 | public | 平台服務目錄 |
| `AGENT_KILL_SWITCH` | 停用草稿生成 | 預設 off | 預設 off | 預設 off | public | 平台 feature flag |

## 機密等級說明

- **public**: 可以出現在前端 bundle（`NEXT_PUBLIC_*`、`VITE_*`）
- **secret**: 只能在 server-side，不可提交 git，不可出現在 console log

## 不可提交項

- [x] `.env` / `.env.local` / `.env.production` 已加入 `.gitignore`
- [x] 無 API key 出現在程式碼、commit history 或 CI log

## Provider Setup

| Provider | 設定步驟 | Dashboard URL | 備註 |
|---|---|---|---|
| Model provider | 建立專用金鑰、限制到草稿生成用途、記錄輪替日期 | 內部服務目錄記載 | 金鑰輪替需同時更新 secret store |
| Alert platform | 建立唯讀服務帳號、限制到告警串流 | 內部服務目錄記載 | 服務帳號不得具備確認或關閉告警的權限 |
| Approval service | 註冊 agent 為請求方、開啟審計記錄 | 內部服務目錄記載 | 審計記錄是 AC-402 的證據來源 |

## 部署前確認

- [x] Local smoke：所有必要 env 已設定，`npm run dev` 可啟動
- [x] Preview：env 已設定到 Vercel / Netlify / CI preview 環境
- [x] Production：env 已設定，rotation 策略已記錄
- [x] 無 env 使用 fallback 默認值而未記錄
