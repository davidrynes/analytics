#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Skript pro zpracování Excel souboru s daty o sledovanosti videí.
- Načte list "Název videa"
- Odstraní řádky začínající "- " v prvním sloupci
- Odstraní sloupce C až L (indexy 2-11)
- Vyčistí názvy videí od nechtěných uvozovek
- Uloží výsledek do CSV
"""

import pandas as pd
import sys
import os

def clean_video_title(title):
    """
    Vyčistí název videa od nechtěných uvozovek na začátku a konci.
    
    Args:
        title (str): Název videa
        
    Returns:
        str: Vyčištěný název videa
    """
    if isinstance(title, str):
        # Odstranění uvozovek na začátku a konci
        title = title.strip('"')
        # Odstranění uvozovek na začátku a konci (pokud jsou tam)
        if title.startswith('"') and title.endswith('"'):
            title = title[1:-1]
        return title
    return title

def process_excel_file(input_file, output_file):
    """
    Zpracuje Excel soubor podle specifikace.
    
    Args:
        input_file (str): Cesta k vstupnímu Excel souboru
        output_file (str): Cesta k výstupnímu CSV souboru
    """
    try:
        print(f"Načítám Excel soubor: {input_file}")
        
        # Načtení listu "Název videa"
        df = pd.read_excel(input_file, sheet_name='Název videa')
        
        print(f"Původní tvar tabulky: {df.shape}")
        print(f"Původní sloupce: {list(df.columns)}")
        
        # Odstranění řádků začínajících "- " v prvním sloupci
        original_rows = len(df)
        df_filtered = df[~df.iloc[:, 0].astype(str).str.startswith('- ')]
        removed_rows = original_rows - len(df_filtered)
        
        print(f"Odstraněno {removed_rows} řádků začínajících '- '")
        
        # Odstranění řádků s \N nebo samotným znakem - v prvním sloupci
        df_filtered = df_filtered[df_filtered.iloc[:, 0].astype(str) != '\\N']
        df_filtered = df_filtered[df_filtered.iloc[:, 0].astype(str) != '-']
        
        # Počítání odstraněných řádků
        final_rows = len(df_filtered)
        total_removed = original_rows - final_rows
        
        print(f"Tvar tabulky po filtrování: {df_filtered.shape}")
        print(f"Celkem odstraněno {total_removed} problematických řádků")
        
        # Filtrování videí s Views >= 1000
        print("Filtruji videa s Views >= 1000...")
        df_filtered = df_filtered[df_filtered['Views'] >= 1000].copy()
        print(f"Po filtrování Views >= 1000: {len(df_filtered)} řádků")
        
        # Zachováme sloupce A, B a G, H, I, J (dokoukanost)
        # Sloupce: A (0), B (1), G (6), H (7), I (8), J (9)
        columns_to_keep = [0, 1, 6, 7, 8, 9]
        df_final = df_filtered.iloc[:, columns_to_keep]
        
        print(f"Tvar tabulky po výběru sloupců: {df_final.shape}")
        print(f"Zachované sloupce: {list(df_final.columns)}")
        
        # Rozdělení sloupce "Název videa" na "Jméno rubriky" a "Název článku/videa"
        print("Rozděluji sloupec Název videa na Jméno rubriky a Název článku/videa...")
        
        # Vytvoření nových sloupců
        df_final['Jméno rubriky'] = df_final.iloc[:, 0].str.split(' - ', n=1).str[0]
        df_final['Název článku/videa'] = df_final.iloc[:, 0].str.split(' - ', n=1).str[1]
        
        # Přejmenování sloupců dokoukanosti
        df_final = df_final.rename(columns={
            df_final.columns[2]: 'Dokoukanost do 25 %',
            df_final.columns[3]: 'Dokoukanost do 50 %', 
            df_final.columns[4]: 'Dokoukanost do 75 %',
            df_final.columns[5]: 'Dokoukanost do 100 %'
        })
        
        # Přesunutí sloupců do správného pořadí
        df_final = df_final[['Jméno rubriky', 'Název článku/videa', 'Views', 
                            'Dokoukanost do 25 %', 'Dokoukanost do 50 %', 
                            'Dokoukanost do 75 %', 'Dokoukanost do 100 %']]
        
        print(f"Tvar tabulky po rozdělení: {df_final.shape}")
        print(f"Nové sloupce: {list(df_final.columns)}")
        
        # Vyčištění názvů videí od nechtěných uvozovek
        df_final.iloc[:, 1] = df_final.iloc[:, 1].apply(clean_video_title)
        
        print("Názvy videí vyčištěny od nechtěných uvozovek")
        
        # Uložení do CSV se středníkem jako separátorem
        df_final.to_csv(output_file, index=False, encoding='utf-8', sep=';', quoting=1)  # sep=';', quoting=1 = QUOTE_MINIMAL
        
        print(f"Data úspěšně uložena do: {output_file}")
        print(f"Finální tvar tabulky: {df_final.shape}")
        
        # Odstranění nechtěných uvozovek z CSV souboru
        print("Odstraňuji nechtěné uvozovky z CSV souboru...")
        
        # Načtení CSV souboru jako text
        with open(output_file, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # Odstranění všech uvozovek z obsahu
        content = content.replace('"', '')
        
        # Uložení vyčištěného obsahu
        with open(output_file, 'w', encoding='utf-8') as file:
            file.write(content)
        
        print("Všechny uvozovky odstraněny z CSV souboru")
        
        # Zobrazení prvních několika řádků pro kontrolu
        print("\nPrvních 5 řádků výsledné tabulky:")
        print(df_final.head())
        
    except FileNotFoundError:
        print(f"Chyba: Soubor {input_file} nebyl nalezen.")
        sys.exit(1)
    except Exception as e:
        print(f"Chyba při zpracování: {str(e)}")
        sys.exit(1)

def main():
    """Hlavní funkce skriptu."""
    # Název vstupního souboru
    input_file = "Reporter_Novinky.cz_Sledovanost_videiÌ_-_NOVAÌ_20250825-20250831.xlsx"
    
    # Název výstupního souboru
    output_file = "/Users/david.rynes/Desktop/_DESKTOP/_CODE/statistiky/datasets/20250904T202854_cc5944cd/clean.csv"
    
    # Kontrola existence vstupního souboru
    if not os.path.exists(input_file):
        print(f"Chyba: Vstupní soubor {input_file} neexistuje.")
        print("Ujistěte se, že jste ve správném adresáři a soubor existuje.")
        sys.exit(1)
    
    print("=" * 60)
    print("SKRIPT PRO ZPRACOVÁNÍ EXCEL SOUBORU")
    print("=" * 60)
    
    # Zpracování souboru
    process_excel_file(input_file, output_file)
    
    print("\n" + "=" * 60)
    print("ZPRACOVÁNÍ DOKONČENO ÚSPĚŠNĚ")
    print("=" * 60)

if __name__ == "__main__":
    main()
