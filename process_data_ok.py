#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Skript pro zpracování data-ok.csv souboru.
- Načte data-ok.csv
- Zpracuje pouze vybraná data
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

def process_data_ok_file(input_file, output_file):
    """
    Zpracuje data-ok.csv soubor.
    
    Args:
        input_file (str): Cesta k vstupnímu CSV souboru
        output_file (str): Cesta k výstupnímu CSV souboru
    """
    try:
        print(f"Načítám data-ok soubor: {input_file}")
        
        # Načtení CSV souboru
        df = pd.read_csv(input_file, sep=';')
        
        print(f"Původní tvar tabulky: {df.shape}")
        print(f"Původní sloupce: {list(df.columns)}")
        
        # Zachováme sloupce A, B a G, H, I, J (dokoukanost)
        # Sloupce: A (0), B (1), G (6), H (7), I (8), J (9)
        columns_to_keep = [0, 1, 6, 7, 8, 9]
        df_final = df.iloc[:, columns_to_keep]
        
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
        
        # Uložení do CSV s minimálními uvozovkami
        df_final.to_csv(output_file, index=False, encoding='utf-8', quoting=1)  # quoting=1 = QUOTE_MINIMAL
        
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
    input_file = "oprava_dat/data-ok.csv"
    
    # Název výstupního souboru
    output_file = "oprava_dat/data-ok-processed.csv"
    
    # Kontrola existence vstupního souboru
    if not os.path.exists(input_file):
        print(f"Chyba: Vstupní soubor {input_file} neexistuje.")
        print("Ujistěte se, že jste ve správném adresáři a soubor existuje.")
        sys.exit(1)
    
    print("=" * 60)
    print("SKRIPT PRO ZPRACOVÁNÍ DATA-OK.CSV")
    print("=" * 60)
    
    # Zpracování souboru
    process_data_ok_file(input_file, output_file)
    
    print("\n" + "=" * 60)
    print("ZPRACOVÁNÍ DOKONČENO ÚSPĚŠNĚ")
    print("=" * 60)

if __name__ == "__main__":
    main()

