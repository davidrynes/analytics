# Skript pro zpracování Excel souboru s daty o sledovanosti videí

Tento skript zpracovává Excel soubor s daty o sledovanosti videí z Novinky.cz a vytváří vyčištěný CSV soubor.

## Co skript dělá

1. **Načte list "Název videa"** z Excel souboru
2. **Odstraní řádky začínající "- "** v prvním sloupci (Název videa)
3. **Odstraní řádky s \N** v prvním sloupci (chybějící data)
4. **Odstraní řádky s samotným znakem "-"** v prvním sloupci (prázdné názvy)
5. **Odstraní sloupce C až L** (zachová pouze první dva sloupce: Název videa a Views)
6. **Rozdělí sloupec "Název videa"** na "Jméno rubriky" a "Název článku/videa"
7. **Vyčistí názvy videí** od nechtěných uvozovek
8. **Uloží výsledek do CSV** souboru s názvem `videa_vycistena.csv`
9. **Odstraní všechny uvozovky** z výsledného CSV souboru pro čistý výstup

## Požadavky

- Python 3.6+
- Knihovny: `pandas`, `openpyxl`

## Instalace závislostí

```bash
# Vytvoření virtuálního prostředí
python3 -m venv venv

# Aktivace virtuálního prostředí
source venv/bin/activate  # Na macOS/Linux
# nebo
venv\Scripts\activate     # Na Windows

# Instalace knihoven
pip install pandas openpyxl
```

## Použití

1. Ujistěte se, že máte Excel soubor `Reporter_Novinky.cz_Sledovanost_videí_-_NOVÁ_20250818-20250824.xlsx` ve stejném adresáři
2. Aktivujte virtuální prostředí: `source venv/bin/activate`
3. Spusťte skript: `python3 process_excel.py`

## Výstup

Skript vytvoří soubor `videa_vycistena.csv` s následující strukturou:

| Sloupec | Název | Popis |
|---------|-------|-------|
| A | Jméno rubriky | Název rubriky (např. Krimi, Počasí, Evropa) |
| B | Název článku/videa | Název článku nebo videa bez rubriky |
| C | Views | Počet zhlédnutí |

## Statistiky zpracování

- **Původní tabulka**: 12,336 řádků × 12 sloupců
- **Po odstranění řádků s "- "**: 8,798 řádků × 12 sloupců
- **Po odstranění řádků s \N a "-"**: 8,796 řádků × 12 sloupců
- **Po rozdělení sloupce Název videa**: 8,796 řádků × 3 sloupce
- **Finální tabulka**: 8,796 řádků × 3 sloupce
- **Celkem odstraněno**: 3,540 problematických řádků
  - 3,538 řádků začínajících "- "
  - 2 řádky s \N nebo samotným znakem "-"

## Struktura původních sloupců

1. Název videa
2. Views
3. Dokoukanost 25 %
4. Dokoukanost 50 %
5. Dokoukanost 75 %
6. Dokoukanost 100 %
7. Dokoukanost 25 %.1
8. Dokoukanost 50 %.1
9. Dokoukanost 75 %.1
10. Dokoukanost 100 %.1
11. KP 28 (Views)
12. KP 7 (Views)

## Poznámky

- Skript automaticky detekuje řádky začínající "- " v prvním sloupci
- Výstupní CSV soubor používá UTF-8 kódování
- Indexy řádků nejsou zahrnuty ve výstupním souboru
