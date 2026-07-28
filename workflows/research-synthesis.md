# Research Synthesis Workflow

適用：專案出現會實質影響決策的證據衝突、高影響或難回頭的選擇、多條可信路線，或使用者明確要求多視角研究時。

不適用：單一穩定事實、低風險可逆選擇、一般摘要、已有明確且充分證據的決策。這是一項條件式治理能力，不是研究 runtime、多代理編排器或發布 gate。

## Trigger

Agent 在 Q1-Q9 已足以表述決策問題後，以及任何重大決策定案前，檢查下列 reason code：

| Reason code | 觸發訊號 |
|---|---|
| `explicit-multi-view` | 使用者明確要求比較、批判、辯論或多視角分析 |
| `evidence-conflict` | 來源對決策相關主張有實質衝突 |
| `high-impact-decision` | 決策成本高、難回頭或後果重大 |
| `credible-route-divergence` | 至少兩條可信路線建立在不同假設上 |
| `cross-domain-gap` | 跨領域或跨時期資訊缺口會改變決策 |

只有訊號會實質改變範圍、驗收、風險、成本或路線時才建議啟動；不要因關鍵字或一般複雜度自動啟動。

## Confirmation

1. 回報偵測到的 reason code、它會影響哪個決策，以及不用此流程的風險。
2. 一次只問一題：是否建立 `RESEARCH_SYNTHESIS.md`。
3. 使用者確認後才從 `templates/conditional/RESEARCH_SYNTHESIS.md` 建立專案文件並執行。
4. 使用者拒絕時不建立空文件；只有該缺口同時影響既有 gate 時，才把未解風險寫入 `OPEN_LOOPS.md`。

偵測與建議不是核准。不得靜默切換模式，也不得因缺少 `RESEARCH_SYNTHESIS.md` 自行新增全域 hard gate。

`init --all` 可能預先複製空模板；檔案存在不代表已偵測、已確認或已完成。使用者確認前不得填寫或引用它作為決策證據。Doctor 的 `present` 只表示檔案存在；`Activation Record` 沒有唯一且明確的 `User decision: confirmed` 或 `User decision: declined` 時，以 `RESEARCH_CONFIRMATION_MISSING` 警告，strict 檢查必須失敗。只有 `confirmed` 會啟動研究。

## Research Contract

- 模式：material-first hybrid。先使用使用者提供的材料；外部研究只補已記錄的重要 gap。
- 外部來源：優先官方、原始研究與第一手資料；時效性主張記錄查證日期。
- 隱私：沿用 `PROJECT_BRIEF.md` 的 privacy-safe source attestation，不複製私人內容、敏感 URL、憑證或原始工具 trace。
- 可追溯性：每個實質 finding 連到 `CLM-*`；每個 claim 連到 `SRC-*`，或明確標成 inference、professional judgment、unknown。
- 不虛構：找不到證據就保留 gap；不可補造 citation、引文、數字、共識或專家身份。
- 邊界：五個視角是分析框架，不代表五個真實專家，也不授權額外工具、模型呼叫或子代理。

## Five-lens Scan

先各自完成五個 lens，再做綜合，避免先有結論後讓每個視角替它背書：

1. Practitioner：操作限制、實務回饋、失敗模式、落地成本。
2. Scholar：定義、理論、研究品質、因果關係、替代解釋。
3. Skeptic：最強反證、證據缺口、過度主張、失效條件。
4. Economist：誘因、機會成本、分配效果、市場結構、二階效應。
5. Historian：路徑依賴、可比先例、時代差異、錯誤類比。

每個 lens 必須填：核心立場、最強支持證據、最強反證或異議、隱藏訊號、claim IDs。無法適用時填 `not-applicable` 與理由，不得編造內容湊齊。

## Evidence And Contradiction Rules

- Evidence strength 與 confidence 分開評估；來源數量不能自動等於證據品質。
- 只有直接專案證據或相互印證的高品質 primary sources，且沒有重大未解衝突，才可標為 `strong`。
- Inference 和 professional judgment 可保留，但必須標示，不能寫成已驗證事實。
- 觀點衝突不得平均成假共識；逐項記錄雙方 claim、證據、受影響 lens、狀態與下一個可判別證據。
- 外部 research 只能回填 `GAP-*`，不能擴張原問題或偷偷改寫成功標準。

## Layered Output

`RESEARCH_SYNTHESIS.md` 固定分兩層：

1. Executive layer：一句話總結、按 confidence 排序的 findings、建議行動、前沿問題。
2. Review layer：來源與 claim ledger、五視角掃描、矛盾圖、共識、空白、跨視角關聯、自評。

建議必須連到 finding，並寫明可逆性、驗證方式與 stop / re-evaluate trigger。研究結論只能提出對 `PROJECT_BRIEF.md`、`SPEC.md`、`TECH_STACK.md` 或 `OPEN_LOOPS.md` 的候選更新；使用者確認前不得改寫既有決策。

## Self-review

- 逐項找出 finding 的最薄弱證據、最強替代解釋、未解衝突，以及什麼新證據會改變結論。
- 使用模板內 0-4 分 academic-rigor rubric；評分必須附 evidence 與 required improvement。
- 不宣稱或模擬 Stanford University 身份、背書或真實教授評審。透明 rubric 取代權威角色扮演。
- Self-review 只能揭示品質與缺口，不能把自身評分當成 acceptance、release 或 effectiveness evidence。

## Completion

- 已記錄 reason code 與使用者確認。
- 五個 lens、claim/source trace、contradiction map、confidence calibration 與 self-review 均完成。
- 未解 gap 和反證仍可見，沒有假共識或虛構來源。
- External gap-fill 沒有超出核准範圍。
- Canonical project documents 只納入使用者確認的候選變更。
- 這份產物維持 advisory，不取代 `GATE-INTENT-001`、`GATE-ROUTE-001`、測試、驗收或發布證據。
