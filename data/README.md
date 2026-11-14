# Data

`anon_processed_df_parquet` is PSYCHE-D (Zenodo 5085146, CC BY-NC 4.0). It is not committed. Download (PowerShell):

```powershell
$d="$PWD\data"; (irm https://zenodo.org/api/records/5085146).files | % { iwr $_.links.self -OutFile "$d\$($_.key)" }
```

Then from `backend/`: `python -m scripts.psyched_baseline ../data/anon_processed_df_parquet`
