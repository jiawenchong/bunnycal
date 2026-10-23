# BunnyCal 兔兔卡路里 🐰

網頁版的熱量／營養素追蹤 App（PWA），可以加到手機主畫面當 App 用。
教練是戴運動頭帶的兔子「蹦蹦」。不接 LLM 也能完整使用；接上自己的 LLM 後可以拍照辨識、AI 解析和聊天。

## 功能

| 功能 | 不接 LLM | 接 LLM |
|---|---|---|
| 時間軸飲食紀錄（不分早午晚餐） | ✅ | ✅ |
| 熱量／蛋白質／碳水／脂肪儀表板、纖維／糖／鈉／飽和脂肪 | ✅ | ✅ |
| 個人化目標（Mifflin-St Jeor） | ✅ | ✅ |
| **每週自動校正 TDEE**（依實際攝取與體重趨勢反推） | ✅ | ✅ |
| 體重紀錄 + 趨勢線（過濾水分波動）、預估達標時間 | ✅ | ✅ |
| 每日熱量圖、月曆（達標／超標／有量體重） | ✅ | ✅ |
| 斷食計時（12:12～23:1）與紀錄 | ✅ | ✅ |
| 內建食物資料庫：台灣外食小吃、馬來西亞料理、連鎖與異國料理 | ✅ | ✅ |
| 搜尋、收藏、最近吃過、自訂食物 | ✅ | ✅ |
| 掃條碼（Open Food Facts 全球資料庫）＋自建條碼商品 | ✅ | ✅ |
| 打字記錄（「兩顆蛋、半碗白飯、200g雞胸」） | ✅ 離線解析 | ✅ AI 解析 |
| 營養標示拍照 | ✅ 離線 OCR | ✅ AI 讀取 |
| 餐點照片辨識 | 可存照片＋手動填 | ✅ |
| 兔兔教練建議 | ✅ 規則式提醒與週報 | ✅ 每餐回饋、深入分析、聊天 |
| 今日飲食分享圖卡 | ✅ | ✅ |
| JSON 備份／還原 | ✅ | ✅ |

所有資料都存在瀏覽器的 IndexedDB 裡，不會上傳；AI 功能只會把照片和文字送到你設定的 LLM。

## 部署到 GitHub Pages

1. 到 repo 的 **Settings → Pages**，Source 選 **GitHub Actions**（只需要設定一次）。
2. push 到 `main` 就會自動測試、build、部署。網址：`https://<帳號>.github.io/bunnycal/`
3. 手機打開網址：iPhone 用 Safari「分享 → 加入主畫面」；Android 用 Chrome「安裝應用程式」。

## 設定 LLM

**API key 不要 commit 進 repo**（公開 repo 任何人都看得到）。請在 App 裡 **設定 → AI 連線** 填寫，只會存在手機瀏覽器。

- 串接方式「先上傳圖片取得 file_id」：對應公司 Agent 平台
  - 圖片先 `POST {base}/files`（multipart，`purpose=vision`）拿 `file_id`
  - 再 `POST {base}/chat/completions`，content 用 `{"type":"file","file":{"file_id":...}}`
  - 圖片會先縮到長邊 1600px、轉成 JPG；每次呼叫都重新上傳
- 串接方式「OpenAI 相容」：圖片用 base64 `image_url`（OpenAI、OpenRouter、Ollama 等）

從瀏覽器直接呼叫內網平台時要注意：

- 手機要連公司網路或 VPN。
- 平台用自簽憑證的話，先在同一個瀏覽器打開 API 網址並選擇信任。
- 平台要允許這個網站的跨網域請求（CORS）。

設定頁的「測試文字／測試圖片」可以直接確認連線是否正常。

## 開發

```bash
npm install
npm run dev      # 本機開發
npm test         # 單元測試
npm run build    # 產生 dist/
```

技術：Vite + React + TypeScript、Dexie（IndexedDB）、vite-plugin-pwa、barcode-detector（ZXing wasm）、tesseract.js。

食物資料為估算值，參考衛福部食品營養成分資料庫、MyFCD 與連鎖店公開營養標示，外食因店家差異大，記錄時可以自行修改。
