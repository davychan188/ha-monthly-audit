# HA Monthly Audit

屋邨樹木缺陷離線記錄（日期、屋邨、號碼、Defect、Recommendation）。以列表形式顯示，每頁 10 棵，操作接近 Field Tree Schedule。資料只存在你部電話或 iPad 嘅瀏覽器，唔會上載到伺服器。可匯出 Excel。

## 點樣打開

建議用 HTTPS 網站（GitHub Pages）：

[https://davychan188.github.io/ha-monthly-audit/?v=6](https://davychan188.github.io/ha-monthly-audit/?v=6)

本地測試可喺呢個資料夾執行：

```bash
python3 -m http.server 8080
```

然後用 Chrome 或 Safari 打開 `http://本機或伺服器位址:8080/?v=6`。Service Worker 同「加入主畫面」喺 `file://` 唔會生效。

## 加入主畫面

第一次用網絡打開並等頁面載入完成之後，先做以下步驟。之後無網絡都可以繼續用（包括匯出 Excel）。

### Android（Chrome）

1. 用 **Chrome** 打開網站。
2. 撳右上角選單（⋮），揀 **加入主畫面** 或 **安裝應用程式**。
3. 之後由主畫面圖示打開即可。

### iPad / iPhone（Safari）

請用 **Safari** 打開（唔好用其他 App 內嵌瀏覽器）。iPad mini 直向或橫向都可以用列表，必要時可左右滑動欄位。

1. 用 **Safari** 打開網站。
2. 撳分享按鈕（方框加向上箭咀）。
3. 揀 **加入主畫面**。

若要用 Apple Pencil 喺欄位手寫，請喺「設定 > Apple Pencil」開啟 **Scribble（隨手寫）**。

畫面標題旁邊會顯示目前版本（例如「v6 改版」）。撳呢個標記可打開改版說明，睇每個版本改咗咩。如果主畫面開住嘅仍係舊版，請用帶 `?v=6` 嘅連結再開一次，或喺 Safari／Chrome 重新載入後再加入主畫面。

## 點樣用（列表）

畫面係一張表，每頁 10 行（唔夠 10 行會補空白行）。撳「下一頁」可以再加 10 行。

欄位由左至右：

1. **#** 行號
2. **日期**：空白行唔會預先填日期，要自己揀。撳欄位會開系統日期選擇器（iOS Safari 同 Android Chrome 都可用）。已儲存記錄會保留原來嘅日期。
3. **屋邨**：撳欄位可用中文或英文搜尋（例如 Ching Ho、tin yiu、hoi tai，有冇寫 Estate／Court 都得）。名單有 75 個屋邨，清單會同時顯示官方中文名同英文名。記錄同匯出嘅「屋邨」欄仍然係中文官方名稱；Excel 另外有「屋邨英文」欄方便核對。
4. **號碼**：撳欄位會喺下面彈出九宮格數字鍵盤，可用 T／AT／TG 前綴，再撳「清除／下一個／完成」。
5. **Defect**：撳欄位打開快捷鍵九宮格式 3 欄方格（可多選），亦可以搜尋完整清單或輸入自訂內容。多項用逗號加空格（`, `）連接。
6. **Recommendation**：最後一欄。撳欄位打開方格清單，可同時勾選多項，選中內容會顯示喺格內。

連續輸入時，會記住上次揀嘅屋邨並填入下一行空白格；日期唔會自動帶入，要每行自己揀。

若同一日期、同一屋邨、同一號碼已有另一行，會提示你。刪除一行或清除全部前會再確認。

### Defect 快捷鍵（依序）

1. dead branch
2. broken branch
3. hanger
4. leaning
5. BRRD
6. sparse foliage
7. dead tree
8. imbalanced crown
9. overgrown
10. Root plate movement
11. dead fronds

用字固定如上。清單以外嘅缺陷可以搜尋或手打。

### Recommendation 選項

Crown cleaning、Crown reduction、Crown thinning、Crown raising、Staking、Cabling、Cobra、Re-inspection within 6 months、Re-inspection within 3 months、Removal、Resis/tomo。

上方工具列可搜尋任何欄位，再匯出目前結果。撳「匯出 Excel」會下載 `.xlsx`，欄位包括：日期、屋邨、屋邨英文、號碼、Defect、Recommendation、建立時間、更新時間。「更多」提供 JSON 備份／還原（合併或全部取代）。舊備份入面如有已刪除嘅檢查人員欄位會被忽略，唔會再顯示。

## 離線同資料安全

- 第一次成功載入後，應用程式同 Excel 元件會缓存喺裝置，飛行模式都可以繼續填表同匯出。
- 記錄存在本機 IndexedDB，重新整理或關閉 App 都仲喺。舊版記錄仍然可以載入（當時未有嘅 Recommendation 會留空）。
- **清網站資料、刪 App、換機或還原裝置就會冇記錄。** 請定期匯出 Excel 或 JSON 備份。
- 加入主畫面之後，資料通常比只係開住瀏覽器分頁更穩陣。

## 備註

- 屋邨後綴係「邨」，名單來自來源檔，唔好同「邸」混淆。來源檔入面「天耀」兩項已按「天瑞(一)邨／天瑞(二)邨」正規化為 **天耀(一)邨**、**天耀(二)邨**。
- 應用程式唔鎖死月份，每行有自己嘅日期。

## 改版紀錄

標題旁邊嘅「v6 改版」可以打開應用程式入面嘅改版說明。呢個係 version 6 改版。

- **v1**：初版離線記錄（屋邨、日期、樹號碼、defect），可匯出 Excel，Android / iPad 可加入主畫面離線用。
- **v2**：改成列表，一頁 10 棵；欄位：日期、屋邨、號碼、Defect、Recommendation；號碼用九宮格；Defect 快捷鍵（dead branch, broken branch, hanger, leaning, BRRD, sparse foliage, dead tree, imbalanced crown, overgrown, Root plate movement, dead fronds）；Recommendation 選項。
- **v3**：日期不再預先填上；屋邨加上官方英文名，打中文或英文都可以搜尋到。
- **v4**：標題顯示版本號；刪走 lynn、davy、Felix 負責人標記同篩選。
- **v5**：選完號碼後唔會自動彈去 Defect；「完成」只收起九宮格，「下一個」去下一行號碼。
- **v6**：加入呢份版本改版說明。
