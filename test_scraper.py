#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testovací skript pro otestování scrapperu s jedním videem
"""

import asyncio
import pandas as pd
from extract_video_info_fast import FastVideoInfoExtractor

async def test_single_video():
    """Testuje scrapper s jedním videem pro debugging"""
    
    # Vytvoření testovacího CSV s jedním videem
    test_data = {
        'Jméno rubriky': ['Krimi'],
        'Název článku/videa': ['Nebyl důvod střílet. Bezpečnostní odborník hodnotí mrazivé video ze smrtelného zásahu policisty v Ďáblicích'],
        'Views': [397177]
    }
    
    test_df = pd.DataFrame(test_data)
    test_csv = 'test_video.csv'
    test_output = 'test_output.csv'
    
    # Uložení testovacího CSV
    test_df.to_csv(test_csv, index=False, encoding='utf-8')
    print(f"📝 Vytvořen testovací soubor: {test_csv}")
    
    # Vytvoření extraktoru
    extractor = FastVideoInfoExtractor(test_csv, test_output, max_concurrent=1)
    
    print("🚀 Spouštím test s jedním videem...")
    print("=" * 60)
    
    # Spuštění extrakce
    success = await extractor.run_concurrent()
    
    if success:
        print("=" * 60)
        print("✅ Test dokončen úspěšně!")
        
        # Zobrazení výsledků
        try:
            result_df = pd.read_csv(test_output)
            print("\n📊 Výsledky:")
            print(result_df.to_string(index=False))
        except Exception as e:
            print(f"❌ Chyba při čtení výsledků: {e}")
    else:
        print("❌ Test selhal!")

if __name__ == "__main__":
    asyncio.run(test_single_video())
