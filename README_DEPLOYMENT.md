# Video Analytics Dashboard - Deployment Guide

## 🚀 Railway Deployment

Tento projekt je připraven pro deployment na Railway s podporou:
- ✅ **React frontend** (port 3000)
- ✅ **Node.js backend** (port 3001) 
- ✅ **Python skripty** (Playwright, Pandas)
- ✅ **Chrome/Chromium** v headless režimu
- ✅ **Automatická detekce prostředí**

## 📁 Struktura projektu

```
statistiky/
├── video-analytics-dashboard/     # React aplikace
│   ├── src/                       # React komponenty
│   ├── build/                     # Production build
│   ├── server.js                  # Node.js backend
│   ├── package.json               # Node.js dependencies
│   ├── requirements.txt           # Python dependencies
│   ├── Procfile                   # Railway process definition
│   ├── railway.json               # Railway configuration
│   └── nixpacks.toml             # Build configuration
├── extract_video_info_fast.py     # Python scraper
├── process_excel.py               # Excel processor
└── .gitignore                     # Git ignore rules
```

## 🔧 Environment Variables

Railway automaticky nastaví:
- `PORT` - Port pro Node.js server
- `RAILWAY_ENVIRONMENT` - Detekce cloud prostředí
- `NODE_ENV=production` - Production mode

## 🐍 Python Dependencies

Railway nainstaluje:
- `pandas` - Data processing
- `playwright` - Web scraping
- `openpyxl` - Excel support
- `beautifulsoup4` - HTML parsing
- `lxml` - XML processing

## 🌐 Browser Support

- **Lokálně**: `headless=False` (viditelný browser pro debugging)
- **Railway**: `headless=True` s optimalizacemi pro Novinky.cz

## 📊 Features

- **Excel upload** → automatická extrakce
- **CSV upload** → přímé nahrání
- **Real-time progress** → sledování extrakce
- **Dataset management** → správa týdnů
- **Analytics dashboard** → grafy a statistiky
- **Source categorization** → Novinky, Reuters, AP, Policie, Ostatní
- **Completion rates** → dokoukanost videí
- **Sortable tables** → řazení sloupců

## 🚀 Deployment Steps

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Initial deployment setup"
   git push -u origin main
   ```

2. **Connect to Railway**:
   - Jděte na [railway.app](https://railway.app)
   - Přihlaste se s GitHub
   - "New Project" → "Deploy from GitHub repo"
   - Vyberte `davidrynes/analytics`

3. **Railway automaticky**:
   - Detekuje `package.json` → Node.js
   - Nainstaluje Python dependencies
   - Spustí `npm run build`
   - Spustí `node server.js`

## 🔍 Monitoring

- **Logs**: Railway dashboard → Logs tab
- **Metrics**: CPU, Memory, Network
- **Health check**: `/api/status` endpoint

## 🛠️ Troubleshooting

### Headless browser issues:
- Railway používá `headless=True` s optimalizacemi
- Pokud selže, zkontrolujte logs pro chyby

### Python dependencies:
- Railway nainstaluje vše z `requirements.txt`
- Playwright browsers se stáhnou automaticky

### Memory issues:
- Railway má 512MB RAM limit na free tier
- Pro větší datasety zvažte upgrade

## 💰 Costs

- **Free tier**: $5 kredity/měsíc
- **Hobby plan**: $5/měsíc
- **Pro plan**: $20/měsíc

## 📞 Support

- Railway docs: [docs.railway.app](https://docs.railway.app)
- GitHub issues: [davidrynes/analytics](https://github.com/davidrynes/analytics)
