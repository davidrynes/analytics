#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Debug skript pro analýzu výsledků hledání na Seznam.cz
"""

import asyncio
from playwright.async_api import async_playwright
import urllib.parse

async def debug_seznam_results():
    """Debug skutečných výsledků na Seznam.cz"""
    
    test_video = "Posledních 32 vteřin. Nové záběry zachycují manévr polské stíhačky i tragický dopad"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        print(f"🔍 Testování: {test_video}")
        
        # Vyhledání na Seznam.cz
        search_query = f"{test_video} site:novinky.cz"
        encoded_query = urllib.parse.quote(search_query)
        search_url = f"https://search.seznam.cz/?q={encoded_query}"
        
        print(f"🌐 URL: {search_url}")
        
        try:
            await page.goto(search_url, wait_until="domcontentloaded", timeout=10000)
            await page.wait_for_timeout(3000)
            
            print(f"\n📄 Analyzuji strukturu stránky...")
            
            # Zkusíme najít skutečné výsledky hledání
            selectors_to_try = [
                # Obecné selektory pro výsledky
                "[data-dot='result']",
                ".result",
                ".search-result", 
                ".organic",
                "[data-testid='result']",
                # Seznam.cz specifické selektory
                "[data-dot='organic']",
                "[data-dot='web-result']", 
                ".ogm",
                ".ogm-result",
                # Odkazy v obsahu
                "a[href*='www.novinky.cz/clanek']",
                "a[href*='novinky.cz/clanek']",
                "a[href*='www.novinky.cz'][href*='clanek']",
                # Texty obsahující Novinky.cz
                "*:has-text('novinky.cz')",
                "*:has-text('www.novinky.cz')",
            ]
            
            found_results = False
            
            for selector in selectors_to_try:
                try:
                    elements = page.locator(selector)
                    count = await elements.count()
                    
                    if count > 0:
                        print(f"\n✅ Selector '{selector}': {count} elementů")
                        found_results = True
                        
                        for i in range(min(count, 3)):
                            element = elements.nth(i)
                            
                            # Zkusíme získat text
                            try:
                                text = await element.text_content()
                                text_preview = text[:100] if text else "N/A"
                            except:
                                text_preview = "N/A"
                            
                            # Zkusíme získat href pokud je to link
                            try:
                                href = await element.get_attribute("href")
                            except:
                                href = None
                            
                            # Zkusíme najít odkazy uvnitř elementu
                            try:
                                inner_links = element.locator("a")
                                inner_count = await inner_links.count()
                            except:
                                inner_count = 0
                            
                            print(f"   Element {i+1}:")
                            print(f"      Text: {text_preview}...")
                            print(f"      Href: {href}")
                            print(f"      Vnitřní odkazy: {inner_count}")
                            
                            # Pokud má vnitřní odkazy, podívejme se na ně
                            if inner_count > 0:
                                for j in range(min(inner_count, 2)):
                                    try:
                                        inner_link = inner_links.nth(j)
                                        inner_href = await inner_link.get_attribute("href")
                                        inner_text = await inner_link.text_content()
                                        if inner_href and 'novinky.cz' in inner_href:
                                            print(f"         🎯 Novinky link {j+1}: {inner_href}")
                                            print(f"            Text: {inner_text[:50] if inner_text else 'N/A'}...")
                                    except:
                                        pass
                        
                        # Pokud našli výsledky s tímto selektorem, ukončíme
                        if found_results and 'novinky.cz' in selector:
                            break
                            
                except Exception as e:
                    print(f"❌ Chyba se selektorem '{selector}': {e}")
                    continue
            
            if not found_results:
                print(f"\n❌ Nenašel jsem žádné výsledky!")
                print(f"📄 Obsah stránky (prvních 500 znaků):")
                content = await page.content()
                print(content[:500])
            
            # Počkáme pro manuální kontrolu
            print(f"\n⏸️ Čekám 10 sekund pro manuální kontrolu v prohlížeči...")
            await page.wait_for_timeout(10000)
            
        except Exception as e:
            print(f"❌ Chyba: {e}")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(debug_seznam_results())
