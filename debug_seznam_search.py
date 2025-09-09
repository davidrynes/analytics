#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Debug skript pro testování hledání na Seznam.cz
"""

import asyncio
from playwright.async_api import async_playwright
import urllib.parse

async def debug_seznam_search():
    """Debug hledání na Seznam.cz"""
    
    # Test videa z našeho vzorku
    test_videos = [
        "Jednadvacetiletá řidička škodovky zahynula na jihu Čech. Ve vraku ji našli až ráno mrtvou",
        "Rozřezával na mně oblečení. Bála jsem se, co přijde. Svědkyně popsala setkání s vraždícím primářem",
        "Posledních 32 vteřin. Nové záběry zachycují manévr polské stíhačky i tragický dopad"
    ]
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        for i, video_title in enumerate(test_videos):
            print(f"\n{'='*80}")
            print(f"🔍 TEST {i+1}: {video_title}")
            print(f"{'='*80}")
            
            # Vyhledání na Seznam.cz
            search_query = f"{video_title} site:novinky.cz"
            encoded_query = urllib.parse.quote(search_query)
            search_url = f"https://search.seznam.cz/?q={encoded_query}"
            
            print(f"🌐 Vyhledávací URL: {search_url}")
            
            try:
                await page.goto(search_url, wait_until="domcontentloaded", timeout=10000)
                await page.wait_for_timeout(2000)
                
                # Najdeme všechny odkazy na Novinky.cz
                print(f"\n🔍 Hledám odkazy na Novinky.cz...")
                
                # Zkusíme různé selektory
                selectors_to_try = [
                    "a[href*='novinky.cz']",
                    "a[href*='www.novinky.cz']", 
                    "a[href*='//novinky.cz']",
                    "[data-href*='novinky.cz']",
                    "a:has-text('novinky.cz')",
                ]
                
                for selector in selectors_to_try:
                    try:
                        links = page.locator(selector)
                        count = await links.count()
                        print(f"   Selector '{selector}': {count} odkazů")
                        
                        if count > 0:
                            print(f"   📋 První {min(count, 5)} odkazů:")
                            for j in range(min(count, 5)):
                                link = links.nth(j)
                                href = await link.get_attribute("href")
                                text = await link.text_content()
                                print(f"      {j+1}. {href}")
                                print(f"         Text: {text[:100] if text else 'N/A'}...")
                                
                                # Kontrola, jestli je to článek
                                if href and ('clanek' in href or 'video' in href):
                                    print(f"         ✅ Vypadá jako článek!")
                                else:
                                    print(f"         ❌ Nevypadá jako článek")
                            break
                                
                    except Exception as e:
                        print(f"   Chyba se selektorem '{selector}': {e}")
                        continue
                
                # Zkusíme také vyhledat podle textu
                print(f"\n🎯 Hledám podle klíčových slov z názvu...")
                key_words = video_title.split()[:5]  # Prvních 5 slov
                for word in key_words:
                    if len(word) > 3:  # Pouze delší slova
                        try:
                            word_links = page.locator(f"a:has-text('{word}')")
                            word_count = await word_links.count()
                            if word_count > 0:
                                print(f"   Slovo '{word}': {word_count} odkazů")
                        except:
                            pass
                
                print(f"\n⏸️ Čekám 3 sekundy pro ruční kontrolu...")
                await page.wait_for_timeout(3000)
                
            except Exception as e:
                print(f"❌ Chyba při vyhledávání: {e}")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(debug_seznam_search())
