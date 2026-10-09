# 銀座地圖資料來源

`city.json`、`roads.json`：東京銀座（一〜八丁目及周邊）的建築外框、估算高度與道路中心線，
由 Ginza 專案的 `scripts/fetch_osm.py`（Overpass API）與 `scripts/build_city.py` 從 OpenStreetMap 轉換而來。

© OpenStreetMap contributors。以 [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/) 提供，
詳見 <https://www.openstreetmap.org/copyright>。修改後的資料仍須以 ODbL 提供。

約九成建築沒有 OSM 高度資料，為依占地面積估算。
