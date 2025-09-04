# Playwright Skript pro Extrakci Informací z Novinky.cz

Tento skript automaticky vyhledává videa na Google a extrahuje dodatečné informace z Novinky.cz stránek.

## Co skript dělá

1. **Načte vyčištěná data** z `videa_vycistena.csv`
2. **Pro každé video vyhledá na Google** s dotazem `"název videa" site:novinky.cz`
3. **Najde odkaz na Novinky.cz** ve výsledcích vyhledávání
4. **Přejde na Novinky.cz stránku** a najde div s třídou `ogm-main-media__container`
5. **Extrahuje text** ze span s třídou `f_bJ`
6. **Uloží výsledky** do nového CSV souboru s extrahovanými informacemi

## Požadavky

- Python 3.6+
- Knihovny: `playwright`, `pandas`
- Nainstalované Playwright prohlížeče

## Instalace

```bash
# Aktivace virtuálního prostředí
source venv/bin/activate

# Instalace Playwright
pip install playwright

# Instalace Playwright prohlížečů
playwright install
```

## Použití

```bash
# Spuštění skriptu
python3 extract_video_info.py
```

## Výstup

Skript vytvoří soubor `videa_s_extrahovanymi_info.csv` s následující strukturou:

| Sloupec | Popis |
|---------|-------|
| Jméno rubriky | Název rubriky (např. Krimi, Počasí) |
| Název článku/videa | Název videa |
| Views | Počet zhlédnutí |
| Extrahované info | Informace extrahované ze span.f_bJ |
| Novinky URL | URL stránky na Novinky.cz |

## Funkce

### Automatické vyhledávání
- Používá Google s filtrem `site:novinky.cz`
- Automaticky přijímá cookies
- Čeká na načtení výsledků

### Robustní extrakce
- Hledá specifické CSS třídy
- Ošetřuje chyby a timeouty
- Průběžně ukládá výsledky

### Bezpečnost
- Náhodné čekání mezi požadavky (2-5 sekund)
- Omezení na 5 videí pro testování (lze upravit)
- Headless režim lze zapnout/vypnout

## Konfigurace

### Změna počtu videí
```python
# V main() funkci změňte:
success = await extractor.run(max_videos=10)  # Zpracuje 10 videí
```

### Headless režim
```python
# V run() metodě změňte:
browser = await p.chromium.launch(headless=True)  # Skrytý režim
```

### Čekání mezi požadavky
```python
# V process_video() metodě změňte:
await asyncio.sleep(random.uniform(1, 3))  # Kratší čekání
```

## Řešení problémů

### Google blokuje požadavky
- Zvětšete čekání mezi požadavky
- Použijte headless režim
- Přidejte User-Agent header

### Nenalezeny elementy
- Zkontrolujte, zda se změnily CSS třídy
- Přidejte delší čekání na načtení stránky
- Zkontrolujte, zda stránka není v AJAX režimu

### Timeout chyby
- Zvětšete timeout hodnoty
- Přidejte retry logiku
- Zkontrolujte síťové připojení

## Poznámky

- Skript je nastaven na testování s 5 videi
- Pro produkční použití odstraňte `max_videos` omezení
- Výsledky se ukládají průběžně každých 10 videí
- Všechny chyby jsou logovány pro debugging
